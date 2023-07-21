import { } from '@hieuzest/koishi-plugin-mahjong'
import { Context, Logger, Schema, Time } from 'koishi'
import { IdDocument } from '@hieuzest/koishi-plugin-mahjong'
import { Provider, Watchable, Player as BasePlayer } from '@hieuzest/koishi-plugin-mjob'
import { MajsoulWatcher } from './watcher'
import MajsoulNotifyService from './notify'
import MajsoulFilterService from './filter'

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
  filter: MajsoulFilterService
}

export class MajsoulProvider extends Provider {
  static provider: 'majsoul' = 'majsoul'
  static using = ['mahjong', 'mjob']

  constructor(public ctx: Context, public config: MajsoulProvider.Config) {
    super(ctx, MajsoulProvider.provider)

    ctx.plugin(MajsoulNotifyService)
    ctx.plugin(MajsoulFilterService)

    if (config.updateWatchInterval) {
      const timer = setInterval(() => this.update(), config.updateWatchInterval)
      ctx.collect('update', () => (clearInterval(timer), true))
    }

    // if (config.updateLivelistsInterval) ctx.cron(`*/${config.updateLivelistsInterval} * * * *`, async () => {
    //   await this.updateLivelists()
    // })

    ctx.command('mjob.majsoul.watch <uuid:string>')
      .alias('mswatch')
      .option('fid', '-f <fid:string>')
      .action(async ({ options }, uuid) => {
        // this.addWatcher({ uuid, fid: options.fid })
        return 'Run'
    })

    ctx.command('mjob.majsoul.update')
      .alias('msupdate')
      .action(async () => {
        await this.update()
    })

  }

  async update(forceSync: boolean = false) {
    logger.debug('Updating')
    const ctx = this.ctx
    const curtime = Date.now() / 1000
    const wglist = this.ctx.mahjong.database.db('majob').collection<Document>('majsoul').find({
      starttime: {
        $gt: curtime - 300 - this.config.matchValidTime,
        $lt: curtime + 300 + this.config.matchValidTime,
      }
    })

    const watchables: Watchable<typeof MajsoulProvider.provider, Player>[] = []

    for await (const document of wglist) {
      // Basic checking
      if (!forceSync && curtime - document.starttime > this.config.matchValidTime) continue
      if (this.ctx.mjob.watchers.has(`${this.key}:${document.wg.uuid}`)) continue

      const watchable = {
        type: this.key,
        get provider() { return ctx.mjob.majsoul },
        watchId: document.wg.uuid,
        players: document.wg.players.map(p =>
          Object.assign(`$${p.account_id}`, {
            accountId: p.account_id,
            nickname: p.nickname,
          })),
        // The raw document
        document: document,
      }
      watchables.push(watchable)
    }

    if (await this.ctx.serial('mjob/before-watch', watchables, MajsoulProvider.provider)) return

    for (const watchable of watchables) {
      if (watchable.decision !== 'approved') continue
      const watcher = new MajsoulWatcher(this, watchable)
      if (await this.ctx.bail('mjob/watch', watcher)) continue
      
      if (this.ctx.mjob.watchers.has(watcher.wid)) continue
      this.submit(watcher)
      watcher.logger.info(`Watch ${watcher.watchId}`)
    }

  }

  // async updateLivelists() {
  //   const fids = [...new Set(Object.values(this.registeredFids).flat())]
  //   for (const fid of fids) try {
  //     await this.ctx.mahjong.majsoul.getLivelist(fid)
  //   } catch (e) {}
  // }

  // registerFids(key: string, fids?: string[]) {
  //   if (fids)
  //     this.registeredFids[key] = fids
  //   else
  //     return this.registeredFids[key]
  // }

  // restoreWatcher(data: MajsoulProvider.WatcherDump) {
  //   if (data.options.uuid in this.wgidMap) return
  //   const watcher = MajsoulWatcher.restore(this.ctx, data)
  //   this.wgidMap[watcher.realid] = watcher.id
  //   watcher.connect()
  //   watcher.queryResult()
  // }

}

export type Document = IdDocument<string> & {
  starttime: number
  fid: string
  uid: string
  wg: Document.Wg
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
  export interface Config {
    obUri: string
    updateWatchInterval: number
    updateLivelistsInterval: number
    matchValidTime: number
    reconnectInterval: number
    reconnectTimes: number
  }
  
  export const Config: Schema<Config> = Schema.object({
    obUri: Schema.string().default('ws://localhost:7237'),
    updateWatchInterval: Schema.natural().role('ms').default(90 * Time.second),
    updateLivelistsInterval: Schema.natural().role('ms').default(120 * Time.second),
    matchValidTime: Schema.natural().default(600),
    reconnectInterval: Schema.natural().role('ms').default(15 * Time.second),
    reconnectTimes: Schema.natural().default(5),
  })

  // export interface WatcherDump {
  //   type: 'majsoul'
  //   id: string
  //   options: MajsoulWatcher.Options
  //   seq: number
  // }

}

export default MajsoulProvider
