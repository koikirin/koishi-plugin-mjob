import { Context, Schema, Time } from 'koishi'
import { Player as BasePlayer, WatcherDump as BaseWatcherDump, Provider, Watchable } from '@hieuzest/koishi-plugin-mjob'
import { } from '@hieuzest/koishi-plugin-scheduler'
import { } from '@hieuzest/koishi-plugin-mjob-fid'
import { TziakchaWaitingWatcher, TziakchaWatcher } from './watcher'
import { TziakchaCommands } from './commands'

// Import tclobby service type
import { } from '@hieuzest/koishi-plugin-tcpt'

declare module '@hieuzest/koishi-plugin-mjob' {
  namespace Mjob {
    interface Providers {
      tziakcha: TziakchaProvider
    }
  }
}

export class TziakchaProvider extends Provider {
  static provider: 'tziakcha' = 'tziakcha'
  static inject = {
    required: ['mjob', 'scheduler', 'tclobby'],
    optional: ['mjob.$fid'],
  }

  // Map of waiting watchers: roomKey -> WaitingWatcher
  waitingWatchers: Map<string, TziakchaWaitingWatcher> = new Map()
  // Set of roomKeys that have already been promoted to real watchers (avoid re-detection)
  #matchedRoomKeys: Set<string> = new Set()

  constructor(public ctx: Context, public config: TziakchaProvider.Config) {
    super(ctx, TziakchaProvider.provider)

    ctx.i18n.define('zh', require('./locales/zh'))

    ctx.plugin(TziakchaCommands)

    if (config.updateWatchInterval) {
      ctx.scheduler.every(config.updateWatchInterval, () => this.update())
    }

    ctx.command('mjob.tziakcha.watch <id:string>')
      .action(async ({ session }, id) => {
        const watcher = new TziakchaWatcher(this, {
          type: TziakchaProvider.provider,
          provider: this,
          watchId: id,
          players: [],
        })
        this.submit(watcher)
        return session.text('mjob.general.success')
      })
  }

  // Phase 1: Detect rooms from lobby that match subscribed players
  async #checkRooms() {
    const lobby = this.ctx.tclobby
    if (!lobby) return

    const curtime = Date.now()

    for (const [id, room] of Object.entries(lobby.rooms)) {
      // Only care about rooms that have started playing
      if (!room.start_time) continue
      // Skip rooms that are too old
      if (curtime - room.start_time > this.config.roomCheckTime) continue

      const roomKey = `${room.create_time}.${id}`

      // Skip if already known
      if (this.waitingWatchers.has(roomKey)) continue
      if (this.#matchedRoomKeys.has(roomKey)) continue

      this.ctx.logger.debug(`[checkRooms] Scanning room ${roomKey}: ${room.title} (${room.players?.map(p => p?.name).join(', ')})`)

      const players = room.players
        .filter(p => p?.name)
        .map(p => Object.assign(p.name, { name: p.name }))

      if (!players.length) continue

      // Build a watchable to check subscriptions
      const watchable: Watchable = {
        type: this.key,
        provider: this,
        watchId: roomKey,
        players,
      }

      // Ask subscription service if anyone cares about these players
      if (await this.ctx.serial('mjob/attach', [watchable], TziakchaProvider.provider)) continue
      if (watchable.decision !== 'approved') continue

      // Create a waiting watcher — just hold state, don't emit watch event yet
      const waiting = new TziakchaWaitingWatcher(this, {
        type: TziakchaProvider.provider,
        provider: this,
        watchId: roomKey,
        players,
      }, {
        room: {
          id: Number(id),
          title: room.title,
          rd_cnt: room.rd_cnt,
          players: room.players.filter(p => p?.name).map(p => ({ name: p.name })),
          start_time: room.start_time,
          create_time: room.create_time,
        },
        subscribers: watchable.subscribers,
      })

      this.waitingWatchers.set(roomKey, waiting)
      this.ctx.logger.info(`Room detected: ${room.title} (${players.map(p => p.name).join(', ')}), waiting for game match...`)
    }
  }

  // Phase 2: Match waiting watchers to actual games via HTTP API
  async #matchGames() {
    if (!this.waitingWatchers.size) return

    const curtime = Date.now()

