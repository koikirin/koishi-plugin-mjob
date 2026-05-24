import { Context, defineProperty, Disposable, Logger, Schema, Time } from 'koishi'
import { Progress as BaseProgress, clone, Watchable, Watcher } from '@hieuzest/koishi-plugin-mjob'
import { Player, TziakchaProvider } from '.'
import { agari2Str, parseCfgTimeLimit, parseRecord } from './utils'

/**
 * WaitingWatcher: placeholder created when a room is detected in the lobby.
 * It does not poll — it just holds room info until matched to a real game.
 */
export class TziakchaWaitingWatcher extends Watcher<typeof TziakchaProvider.provider, Player> {
  declare type: typeof TziakchaProvider.provider
  room: TziakchaWaitingWatcher.RoomInfo

  logger: Logger
  ctx: Context

  constructor(provider: TziakchaProvider, watchable: Watchable<typeof TziakchaProvider.provider, Player>, payload?: any, id?: string) {
    super(watchable, payload, id)
    this.ctx = provider.ctx
    this.logger = new Logger(`mjob.tziakcha.wait:${this.id}`, defineProperty({}, 'ctx', this.ctx))
    this.room = payload?.room
    this.status = 'waiting'
  }

  connect() {
    // No-op: waiting watchers don't actively connect
  }

  close() {
    this.closed = true
  }

  dump() {
    return undefined // Waiting watchers are not persisted
  }
}

export namespace TziakchaWaitingWatcher {
  export interface RoomInfo {
    id: number
    title: string
    rd_cnt: number
    players: { name: string }[]
    start_time: number
    create_time: number
  }
}

/**
 * TziakchaWatcher: real game watcher that polls HTTP API for round progress.
 *
 * Flow:
 * 1. Poll `_qry/game/?id=<gameId>` to detect round advancement (progress field)
 * 2. When a new round is detected, fetch `_qry/record/` with the round's record ID
 * 3. Parse the record (base64+zlib→JSON), extract agari/ryuukyoku info
 * 4. Emit mjob/progress events
 * 5. When all rounds finished (or time limit exceeded), emit mjob/finish
 */
export class TziakchaWatcher extends Watcher<typeof TziakchaProvider.provider, Player> {
  declare type: typeof TziakchaProvider.provider
  gameStatus: TziakchaWatcher.GameStatus

  logger: Logger
  ctx: Context

  gameId: string
  room?: TziakchaWaitingWatcher.RoomInfo
  roomKey?: string

  #pollTimer: Disposable
  #lastProgress: number = -1
  #retries: number = 0
  #periods: number = 0
  #timeLimit: number = 0
  #lastUpdateTime: number = 0

  constructor(provider: TziakchaProvider, watchable: Watchable<typeof TziakchaProvider.provider, Player>, payload?: any, id?: string) {
    super(watchable, payload, id)
    this.ctx = provider.ctx
    this.logger = new Logger(`mjob.tziakcha:${this.id}`, defineProperty({}, 'ctx', this.ctx))
    this.gameId = payload?.gameId ?? this.watchId
    this.room = payload?.room
    this.roomKey = payload?.roomKey
    this.#lastProgress = payload?.lastProgress ?? -1
    this.gameStatus = new TziakchaWatcher.GameStatus({ rndIdx: -1 })
  }

  async connect() {
    this.logger.info(`Start polling game ${this.gameId}`)
    this.#lastUpdateTime = Date.now()
    this.#poll()
  }

  close() {
    this.closed = true
    this.#pollTimer?.()
    this.#pollTimer = null
  }

  async #poll() {
    if (this.closed || this.finished) return

    try {
      const updated = await this.#updateStatus()
      if (updated) {
        this.#lastUpdateTime = Date.now()
        this.#retries = 0
        this.status = 'playing'

        // Fetch the round record
        const record = await this.#fetchRound()
        if (record) {
          if (this.#lastProgress !== this.gameStatus.rndIdx) {
            this.#lastProgress = this.gameStatus.rndIdx
            await this.#onProgress(record)
          }

          // Check if game finished
          if (this.#isFinished()) {
            await this.#finish(this.players, 'finished')
            return
          }
        }
      }

      // Check for timeout
      if (Date.now() - this.#lastUpdateTime > this.provider.config.matchCheckTime) {
        await this.#error('No update for too long, match may be suspended')
        return
      }
    } catch (e) {
      this.#retries++
      this.logger.warn(`Poll error (retry ${this.#retries}):`, e)
      if (this.#retries > this.provider.config.maxRetries) {
        await this.#error('Exceeded max retries')
        return
      }
    }

