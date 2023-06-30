import { Context, Schema, Service } from 'koishi'
import { } from 'koishi-plugin-cron'
import { MajsoulProvider } from './majsoul'
import { MatchStatus, watchers } from './watcher'

declare module 'koishi' {
  interface Events {
    // Send
    'mjob/before-watch'(platform: string, id: string, players: string[]): Promise<boolean>
    'mjob/watch'(platform: string, id: string, players: string[]): Promise<void>

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
  constructor(ctx: Context, private config: Mjob.Config) {
    super(ctx, 'mjob', true)
    ctx.plugin(MajsoulProvider)

    ctx.on('ready', async () => {
      this.majsoul.registerFids('test', [])
    })

    ctx.cron('*/15 * * * *', () => {
      watchers.recycle()
    })

    ctx.command('mjob.list').action(async (argv) => {
      console.log(Object.keys(watchers.watchers))
    })

    ctx.on('dispose', () => {
      watchers.stop()
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
    majsoul: MajsoulProvider.Config
  }
  
  export const Config: Schema<Config> = Schema.object({
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
