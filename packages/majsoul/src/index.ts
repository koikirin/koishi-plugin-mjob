import { IdDocument } from '@hieuzest/koishi-plugin-mahjong'
import { Context, Logger, Schema, Time } from 'koishi'
import { Player as BasePlayer, WatcherDump as BaseWatcherDump, Provider, Watchable } from '@hieuzest/koishi-plugin-mjob'
import {} from '@hieuzest/koishi-plugin-scheduler'
import { MajsoulWatcher } from './watcher'
import { MajsoulFid } from './fid'
import { MajsoulCommands } from './commands'

declare module '@hieuzest/koishi-plugin-mjob' {
  namespace Mjob {
    interface Providers {
      majsoul: MajsoulProvider
    }
  }
}

const logger = new Logger('mjob.majsoul')

export class MajsoulProvider extends Provider {
  static provider: 'majsoul' = 'majsoul'
  static using = ['mahjong', 'mjob', 'scheduler']

  constructor(public ctx: Context, public config: MajsoulProvider.Config) {
    super(ctx, MajsoulProvider.provider)

    ctx.i18n.define('zh', require('./locales/zh.yml'))

    ctx.plugin(MajsoulFid)
    ctx.using(['mjob.$subscription'], () => ctx.plugin(MajsoulCommands))

    if (config.updateWatchInterval) {
      ctx.scheduler.every(config.updateWatchInterval, () => this.update())
    }

    if (config.updateFidsMode !== 'off') {
      ctx.scheduler.every(config.updateFidsInterval, () => this.updateLivelists())
    }

    ctx.command('mjob.majsoul.watch <uuid:string>')
      .option('fid', '-f <fid:string>')
      .action(async ({ session }, uuid) => {
        const watcher = new MajsoulWatcher(this, {
          type: MajsoulProvider.provider,
          provider: this,
          watchId: uuid,
          players: [],
        })
        this.submit(watcher)
        return session.text('mjob.general.success')
      })
  }

  async #update(forceSync: boolean = false) {
    logger.debug('Updating')
    const ctx = this.ctx
    const curtime = Date.now() / 1000
    const wglist = this.ctx.mahjong.database.db('majob').collection<Document>('majsoul').find({
      starttime: {
        $gt: curtime - 300 - this.config.matchExpireTime,
        $lt: curtime + 300 + this.config.matchExpireTime,
      },
    })

    const watchables: Watchable<typeof MajsoulProvider.provider, Player>[] = []

    for await (const document of wglist) {
      // Basic checking
      if (!forceSync && curtime - document.starttime > this.config.matchExpireTime) continue
      if (this.ctx.mjob.watchers.has(`${this.key}:${document.wg.uuid}`)) continue

      // add fname
      if (ctx.mjob.$fid) document.fname = await ctx.mjob.$fid.getFname(document.fid)

      const watchable = {
        type: this.key,
        provider: this,
        watchId: document.wg.uuid,
        players: document.wg.players.map(p =>
          Object.assign(`$${p.account_id}`, {
            accountId: p.account_id,
            nickname: p.nickname,
          })),
        // The raw document
        document,
      }
      watchables.push(watchable)
    }

    if (await this.ctx.serial('mjob/attach', watchables, MajsoulProvider.provider)) return

    for (const watchable of watchables) {
      if (watchable.decision !== 'approved') continue
      if (await this.ctx.serial('mjob/before-watch', watchable)) continue

      const watcher = new MajsoulWatcher(this, watchable)
      await this.ctx.parallel('mjob/watch', watcher)

      if (this.ctx.mjob.watchers.has(watcher.wid)) continue
      if (this.submit(watcher)) watcher.logger.info(`Watch ${watcher.watchId}`)
    }
  }

  async update(forceSync: boolean = false) {
    try {
      return await this.#update(forceSync)
    } catch (e) {
      logger.error(e)
    }
  }

  async updateLivelists() {
    let fids = []
    if (this.ctx.mjob.$fid) {
      fids = await this.ctx.mjob.$fid.getAllFids()
    } else {
      fids = this.config.defaultFids
    }
    if (this.config.updateFidsMode === 'contest') fids = fids.filter(x => Number(x) > 10000)
    for (const fid of fids) {
      try {
        await this.ctx.mahjong.majsoul.getLivelist(fid)
      } catch (e) {}
    }
  }

  restoreWatcher(data: MajsoulProvider.WatcherDump) {
    const watcher = MajsoulWatcher.restore(this, data)
    return !!this.submit(watcher)
  }
}

export type Document = IdDocument<string> & {
  starttime: number
  fid: string
  uid: string
  wg: Document.Wg
  fname?: string
}

export interface Player extends BasePlayer {
  accountId: number
  nickname: string
  score?: number
  point?: number
  dpoint?: number
}

export namespace Document {
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
}

export namespace MajsoulProvider {
  export interface Config extends MajsoulWatcher.Config, MajsoulFid.Config {
    updateWatchInterval: number
    updateLivelistsInterval: number
    matchExpireTime: number
    updateFidsMode: 'off' | 'all' | 'contest'
    updateFidsInterval?: number
  }

  export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
      updateWatchInterval: Schema.natural().role('ms').default(90 * Time.second),
      updateLivelistsInterval: Schema.natural().role('ms').default(120 * Time.second),
      matchExpireTime: Schema.natural().default(600).description('in seconds'),
      updateFidsMode: Schema.union(['off', 'all', 'contest'] as const).default('off'),
    }),
    Schema.union([
      Schema.object({
        updateFidsMode: Schema.const('off'),
      }),
      Schema.object({
        updateFidsMode: Schema.const('all').required(),
        updateFidsInterval: Schema.natural().role('ms').default(Time.minute),
      }),
      Schema.object({
        updateFidsMode: Schema.const('contest').required(),
        updateFidsInterval: Schema.natural().role('ms').default(Time.minute),
      }),
    ]),
    MajsoulWatcher.Config.description('Watcher'),
    MajsoulFid.Config.description('Filter'),
  ])

  export interface WatcherDump extends BaseWatcherDump {
    id: string
    document: Document
    seq: number
  }
}

export default MajsoulProvider