    // Schedule next poll
    if (!this.closed && !this.finished) {
      const interval = Object.keys(this.subscribers || {}).length
        ? this.provider.config.pollInterval
        : this.provider.config.pollIntervalIdle
      this.#pollTimer = this.ctx.setTimeout(() => this.#poll(), interval)
    }
  }

  async #updateStatus(): Promise<boolean> {
    const data = await this.provider.fetchGame(this.gameId)
    this.logger.debug(`[updateStatus] game=${this.gameId} progress=${data.progress} periods=${data.periods} current=${this.gameStatus.rndIdx}`)

    const progress = data.progress
    if (progress === undefined || progress === this.gameStatus.rndIdx) {
      return false
    }

    this.#periods = data.periods ?? 0
    this.gameStatus.rndIdx = progress
    this.#timeLimit = data.cfg ? parseCfgTimeLimit(data.cfg) : 0

    // Extract current record ID from records array
    if (data.records?.length > progress) {
      this.gameStatus.currentRecordId = data.records[progress]?.i
    }
    this.logger.debug(`[updateStatus] recordId=${this.gameStatus.currentRecordId} periods=${this.#periods} timeLimit=${this.#timeLimit}`)

    // Update players from game data
    this.players = (data.players || []).filter((p: any) => p?.n).map((p: any) =>
      Object.assign(p.n, {
        name: p.n,
        uid: p.i ? String(p.i) : undefined,
        score: p.s ?? 0,
      } as Player),
    )

    // Store timing
    this.gameStatus.startTime = data.start_time
    this.gameStatus.finishTime = data.finish_time

    return true
  }

  async #fetchRound(): Promise<any> {
    const recordId = this.gameStatus.currentRecordId
    if (!recordId) {
      this.logger.debug(`[fetchRound] No record ID for rndIdx=${this.gameStatus.rndIdx}`)
      return null
    }

    this.logger.debug(`[fetchRound] Fetching record ${recordId}`)
    const data = await this.provider.fetchRecord(String(recordId))
    if (!data?.script) {
      this.logger.debug(`[fetchRound] No script in response`)
      return null
    }
    const record = parseRecord(data.script)
    this.logger.debug(`[fetchRound] Parsed record: b=${record.b} players=${record.p?.map((p: any) => p.n).join(',')} scores=${record.s}`)
    return record
  }

  #isFinished(): boolean {
    // All rounds completed
    if (this.#periods > 0 && this.gameStatus.rndIdx >= this.#periods - 1) return true
    // Time limit exceeded
    if (this.#timeLimit && this.gameStatus.startTime && this.gameStatus.finishTime) {
      const timeUsed = this.gameStatus.finishTime - this.gameStatus.startTime
      if (timeUsed >= this.#timeLimit * 60 * 1000) return true
    }
    return false
  }

  async #onProgress(record: any) {
    try {
      const b: number = record.b ?? 0
      const yakuData: any[] = record.y  // per-seat agari details
      const kazes = ['东', '南', '西', '北']
      const fieldKaze = kazes[Math.floor(this.gameStatus.rndIdx / 4)] ?? '?'
      const kyokuKaze = kazes[this.gameStatus.rndIdx % 4] ?? '?'
      const statusStr = `${fieldKaze}风${kyokuKaze}`

      // Map record player data back to our players by uid
      if (record.p) {
        for (let i = 0; i < record.p.length; i++) {
          const rp = record.p[i]
          const uid = rp.i ? String(rp.i) : undefined
          for (const player of this.players) {
            if (uid && player.uid === uid) {
              player.dscore = record.s?.[i] ?? 0
              player.gscore = record.n?.[i] ?? 0
              break
            } else if (!uid && player.name === rp.n) {
              player.dscore = record.s?.[i] ?? 0
              player.gscore = record.n?.[i] ?? 0
              break
            }
          }
        }
      }

      const winBits = b & 0xf  // low 4 bits: who won (bitmask)
      this.logger.debug(`[onProgress] rndIdx=${this.gameStatus.rndIdx} b=0x${b.toString(16)} winBits=${winBits} players=${this.players.map(p => `${p.name}:${p.score}(d${p.dscore})`).join(' ')}`)
      if (winBits) {
        // Agari (win) — find the winner seat from bit field
        let who = -1, fromWho = -1
        for (let i = 0; i < 4; i++) {
          if (b & (1 << i)) who = i
          if (b & (1 << (i + 4))) fromWho = i
        }
        const isTsumo = who === fromWho || fromWho < 0

        // Get agari details from y[who]
        const agari = yakuData?.[who]
        const fan = agari?.f ?? 0

        // Map seat index to player
        const winnerPlayer = this.#seatToPlayer(record, who)
        const loserPlayer = !isTsumo ? this.#seatToPlayer(record, fromWho) : null

        let details = ''
        if (winnerPlayer) {
          details += `${winnerPlayer.name} `
          if (isTsumo) {
            details += `自摸 `
          } else if (loserPlayer) {
            details += `点和 ${loserPlayer.name} `
          }
          details += `${fan}番\n`
        }

        if (agari) {
          try {
            details += agari2Str(agari)
          } catch (e) {
            this.logger.warn('agari2Str failed:', e)
          }
        }

        await this.ctx.parallel('mjob/progress', this, {
          event: 'round-end',
          status: statusStr,
          players: clone(this.players),
          details: details.trimEnd(),
        } as TziakchaWatcher.Progress)
      } else {
        // Ryuukyoku (draw)
        await this.ctx.parallel('mjob/progress', this, {
          event: 'round-end',
          status: statusStr,
          players: clone(this.players),
          details: '流局',
        } as TziakchaWatcher.Progress)
      }
    } catch (e) {
      this.logger.warn('onProgress error:', e)
    }
  }

  // Map a seat index (0-3) in the record to one of our Player objects
  #seatToPlayer(record: any, seat: number): Player | undefined {
    if (!record.p?.[seat]) return undefined
    const uid = record.p[seat].i ? String(record.p[seat].i) : undefined
    const name = record.p[seat].n
    for (const player of this.players) {
      if (uid && player.uid === uid) return player
      if (!uid && player.name === name) return player
    }
    return undefined
  }

  async #finish(players: Player[], finalStatus: Watcher.Status) {
    if (this.finished) return
    if (finalStatus === 'finished') this.closed = true
    this.status = finalStatus
    this.logger.info('Finish', this.gameId, players.map(p => `${p.name} ${p.score}`).join(' '))
    await this.ctx.parallel('mjob/finish', this, players)
  }

  async #error(err?: any) {
    this.closed = true
    this.status = 'error'
    if (err) this.logger.warn(err)
    await this.ctx.parallel('mjob/error', this, err)
  }

  dump(): TziakchaProvider.WatcherDump {
    if (this.finished) return
    return {
      id: this.id,
      watchId: this.watchId,
      gameId: this.gameId,
      room: this.room,
      payload: {
        lastProgress: this.#lastProgress,
        roomKey: this.roomKey,
      },
    }
  }

  static restore(provider: TziakchaProvider, data: TziakchaProvider.WatcherDump): TziakchaWatcher {
    const watcher = new TziakchaWatcher(provider, {
      type: TziakchaProvider.provider,
      provider,
      watchId: data.watchId,
      players: [],
    }, {
      gameId: data.gameId,
      room: data.room,
      lastProgress: data.payload?.lastProgress ?? -1,
      roomKey: data.payload?.roomKey,
    }, data.id)
    return watcher
  }
}

export namespace TziakchaWatcher {
  export class GameStatus {
    rndIdx: number
    currentRecordId?: string
    startTime?: number
    finishTime?: number

    constructor(fields: Partial<GameStatus> = {}) {
      Object.assign(this, fields)
    }

    toString() {
      const kazes = ['东', '南', '西', '北']
      const fieldKaze = kazes[Math.floor(this.rndIdx / 4)] ?? '?'
      const kyokuKaze = kazes[this.rndIdx % 4] ?? '?'
      return `${fieldKaze}风${kyokuKaze}`
    }
  }

  export interface Progress extends BaseProgress {
    status: string
    players: Player[]
    raw?: any
    details?: string
  }

  export interface Config {
    pollInterval: number
    pollIntervalIdle: number
    maxRetries: number
  }

  export const Config: Schema<Config> = Schema.object({
    pollInterval: Schema.natural().role('ms').default(15 * Time.second).description('Poll interval when subscribers exist'),
    pollIntervalIdle: Schema.natural().role('ms').default(30 * Time.second).description('Poll interval when no subscribers'),
    maxRetries: Schema.natural().default(30),
  })
}