    // Fetch recent game history
    let games: any[]
    try {
      const page = await this.#fetchHistoryPage(0)
      games = page?.games || []
      this.ctx.logger.debug(`[matchGames] Fetched ${games.length} games from history, waiting: ${this.waitingWatchers.size}`)
      this.ctx.logger.debug(`[matchGames] Games: ${games.map(g => `${g.id} (${g.title}, ${g.players?.map(p => p.n).join(', ')})`).join('; ')}`)
    } catch (e) {
      this.ctx.logger.warn('Failed to fetch history:', e)
      return
    }

    for (const [roomKey, waiting] of this.waitingWatchers) {
      // Timeout waiting watchers
      if (curtime - (waiting.room.start_time || 0) > this.config.matchCheckTime) {
        this.ctx.logger.info(`Waiting watcher timed out: ${roomKey}`)
        this.waitingWatchers.delete(roomKey)
        waiting.status = 'error'
        waiting.closed = true
        continue
      }

      // Try to match against fetched games
      let matched = false
      for (const game of games) {
        if (!this.#matchRoomToGame(waiting, game)) continue

        const gameId = String(game.id)
        this.ctx.logger.info(`Matched room ${roomKey} -> game ${gameId}`)

        // Check if a real watcher already exists for this game
        if (this.ctx.mjob.watchers.has(`${this.key}:${gameId}`)) {
          this.ctx.logger.debug(`[matchGames] Watcher for game ${gameId} already exists, skip`)
          this.waitingWatchers.delete(roomKey)
          this.#matchedRoomKeys.add(roomKey)
          matched = true
          break
        }

        // Create the real watcher
        const watcher = new TziakchaWatcher(this, {
          type: TziakchaProvider.provider,
          provider: this,
          watchId: gameId,
          players: waiting.players,
        }, {
          gameId: game.id,
          room: waiting.room,
          roomKey,
          subscribers: waiting.subscribers,
        })

        if (await this.ctx.serial('mjob/before-watch', watcher)) {
          this.ctx.logger.debug(`[matchGames] before-watch rejected game ${gameId}`)
          continue
        }

        // Now emit watch event and submit
        await this.ctx.parallel('mjob/watch', watcher)

        if (this.ctx.mjob.watchers.has(watcher.wid)) {
          this.ctx.logger.debug(`[matchGames] Watcher ${watcher.wid} appeared during watch event, skip submit`)
          this.waitingWatchers.delete(roomKey)
          this.#matchedRoomKeys.add(roomKey)
          matched = true
          break
        }

        if (this.submit(watcher)) {
          watcher.logger.info(`Watch game ${gameId}`)
          this.waitingWatchers.delete(roomKey)
          this.#matchedRoomKeys.add(roomKey)
          matched = true
        } else {
          this.ctx.logger.warn(`[matchGames] Failed to submit watcher for game ${gameId}`)
        }
        break
      }

      if (!matched) {
        this.ctx.logger.debug(`[matchGames] No match found for room ${waiting.room.title} (title=${waiting.room.title}, players=${waiting.room.players.map(p => p.name).join(',')})`)
      }
    }

    // Cleanup old matched room keys
    for (const key of this.#matchedRoomKeys) {
      const createTime = Number(key.split('.')[0])
      if (curtime - createTime > this.config.matchCheckTime * 2) {
        this.#matchedRoomKeys.delete(key)
      }
    }
  }

  #matchRoomToGame(waiting: TziakchaWaitingWatcher, game: any): boolean {
    // Compare title
    if (waiting.room.title !== game.title) return false

    this.ctx.logger.debug(`[matchRoomToGame] Comparing room ${waiting.room.title} with game ${game.id}: title matches, comparing players...`)

    // Compare player names (sorted)
    const roomPlayers = waiting.room.players.map(p => p.name).sort()
    const gamePlayers: string[] = []
    for (const p of (game.players || [])) {
      if (p?.n) gamePlayers.push(p.n)
    }
    gamePlayers.sort()

    if (roomPlayers.length !== gamePlayers.length) return false
    for (let i = 0; i < roomPlayers.length; i++) {
      if (roomPlayers[i] !== gamePlayers[i]) return false
    }

