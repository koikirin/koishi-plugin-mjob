import { } from '@hieuzest/koishi-plugin-mahjong'
import { Context, Dict, Logger, Schema, clone } from 'koishi'
import { WebSocket } from 'ws'
import { WatcherStatus, User as BaseUser, BaseWatcher, watchers } from '../watcher'
import { Provider } from '../service'

declare module 'koishi' {
  interface Events {
    // Send
    'mjob/before-majsoul-watch'(doc: WgDocument): Promise<boolean>
    'mjob/majsoul-watch'(): Promise<void>
    'mjob/majsoul-progress'(): Promise<void>
    'mjob/majsoul-finish'(users: MajsoulWatcher.User[]): Promise<void>
  }
}

const logger = new Logger('mjob.majsoul')
// logger.level = Logger.DEBUG

const WATCHER_RETRIES = 5

export class MajsoulWatcher extends BaseWatcher {

  users: MajsoulWatcher.User[]

  private ws: WebSocket
  private provider: MajsoulProvider
  private token: string
  logger: Logger
  private connectRetries: number
  private gameStatus: MajsoulWatcher.GameStatus
  private seq: number
  private oldseq: number
  
  constructor(private ctx: Context, public options: MajsoulWatcher.Options) {
    super()
    this.provider = ctx.mjob.majsoul
    this.users = options.users || []
    this.logger = logger.extend(this.wgid)
    this.connectRetries = 0
    this.oldseq = 0
  }

  get realid(): string {
    return this.options.uuid
  }

  
  private get finished() : boolean {
    if (this.status === WatcherStatus.Finished || this.status === WatcherStatus.EarlyFinished) return true
    if (this.closed) return true
    return false
  }
  

  async _queryResult() {
    if (this.finished) return true
    const paipu = await this.ctx.mahjong.majsoul.getPaipuHead(this.options.uuid)
    if (!paipu || paipu.err) return
    if (!this.users.length) {
      Array(paipu.head.result.players.length).forEach(_ => this.users.push({
        player: '電腦',
        accountId: 0,
      }))
      paipu.head.accounts.forEach(p => {
        this.users[p.seat] = {
          player: p.nickname,
          accountId: p.account_id,
        }
      })
    }
    const users = clone(this.users)
    paipu.head.result.players.forEach(p => {
      users[p.seat].score = p.part_point_1
      users[p.seat].point = p.grading_score
    })
    this.status = WatcherStatus.EarlyFinished
    await this.#finish(users)
    return true
  }

  close(): void {
    this.closed = true
    if (this.ws) this.ws.close()
    this.ws = null
  }

  async queryResult() {
    try {
      if (await this._queryResult()) return
      setTimeout(this.queryResult.bind(this), 1000 * 30)
    } catch (e) {
      this.logger.error(e)
      setTimeout(this.queryResult.bind(this), 1000 * 60)
    }
  }

