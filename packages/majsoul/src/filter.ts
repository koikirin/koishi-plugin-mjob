import { } from '@hieuzest/koishi-plugin-mahjong'
import { } from 'koishi-plugin-cron'
import { Awaitable, Context, Dict, Logger, Schema, Service, clone } from 'koishi'
import { MajsoulWatcher } from './watcher'
import { Document } from '.'
import { Provider } from '@hieuzest/koishi-plugin-mjob'

const logger = new Logger('mjob.majsoul')

declare module '@hieuzest/koishi-plugin-mjob' {
  interface WatcherFilters {
    majsoul: {
      $default: string[]
    }
  }
}

export class MajsoulFilterService extends Service {
  // static using = ['mahjong', 'mjob.majsoul']

  constructor(public ctx: Context, public config: MajsoulFilterService.Config) {
    super(ctx, 'mjob.majsoul.filter')


    ctx.command('mjob.majsoul.filter')
      .action(async ({ session }, ...players) => {
        const filter = await ctx.mjob.$filter.get('')
      })

  }  

}

export namespace MajsoulFilterService {
  export interface Config {

  }
  
  export const Config: Schema<Config> = Schema.object({

  })
}

export default MajsoulFilterService
