import { Context, defineProperty, Dict, Disposable, Logger, Schema, Time } from 'koishi'
import { Progress as BaseProgress, clone, ProgressEvents, Watchable, Watcher } from '@hieuzest/koishi-plugin-mjob'
import { Document, Player, TenhouProvider } from '.'
import { agari2Str } from './utils'

export class TenhouWatcher extends Watcher<typeof TenhouProvider.provider, Player> {
  declare type: typeof TenhouProvider.provider
  declare document: Document
  gameStatus: TenhouWatcher.GameStatus

  logger: Logger
  ctx: Context
  #ws: WebSocket
  #connectRetries: number
  #heartbeat: Disposable
  #num: number

  constructor(provider: TenhouProvider, watchable: Watchable<typeof TenhouProvider.provider, Player>, payload?: any, id?: string) {
    super(watchable, payload, id)
    this.ctx = provider.ctx
    this.logger = new Logger(`mjob.tenhou:${this.id}`, defineProperty({}, 'ctx', this.ctx))
    this.#connectRetries = 0
    this.#num = this.document?.info?.playernum
  }

  close(): void {
    this.closed = true
    if (this.#ws) try { this.#ws.close() } catch { }
    this.#ws = null
  }

  async #connect() {
    if (this.finished) return

    if (this.#ws) this.#ws.close()
    this.#ws = this.ctx.http.ws(this.provider.config.obUri, {
      headers: {
        Origin: 'https://tenhou.net',
      },
    })
    this.#ws.addEventListener('message', this.#receive.bind(this))
    this.#ws.addEventListener('error', (e: ErrorEvent) => {
      this.logger.warn(e)
      try { this.#ws?.close() } finally { this.#ws = null }
    })
    this.#ws.addEventListener('close', () => {
      try { this.#ws?.close() } finally { this.#ws = null }
      if (this.finished) return
      this.#connectRetries += 1
      this.logger.info(`Connection closed. will reconnect... (${this.#connectRetries})`)
      if (this.#connectRetries > this.provider.config.reconnectTimes) {
        this.#error('Exceed max retries')
      } else setTimeout(this.connect.bind(this), this.provider.config.reconnectInterval)
    })
    this.#ws.addEventListener('open', () => {
      this.#ws.send(JSON.stringify({
        tag: 'HELO',
        name: 'NoName',
        sx: 'M',
      }))

      this.#ws.send(JSON.stringify({
        tag: 'WG',
        id: this.watchId,
        tw: 0,
      }))

      this.#ws.send(JSON.stringify({
        tag: 'GOK',
      }))

      this.#heartbeat?.()
      this.#heartbeat = this.ctx.setInterval(() => {
        if (this.closed || !this.#ws) {
          this.#heartbeat?.()
          this.#heartbeat = null
        } else {
          try {
            this.#ws.send('<Z/>')
          } catch (e) {
            this.logger.warn(e, this.watchId)
            this.#heartbeat?.()
            this.#heartbeat = null
          }
        }
      }, 3000)
    })
  }

  async connect() {
    try {
      await this.#connect()
    } catch (e) {
      this.logger.warn(e, this.watchId)
    }
  }

  async #receive({ data }: MessageEvent) {
    const m: {
      tag: string
      childNodes?: Dict[]
    } & Dict = JSON.parse(data)
    this.logger.debug(m)

    if (m.tag === 'UN') {
      this.players = []
      for (const i of Array((m.dan as string).split(',').length).keys()) {
        if (!m[`n${i}`]) continue
        this.players.push(Object.assign(decodeURIComponent(m[`n${i}`]), {
          name: decodeURI(m[`n${i}`]),
          dan: m.dan.split(',')[i],
          rate: Number(m.rate.split(',')[i]),
        }))
      }
      this.#num = this.players.length
      this.logger.debug('Start, Users', this.players)
      this.#progress('match-start', m, clone(this.gameStatus), clone(this.players))
    } else if (['WGC', 'INITBYLOG'].includes(m.tag)) {
      for (const node of m.childNodes) {
        if (node.tag === 'INIT') {
          // round-start
          this.status = 'playing'
          const seed: string[] = node.seed.split(','), nums: string[] = node.ten.split(',')
          this.gameStatus = new TenhouWatcher.GameStatus({
            oya: Number(node.oya),
            kyoku: Number(seed[0]),
            honba: Number(seed[1]),
            riichi: Number(seed[2]),
          })
          for (const i of Array(this.#num).keys()) {
            this.players[i].point = Number(nums[i])
          }
          this.#progress('round-start', node, clone(this.gameStatus), clone(this.players))
        } else if (['AGARI', 'RYUUKYOKU'].includes(node.tag)) {
          const nums: string[] = node.sc.split(',')
          for (const i of Array(this.#num).keys()) {
            this.players[i].point = Number(nums[i * 2]) + Number(nums[i * 2 + 1])
            this.players[i].dpoint = Number(nums[i * 2 + 1])
          }

          await this.#progress('round-end', node, clone(this.gameStatus), clone(this.players))
          if (node.owari) {
            // match-end

            const nums: string[] = node.owari.split(',')
            for (const i of Array(this.#num).keys()) {
              this.players[i].point = Number(nums[i * 2])
              this.players[i].score = Number(nums[i * 2 + 1])
            }

            this.#finish(this.players, 'finished')
          }
        }
      }
    } else if (m.tag === 'ERR') {
      this.#error()
    } else if (['SHUFFLE', 'HELO', 'LN', 'GO', 'KANSEN'].includes(m.tag)) {
      ;
    }
  }

  async #progress(event: ProgressEvents, data: Dict, status: TenhouWatcher.GameStatus, players: Player[]) {
    this.logger.debug('Progress', this.watchId, status, players)

    if (data.tag === 'AGARI') {
      const action = players[Number(data.who)].name
        + ((data.fromWho === data.who) ? ' ツモ ' : ` ロン ${players[Number(data.fromWho)].name} `)
        + data.ten.split(',')[1]
      const agariStr = agari2Str(data).trimEnd()

      await this.ctx.parallel('mjob/progress', this, {
        event, raw: data, status, players, details: action + '\n' + agariStr,
      } as TenhouWatcher.Progress).catch(e => this.logger.warn(e))
    } else if (data.tag === 'RYUUKYOKU') {
      const action = '流局'
      await this.ctx.parallel('mjob/progress', this, {
        event, raw: data, status, players, details: action,
      } as TenhouWatcher.Progress).catch(e => this.logger.warn(e))
    } else {
      await this.ctx.parallel('mjob/progress', this, {
        event, raw: data, status, players,
      } as TenhouWatcher.Progress).catch(e => this.logger.warn(e))
    }
  }

  async #finish(players: Player[], finalStatus: Watcher.Status) {
    if (this.finished) return
    if (finalStatus === 'finished') this.closed = true
    this.status = finalStatus
    this.logger.info('Finish', this.watchId, players)
    await this.ctx.parallel('mjob/finish', this, players).catch(e => this.logger.warn(e))
  }

  async #error(err?: any) {
    this.closed = true
    this.status = 'error'
    if (err) this.logger.warn(err)
    await this.ctx.parallel('mjob/error', this).catch(e => this.logger.warn(e))
  }

  dump(): TenhouProvider.WatcherDump {
    if (this.finished) return
    return {
      id: this.id,
      watchId: this.watchId,
      document: this.document,
    }
  }

  static restore(provider: TenhouProvider, data: TenhouProvider.WatcherDump): TenhouWatcher {
    const watcher = new TenhouWatcher(provider, {
      type: TenhouProvider.provider,
      provider,
      watchId: data.watchId,
      players: data.document?.players?.map(p =>
        Object.assign(p.name, {
          name: p.name,
        })) || [],
    }, { document: data.document, ...(data.payload || {}) }, data.id)
    return watcher
  }
}

export namespace TenhouWatcher {
  export interface GameStatus {
    oya: number
    kyoku: number
    honba: number
    riichi: number
  }

  export class GameStatus {
    constructor(fields: GameStatus) {
      Object.assign(this, fields)
    }

    toString() {
      const kaze = this.kyoku < 4 ? '東' : this.kyoku < 8 ? '南' : '西'
      return `${kaze}${this.kyoku % 4 + 1}局 ${this.honba}本場`
    }
  }

  export interface Progress extends BaseProgress {
    status: GameStatus
    players: Player[]
    raw?: any
    details?: string
  }

  export interface Config {
    obUri: string
    reconnectInterval: number
    reconnectTimes: number
  }

  export const Config: Schema<Config> = Schema.object({
    obUri: Schema.string().default('wss://b-ww.mjv.jp/'),
    reconnectInterval: Schema.natural().role('ms').default(20 * Time.second),
    reconnectTimes: Schema.natural().default(5),
  })
}