  async connect() {
    if (this.finished) return
    let retries = 0
    this.logger.info('Start connection')

    if (!this.token) while (!this.closed) {
      try {
        this.token = (await this.ctx.mahjong.majsoul.getObToken<{token: string}>(this.options.uuid)).token
        break
      }
      catch (e) {
        retries += 1
        if (retries > 6) {
          this.closed = true
          this.status = WatcherStatus.Error
          // emit
          this.logger.error('Fail to fetch token')
          return
        }
      }
    }

    this.logger.debug('Token: ', this.token)

    if (this.ws) this.ws.close()
    this.ws = new WebSocket(`${this.provider.config.obUri}?token=${this.token}&tag=${this.wgid}`)
    this.ws.on('message', this.#receive.bind(this))
    this.ws.on('error', (e) => {
      this.logger.error(e)
      this.ws.close()
      this.ws = null
      this.connectRetries += 1
      if (this.connectRetries > WATCHER_RETRIES) {
        this.closed = false
        this.status = WatcherStatus.Error
      } else setTimeout(this.connect.bind(this), 1000 * 30)
    })
    this.ws.on('close', () => {
      this.logger.debug('Closed')
      this.ws.close()
      this.ws = null
      this.connectRetries += 1
      if (this.finished) return
      if (this.connectRetries > WATCHER_RETRIES) {
        this.closed = false
        this.status = WatcherStatus.Error
      } else setTimeout(this.connect.bind(this), 1000 * 30)
    })
  }

  async #receive(data: any) {
    const m: {
      seq: number,
      name: string,
      data?: any,
    } = JSON.parse(data)
    // this.logger.debug(m)

    const seq = m.seq
    if (seq === 0 && this.seq <= 0) {}
    else if (seq <= this.seq) return
    this.seq = seq

    if (m.name === 'ob_init') {
      const data = JSON.parse(m.data)
      if ('head' in data) {
        const wg: Wg = JSON.parse(JSON.parse(m.data).head)
        this.users = []
        const tmpPlayers: Dict<MajsoulWatcher.User> = {}
        for (const player of wg.players)
          tmpPlayers[player.account_id] = {
            player: player.nickname,
            accountId: player.account_id,
            point: 0,
            dpoint: 0,
          }
        for (const aid of wg.seat_list)
          if (aid === 0) this.users.push({
            player: '電腦',
            accountId: 0,
            point: 0,
            dpoint: 0,
          })
          else this.users.push(tmpPlayers[aid])
      } else if ('seq' in data) {
        this.status = WatcherStatus.Playing
      } else {
        console.debug('Waiting')
      }
        
    } else if (m.name === '.lq.RecordNewRound') {
      this.gameStatus = {
        oya: m.data.ju,
        kyoku: m.data.chang * 4 + m.data.ju,
        honba: m.data.ben,
        riichi: m.data.liqibang,
      }

      this.users.forEach((user, i) => {
        user.point = m.data.scores[i]
      })
      if (this.seq > this.oldseq) this.#progess(m, clone(this.gameStatus), clone(this.users))

    } else if (m.name === '.lq.RecordHule') {
      this.users.forEach((user, i) => {
        user.point = m.data.scores[i]
        user.dpoint = m.data.delta_scores[i]
      })
      if (this.seq > this.oldseq) this.#progess(m, clone(this.gameStatus), clone(this.users))

    } else if (m.name === '.lq.RecordLiuju') {
      logger.info('RecordLiuju', m)
      // this.users.forEach((user, i) => {
      //   user.point = m.data.scores[i]
      //   user.dpoint = m.data.delta_scores[i]
      // })
      if (this.seq > this.oldseq) this.#progess(m, clone(this.gameStatus), clone(this.users))

    } else if (m.name === '.lq.RecordNoTile') {
      const ss = m.data.scores[m.data.scores.length - 1]
      if ('scores' in ss) 
        this.users.forEach((user, i) => {
          user.point = ss.scores[i]
          user.dpoint = 0
        })
      else
        this.users.forEach((user, i) => {
          user.dpoint = ss.delta_scores?.[i] || 0
          user.point = ss.old_scores[i] + user.dpoint
        })
      if (this.seq > this.oldseq) this.#progess(m, clone(this.gameStatus), clone(this.users))

    } else if (m.name === '.lq.NotifyGameEndResult') {
      this.closed = true
      m.data.result.players.forEach(p => {
        this.users[p.seat].score = p.part_point_1
        this.users[p.seat].point = p.grading_score
      })
      if (this.seq > this.oldseq) {
        this.status = WatcherStatus.Finished
        this.#finish(clone(this.users))
      }

    }

  }

  async #progess(m: {
    seq: number,
    name: string,
    data?: any,
  }, status: MajsoulWatcher.GameStatus, users: MajsoulWatcher.User[]) {
    this.logger.info('Progress', this.realid, status, users)
    await this.ctx.parallel(this, 'mjob/majsoul-progress')
  }

  async #finish(users: MajsoulWatcher.User[]) {
    this.logger.info('Finish', this.realid, users)
    await this.ctx.parallel(this, 'mjob/majsoul-finish', users)
  }

}


export namespace MajsoulWatcher {
  export interface Options {
    uuid: string
    fid?: string
    users?: User[]
  }

