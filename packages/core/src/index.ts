import { Awaitable, Context, Dict, Schema, Service, Time } from 'koishi'
import { Watcher, Watchable, WatcherCollection, Player, Progress } from './watcher'
import { Provider, ProviderType } from './service'

export * from './service'
export * from './watcher'
export * from './utils'

declare module 'koishi' {
  interface Events {
    //thisArg: Document
    // 'mjob/update'
    'mjob/before-watch'(watchables: Watchable[], provider?: ProviderType): Awaitable<void | boolean>
    'mjob/watch'(watcher: Watcher): Awaitable<void | boolean>
    'mjob/progress'(watcher: Watcher, progress: Progress): Awaitable<void>
    'mjob/finish'(watcher: Watcher, players: Player[]): Awaitable<void>
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
  watchers: WatcherCollection

  constructor(ctx: Context, private config: Mjob.Config) {
    super(ctx, 'mjob')
    this.watchers = new WatcherCollection()

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

    {
      const timer = setInterval(() => this.watchers.recycle(), 15 * Time.minute)
      ctx.collect('recycle', () => (clearInterval(timer), true))
    }

    ctx.command('mjob.status').action(async ({ session }) => {
      return Object.values(this.watchers.watchers)
        .map(watcher => session.text(`mjob.${watcher.type}.status`, { watcher }))
        .join('\n')
    })

    ctx.command('mjob.update').action(async ({ session }) => {
      await Promise.all([...Provider.keys].map(key => ctx.mjob[key].update() ))
      return 'Finished'
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
