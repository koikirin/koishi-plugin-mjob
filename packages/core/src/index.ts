import { Awaitable, Context, Dict, Schema, Service } from 'koishi'
import { } from 'koishi-plugin-cron'
import { Watcher, WatcherCollection, WatcherDump } from './watcher'
import SubscriptionService from './subscription'
import FilterService from './filter'

export * from './service'
export * from './watcher'
export * from './subscription'
export * from './utils'

declare module 'koishi' {
  interface Events {
    //thisArg: Document
    'mjob/before-watch'(provider: keyof Mjob.Providers, id: string, players: string[]): Awaitable<boolean>
    'mjob/watch'(watcher: Watcher): Awaitable<void>
  }

  interface Context extends NestedServices {
    mjob: Mjob
  }

}

type NestedServices = {
  [K in keyof Mjob.Services as `mjob.${K}`]: Mjob.Services[K]
}

export interface Mjob extends Mjob.Services {}

export class Mjob extends Service {
  static using = ['__cron__', 'mahjong']

  watchers: WatcherCollection

  constructor(ctx: Context, private config: Mjob.Config) {
    super(ctx, 'mjob')
    this.watchers = new WatcherCollection()

    ctx.plugin(SubscriptionService)
    ctx.plugin(FilterService)
    // ctx.on('ready', async () => {
    //   this.majsoul.registerFids('test', [])
      
    //   const root = resolve(this.ctx.baseDir, this.config.root)
    //   await mkdir(root, { recursive: true })
    //   const handle = await open(`${root}/watchers.dump`, 'r')
    //   try {
    //     const dumps = JSON.parse(new TextDecoder().decode(await handle.readFile()))
    //     if (Date.now() - dumps.timestamp > 1000 * 60 * 10) {
    //       console.log('Dump rejected.')
    //       return
    //     }
    //     dumps.watchers.forEach((d: WatcherDump) => {
    //       this.majsoul.restoreWatcher(d)
    //     })
    //   } finally {
    //     await handle.close()
    //   }

    // })

    // console.log(ctx.cron)

    ctx.cron('*/15 * * * *', () => {
      this.watchers.recycle()
    })

    ctx.command('mjob.list').action(async (argv) => {
      console.log(Object.keys(this.watchers.watchers))
    })

    ctx.on('dispose', async () => {
      // const root = resolve(this.ctx.baseDir, this.config.root)
      // await mkdir(root, { recursive: true })
      // await open(`${root}/watchers.dump`, 'w+').then(async (handle) => {
      //   await handle.writeFile(JSON.stringify({
      //     version: 1,
      //     timestamp: Date.now(),
      //     watchers: this.watchers.dump()
      //   }))
      //   await handle.close()
      // }).catch((e) => {
      //   console.log(e)
      // })
      this.watchers.stop()
    })

  }

}

export namespace Mjob {

  export interface CoreServices {}

  export interface Providers {}

  export type Services = CoreServices & Providers

  export interface Config {
    root?: string
  }
  
  export const Config: Schema<Config> = Schema.object({
    root: Schema.path({
      filters: ['directory'],
      allowCreate: true,
    }).default('data/mjob'),
  })
}

export default Mjob