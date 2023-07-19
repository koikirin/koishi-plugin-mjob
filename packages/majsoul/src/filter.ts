import { } from '@hieuzest/koishi-plugin-mahjong'
import { } from 'koishi-plugin-cron'
import { } from '@koishijs/plugin-admin'
import { Awaitable, Context, Dict, Logger, Schema, Service, clone } from 'koishi'

const logger = new Logger('mjob.majsoul')

declare module '@hieuzest/koishi-plugin-mjob' {
  interface WatcherFilters {
    majsoul: {
      $default: string[]
    }
  }
}

export class MajsoulFilterService extends Service {
  static using = ['mahjong', 'mjob.majsoul']

  constructor(public ctx: Context, public config: MajsoulFilterService.Config) {
    super(ctx, 'mjob.majsoul.filter')

    ctx.command('mjob.majsoul.filter.list', { admin: { channel: true } })
      .action(async ({ session }, ...players) => {
        const filter = await ctx.mjob.$filter.get(session.cid)
      })

    ctx.command('mjob.majsoul.filter.add', { admin: { channel: true } })
      .action(async ({ session }, ...players) => {
        const filter = await ctx.mjob.$filter.get('')
      })

    ctx.on('mjob/majsoul/before-watch', async (document, subscribers) => {
      for (const [channel, players] of Object.entries(subscribers)) {
        const filter = await ctx.mjob.$filter.get(channel)
        if (!filter.$default.includes(document.fid)) {
          delete subscribers[channel]
        }
      }
      return false
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