  export interface User extends BaseUser {
    player: string
    accountId: number
    score?: number
    point?: number
    dpoint?: number
  }

  export interface GameStatus {
    oya: number
    kyoku: number
    honba: number
    riichi: number
  }

}

export class MajsoulProvider extends Provider {
  static using = ['mahjong']
  private wgidMap: Dict<string>
  private registeredFids: Dict<string[]>
  private subscrptions: Dict<string[]>

  constructor(public ctx: Context, public config: MajsoulProvider.Config) {
    super(ctx, 'majsoul', { immediate: true })
    this.wgidMap = {}
    this.registeredFids = {}
    ctx.command('mjob.watch-majsoul <uuid:string>').action(async (argv, uuid) => {
      const watcher = new MajsoulWatcher(ctx, { uuid })
      watcher.connect()
      return 'Run'
    })

    ctx.command('mjob.update-majsoul').action(async () => {
      await this.update()
    })

    if (config.updateWatchInterval) ctx.cron(`*/${config.updateWatchInterval} * * * *`, async () => {
      await this.update()
    })

    if (config.updateLivelistsInterval) ctx.cron(`*/${config.updateLivelistsInterval} * * * *`, async () => {
      await this.updateLivelists()
    })
    // ctx.on('ready', () => console.log(ctx['mjob.majsoul']))
  }

  get(uuid: string) {
    return watchers.get(this.wgidMap[uuid])
  }

  async update(forceSync: boolean = false) {
    logger.info('Updating')
    const curtime = Date.now() / 1000
    const wglist = this.ctx.mahjong.database.db('majob').collection<WgDocument>('majsoul').find({
      starttime: {
        $gt: curtime - 900 - DEFAULT_CHECK_TIME,
        $lt: curtime + 300 + DEFAULT_CHECK_TIME,
      }
    })

    for await (const wg of wglist) {
      if (!await this.shouldWatch(wg.wg.players, wg.fid)) continue
      if (!forceSync && curtime - wg.starttime > DEFAULT_CHECK_TIME) continue
      if (this.get(wg.wg.uuid)?.checked) continue

      // Before
      if (await this.ctx.serial('mjob/before-majsoul-watch', wg)) continue

      const watcher = new MajsoulWatcher(this.ctx, {
        uuid: wg.wg.uuid,
        fid: wg.fid,
        users: wg.wg.players.map(p => {
          return {
            player: p.nickname,
            accountId: p.account_id,
          }
        }),
      })
      watcher.checked = true
      // watcher.connect()
      // watcher.queryResult()
      
      // Watch
      this.ctx.parallel(this, 'mjob/majsoul-watch')
    }
  }

  async updateLivelists() {
    const fids = [...new Set(Object.values(this.registeredFids).flat())]
    for (const fid in fids)
    try {
      await this.ctx.mahjong.majsoul.getLivelist(fid)
    } catch (e) {}
  }

  async shouldWatch(players: Player[], fid: string) {
    const fids = Object.values(this.registeredFids).flat()
    return fids.includes(fid)
  }

  registerFids(key: string, fids?: string[]) {
    console.info('Register fids: ', key, fids)
    if (fids)
      this.registeredFids[key] = fids
    else
      return this.registeredFids[key]
  }


}

export const DEFAULT_CHECK_TIME = 1200

export type IdDocument<T> = { _id: T } & Document

export interface Player {
  account_id: number
  nickname: string
}

export interface Wg {
  uuid: string
  start_time: number
  players: Player[]
  seat_list: number[]
}

export type WgDocument = IdDocument<string> & {
  starttime: number
  fid: string
  uid: string
  wg: Wg
}

export namespace MajsoulProvider {


  export interface Config {
    obUri: string
    updateWatchInterval: number
    updateLivelistsInterval: number
  }
  
  export const Config: Schema<Config> = Schema.object({
    obUri: Schema.string().default('ws://localhost:7237'),
    updateWatchInterval: Schema.natural().default(2),
    updateLivelistsInterval: Schema.natural().default(2),
  }).description('Majsoul')
  
}