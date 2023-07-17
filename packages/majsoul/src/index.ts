import { } from '@hieuzest/koishi-plugin-mahjong'
import { } from 'koishi-plugin-cron'
import { Awaitable, Context, Dict, Logger, Schema } from 'koishi'
import { IdDocument } from '@hieuzest/koishi-plugin-mahjong'
import { WatcherDump as BaseDump, Provider } from '@hieuzest/koishi-plugin-mjob'
import { MajsoulWatcher } from './watcher'
import MajsoulNotifyService from './notify'
import MajsoulFilterService from './filter'

declare module 'koishi' {
  interface Events {
    'mjob/majsoul/before-watch'(document: Document): Awaitable<boolean>
    'mjob/majsoul/watch'(watcher: MajsoulWatcher): Awaitable<void>
    'mjob/majsoul/progress'(watcher: MajsoulWatcher, data: any): Awaitable<void>
    'mjob/majsoul/finish'(watcher: MajsoulWatcher, users: MajsoulWatcher.User[]): Awaitable<void>
  }
}

declare module '@hieuzest/koishi-plugin-mjob' {
  namespace Mjob {
    interface Providers {
      majsoul: MajsoulProvider
    }
  }
}

const logger = new Logger('mjob.majsoul')

export interface MajsoulProvider {
  notify: MajsoulNotifyService
}

export class MajsoulProvider extends Provider {
  static using = ['mahjong', '__cron__', 'mjob', 'mjob.$subscription']
  private wgidMap: Dict<string>
  private registeredFids: Dict<string[]>

  constructor(public ctx: Context, public config: MajsoulProvider.Config) {
    super(ctx, MajsoulProvider.provider)
    this.wgidMap = {}
    this.registeredFids = {}

    ctx.plugin(MajsoulNotifyService)
    ctx.plugin(MajsoulFilterService)

    // console.log(ctx.runtime.plugin['__provider__'])
    // console.log(Provider.__provider__)

    if (config.updateWatchInterval) ctx.cron(`*/${config.updateWatchInterval} * * * *`, async () => {
      await this.update()
    })

    if (config.updateLivelistsInterval) ctx.cron(`*/${config.updateLivelistsInterval} * * * *`, async () => {
      await this.updateLivelists()
    })

    ctx.command('mjob.majsoul.watch <uuid:string>')
      .alias('mswatch')
      .option('fid', '-f <fid:string>')
      .action(async ({ options }, uuid) => {
        this.addWatcher({ uuid, fid: options.fid })
        return 'Run'
    })

    ctx.command('mjob.majsoul.update')
      .alias('msupdate')
      .action(async () => {
        await this.update()
    })

    ctx.command('mjob.majsoul.add <...players:string>')
      .alias('msadd')
      .action(async ({ session }, ...players) => {
        await ctx.mjob.$subscription.add({
          platform: session.platform,
          channelId: session.channelId,
        }, players)
        return 'Finished'
      })

    ctx.command('mjob.majsoul.remove <...players:string>')
      .alias('msdel')
      .action(async ({ session }, ...players) => {
        await ctx.mjob.$subscription.remove({
          platform: session.platform,
          channelId: session.channelId,
        }, players)
        return 'Finished'
      })

    ctx.command('mjob.majsoul.list')
      .alias('msls')
      .action(async ({ session }) => {
        const players = await ctx.mjob.$subscription.get({
          platform: session.platform,
          channelId: session.channelId,
        })
        return [...players].join(', ')
      })

  }

  get(uuid: string) {
    return this.ctx.mjob.watchers.get(this.wgidMap[uuid])
  }

  async update(forceSync: boolean = false) {
    logger.info('Updating')
    const curtime = Date.now() / 1000
    const wglist = this.ctx.mahjong.database.db('majob').collection<Document>('majsoul').find({
      starttime: {
        $gt: curtime - 300 - this.config.matchValidTime,
        $lt: curtime + 300 + this.config.matchValidTime,
      }
    })
    const subscriptions = await this.ctx.mjob.$subscription.get()

    for await (const document of wglist) {
      // Basic checking
      if (!forceSync && curtime - document.starttime > DEFAULT_CHECK_TIME) continue
      if (this.get(document.wg.uuid)) continue

      // Subscription
      if (!document.wg.players.some(p => subscriptions.has(`$${p.account_id}`))) continue

      // Fids
      if (!await this.shouldWatch(document)) continue

      // Before hook
      if (await this.ctx.serial('mjob/majsoul/before-watch', document)) continue

      this.addWatcher({
        uuid: document.wg.uuid,
        fid: document.fid,
        users: document.wg.players.map(p => {
          return {
            player: p.nickname,
            accountId: p.account_id,
          }
        }),
      })
    }
  }

  async updateLivelists() {
    const fids = [...new Set(Object.values(this.registeredFids).flat())]
    for (const fid of fids) try {
      await this.ctx.mahjong.majsoul.getLivelist(fid)
    } catch (e) {}
  }

  async shouldWatch(document: Document) {
    // const fids = Object.values(this.registeredFids).flat()
    // return fids.includes(document.fid)
    return true
  }

  registerFids(key: string, fids?: string[]) {
    if (fids)
      this.registeredFids[key] = fids
    else
      return this.registeredFids[key]
  }

  restoreWatcher(data: MajsoulProvider.WatcherDump) {
    if (data.options.uuid in this.wgidMap) return
    const watcher = MajsoulWatcher.restore(this.ctx, data)
    this.wgidMap[watcher.realid] = watcher.id
    watcher.connect()
    watcher.queryResult()
  }

  private addWatcher(options: MajsoulWatcher.Options) {
    if (options.uuid in this.wgidMap) return
    const watcher = new MajsoulWatcher(this.ctx, options)
    logger.info(`Watch ${watcher.id} ${options.uuid}`)
    watcher.checked = true
    this.wgidMap[watcher.realid] = watcher.id
    watcher.connect()
    watcher.queryResult()

    this.ctx.parallel(watcher, 'mjob/majsoul/watch', watcher)
  }

}

export const DEFAULT_CHECK_TIME = 600

export type Document = IdDocument<string> & {
  starttime: number
  fid: string
  uid: string
  wg: Document.Wg
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
  export interface Config {
    obUri: string
    updateWatchInterval: number
    updateLivelistsInterval: number
    matchValidTime: number
  }
  
  export const Config: Schema<Config> = Schema.object({
    obUri: Schema.string().default('ws://localhost:7237'),
    updateWatchInterval: Schema.natural().default(2),
    updateLivelistsInterval: Schema.natural().default(2),
    matchValidTime: Schema.natural().default(600)
  })
  export const provider = 'majsoul'

  export interface WatcherDump extends BaseDump {
    type: 'majsoul'
    id: string
    options: MajsoulWatcher.Options
    seq: number
  }

}

export default MajsoulProvider
