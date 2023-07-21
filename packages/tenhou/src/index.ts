import { Context, Logger, Schema, Time } from 'koishi'
import { Provider, Watchable, Player as BasePlayer } from '@hieuzest/koishi-plugin-mjob'
import { TenhouWatcher } from './watcher'
import { getFidFromDocument, parseWgStrings } from './utils'
// import MajsoulNotifyService from './notify'
// import MajsoulFilterService from './filter'

declare module '@hieuzest/koishi-plugin-mjob' {
  namespace Mjob {
    interface Providers {
      tenhou: TenhouProvider
    }
  }
}

const logger = new Logger('mjob.tenhou')

export interface MajsoulProvider {
  // notify: MajsoulNotifyService
  // filter: MajsoulFilterService
}

export class TenhouProvider extends Provider {
  static provider: 'tenhou' = 'tenhou'
  static using = ['mjob']

  constructor(public ctx: Context, public config: TenhouProvider.Config) {
    super(ctx, TenhouProvider.provider)

    // ctx.plugin(MajsoulNotifyService)
    // ctx.plugin(MajsoulFilterService)

    if (config.updateWatchInterval) {
      const timer = setInterval(() => this.update(), config.updateWatchInterval)
      ctx.collect('update', () => (clearInterval(timer), true))
    }

    ctx.command('mjob.tenhou.watch <uuid:string>')
      .alias('thwatch')
      .option('fid', '-f <fid:string>')
      .action(async ({ options }, uuid) => {
        // this.addWatcher({ uuid, fid: options.fid })
        return 'Run'
    })

    ctx.command('mjob.tenhou.update')
      .alias('thupdate')
      .action(async () => {
        await this.update()
    })

  }

  async fetchList(): Promise<Document[]> {
    if (this.config.livelistSource === 'tenhou') {
      const wgStrings: string = await this.ctx.http.get('https://mjv.jp/0/wg/0.js', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36'
        }
      })
      return [...parseWgStrings(wgStrings)]
    } else if (this.config.livelistSource === 'nodocchi') {
      return await this.ctx.http.get('https://nodocchi.moe/s/wg/0.js')
    }
  }

  async update(forceSync: boolean = false) {
    logger.debug('Updating')
    const ctx = this.ctx
    const curtime = Date.now() / 1000
    const wglist = await this.fetchList()
    const watchables: Watchable<typeof TenhouProvider.provider, Player>[] = []

    for (const document of wglist) {
      document.fid = getFidFromDocument(document)
      // Basic checking
      if (!forceSync && curtime - document.info.starttime > this.config.matchValidTime) continue
      if (this.ctx.mjob.watchers.has(`${this.key}:${document.info.id}`)) continue

      const watchable = {
        type: this.key,
        get provider() { return ctx.mjob.tenhou },
        watchId: document.info.id,
        players: document.players.map(p =>
          Object.assign(p.name, {
            name: p.name
          })),
        // The raw document
        document: document,
      }
      watchables.push(watchable)
    }

    if (await this.ctx.serial('mjob/before-watch', watchables, TenhouProvider.provider)) return

    for (const watchable of watchables) {
      if (watchable.decision !== 'approved') continue
      const watcher = new TenhouWatcher(this, watchable)
      if (await this.ctx.bail('mjob/watch', watcher)) continue
      
      if (this.ctx.mjob.watchers.has(watcher.wid)) continue
      this.submit(watcher)
      watcher.logger.info(`Watch ${watcher.watchId}`)
    }

  }

}

export interface Document {
  info: Document.Info
  players: Document.Player[]
  fid?: string
}

export interface Player extends BasePlayer {
  name: string
  dan?: string
  rate?: number
  score?: number
  point?: number
  dpoint?: number
}

export namespace Document {
  export interface Info {
    kuitanari: 0 | 1
    akaari: 0 | 1
    rapid: 0 | 1
    playernum: 3 | 4
    playerlevel: number
    playlength: 1 | 2
    yami?: 0 | 1
    starttime: number
    id: string
  }

  export interface Player {
    name: string
    rate?: number
    grade?: number
  }
  
}

export namespace TenhouProvider {
  export interface Config {
    livelistSource: 'tenhou' | 'nodocchi'
    updateWatchInterval: number
    matchValidTime: number
    reconnectInterval: number
    reconnectTimes: number
  }
  
  export const Config: Schema<Config> = Schema.object({
    livelistSource: Schema.union(['tenhou', 'nodocchi'] as const).default('tenhou'),
    updateWatchInterval: Schema.natural().role('ms').default(90 * Time.second),
    matchValidTime: Schema.natural().default(600),
    reconnectInterval: Schema.natural().role('ms').default(15 * Time.second),
    reconnectTimes: Schema.natural().default(5),
  })

}

export default TenhouProvider