    this.ctx.logger.debug(`[matchRoomToGame] Players match for room ${waiting.room.title} and game ${game.id}, comparing start time...`)

    // Compare start time (within jitter)
    const roomTime = waiting.room.start_time
    const gameTime = game.start_time
    if (Math.abs(roomTime - gameTime) > this.config.matchJitterTime) return false

    this.ctx.logger.debug(`[matchRoomToGame] Start time matches for room ${waiting.room.title} and game ${game.id}, matched!`)

    return true
  }

  async #fetchHistoryPage(page: number): Promise<any> {
    return this.ctx.http.post(`${this.config.apiBase}/_qry/history/`, { p: page }, {
      headers: {
        Referer: `${this.config.apiBase}/history/`,
        Origin: this.config.apiBase,
      },
    })
  }

  async fetchGame(gameId: string): Promise<any> {
    return this.ctx.http.post(`${this.config.apiBase}/_qry/game/?id=${gameId}`, {}, {
      headers: {
        Referer: `${this.config.apiBase}/game/?id=${gameId}`,
        Origin: this.config.apiBase,
      },
    })
  }

  async fetchRecord(recordId: string): Promise<any> {
    return this.ctx.http.post(`${this.config.apiBase}/_qry/record/`, { id: recordId }, {
      headers: {
        Referer: `${this.config.apiBase}/record/?id=${recordId}`,
        Origin: this.config.apiBase,
      },
    })
  }

  async #update() {
    const lobby = this.ctx.tclobby
    const roomCount = lobby ? Object.keys(lobby.rooms).length : 0
    const playingCount = lobby ? Object.values(lobby.rooms).filter((r: any) => r.start_time).length : 0
    this.ctx.logger.debug(`[update] lobby rooms: ${roomCount} (playing: ${playingCount}), waiting watchers: ${this.waitingWatchers.size}, matched keys: ${this.#matchedRoomKeys.size}`)
    await this.#checkRooms()
    await this.#matchGames()
  }

  async update() {
    try {
      return await this.#update()
    } catch (e) {
      this.ctx.logger.warn(e)
    }
  }

  restoreWatcher(data: TziakchaProvider.WatcherDump) {
    const watcher = TziakchaWatcher.restore(this, data)
    return !!this.submit(watcher)
  }
}

export interface Document {
  gameId: string
  title?: string
  periods?: number
  progress?: number
  start_time?: number
  finish_time?: number
  cfg?: number
  g?: Document.GameConfig
  players?: Document.Player[]
  records?: Document.Record[]
}

export interface Player extends BasePlayer {
  name: string
  uid?: string
  score?: number
  dscore?: number
  gscore?: number
  point?: number
}

export namespace Document {
  export interface GameConfig {
    l: number // 起和番
    b: number // 底分
    r0: number // 主要用时
    r1: number // 次要用时
    e: number // 储备
    lt: number // 总时长
    z: boolean
    d: boolean
    s: boolean
    o: boolean
    a: boolean
    r: boolean
    bl: boolean
  }

  export interface Player {
    n: string // name
    i?: string // uid (string in new API)
    e?: number // elo
    d?: number // elo delta
    s?: number // score
    m?: number // normalized value
  }

  export interface Record {
    i: string // record id
    s: number // raw result bitfield
    m?: number
    rp?: any
    rs?: number[]
  }
}

export namespace TziakchaProvider {
  export interface Config extends TziakchaWatcher.Config {
    apiBase: string
    updateWatchInterval: number
    roomCheckTime: number
    matchCheckTime: number
    matchJitterTime: number
  }

  export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
      apiBase: Schema.string().default('https://tziakcha.net'),
      updateWatchInterval: Schema.natural().role('ms').default(60 * Time.second),
      roomCheckTime: Schema.natural().role('ms').default(8 * Time.minute).description('Max age for room detection'),
      matchCheckTime: Schema.natural().role('ms').default(14 * Time.minute).description('Max wait time for game matching'),
      matchJitterTime: Schema.natural().role('ms').default(5 * Time.minute).description('Time jitter tolerance for matching'),
    }),
    TziakchaWatcher.Config.description('Watcher'),
  ])

  export interface WatcherDump extends BaseWatcherDump {
    id: string
    gameId: string
    room?: any
  }
}

export default TziakchaProvider
