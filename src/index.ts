import { Awaitable, Context, Schema, Service } from 'koishi'
import { } from 'koishi-plugin-cron'
import { MajsoulProvider } from './majsoul'
import { WatcherCollection, WatcherDump } from './watcher'
import { open, mkdir } from 'fs/promises'
import { resolve } from 'path'

declare module 'koishi' {
  interface Events {
    // Send
    'mjob/before-watch'(platform: string, id: string, players: string[]): Awaitable<boolean>
    'mjob/watch'(platform: string, id: string, players: string[]): Awaitable<void>

    // Receive
    // 'mjob/status'(platform: string, id: string): Promise<MatchStatus>
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
    ctx.plugin(MajsoulProvider)
    
    ctx.on('ready', async () => {
      this.majsoul.registerFids('test', [])
      
      const root = resolve(this.ctx.baseDir, this.config.root)
      await mkdir(root, { recursive: true })
      const handle = await open(`${root}/watchers.dump`, 'r')
      try {
        const dumps = JSON.parse(new TextDecoder().decode(await handle.readFile()))
        if (Date.now() - dumps.timestamp > 1000 * 60 * 10) {
          console.log('Dump rejected.')
          return
        }
        dumps.watchers.forEach((d: WatcherDump) => {
          this.majsoul.restoreWatcher(d)
        })
      } finally {
        await handle.close()
      }

    })

    // console.log(ctx.cron)

    ctx.cron('*/15 * * * *', () => {
      this.watchers.recycle()
    })

    ctx.command('mjob.list').action(async (argv) => {
      console.log(Object.keys(this.watchers.watchers))
    })

    ctx.on('dispose', async () => {
      const root = resolve(this.ctx.baseDir, this.config.root)
      await mkdir(root, { recursive: true })
      await open(`${root}/watchers.dump`, 'w+').then(async (handle) => {
        await handle.writeFile(JSON.stringify({
          version: 1,
          timestamp: Date.now(),
          watchers: this.watchers.dump()
        }))
        await handle.close()
      }).catch((e) => {
        console.log(e)
      })
      this.watchers.stop()
    })

  }

  async add(platform: string, id: string) {

  }
}

export namespace Mjob {


  export interface Services {
    majsoul: MajsoulProvider
  }

  export interface Config {
    root?: string
    majsoul: MajsoulProvider.Config
  }
  
  export const Config: Schema<Config> = Schema.object({
    root: Schema.path({
      filters: ['directory'],
      allowCreate: true,
    }).default('data/logs'),
    majsoul: MajsoulProvider.Config,
  })

  // export abstract class AbsWatcher implements Watcher {
  //   public wgid: string
  //   public closed: boolean
  //   public checked: boolean
  //   public silent: boolean
  //   protected _statusStamp: number
  //   protected _status: WatcherStatus
  //   protected _starttime: number


  //   get type() {
  //     return ''
  //   }
  // }
}

export default Mjob
