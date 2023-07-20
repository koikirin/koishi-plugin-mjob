import { } from '@hieuzest/koishi-plugin-mahjong'
import { } from 'koishi-plugin-cron'
import { } from '@koishijs/plugin-admin'
import { Awaitable, Context, Dict, Logger, Schema, Service, clone } from 'koishi'
import { } from '@hieuzest/koishi-plugin-mjob-subscription'
import { } from '@hieuzest/koishi-plugin-mjob-filter'
import { MajsoulWatcher } from './watcher'

const logger = new Logger('mjob.majsoul')

declare module '@hieuzest/koishi-plugin-mjob-filter' {
  interface WatcherFilters {
    majsoul: {
      $default: string[]
    }
  }
}

export class MajsoulFilterService extends Service {
  static using = ['mahjong', 'mjob.$filter']

  constructor(public ctx: Context, public config: MajsoulFilterService.Config) {
    super(ctx, 'mjob.majsoul.filter')

    ctx.command('mjob.majsoul.filter.list', { admin: { channel: true } })
      .action(async ({ session }, ...players) => {
        return JSON.stringify(await ctx.mjob.$filter.get(session.cid))
      })

    ctx.command('mjob.majsoul.filter.add <...fids>', { admin: { channel: true } })
      .action(async ({ session }, ...fids) => {
        const oldFilter = await ctx.mjob.$filter.get(session.cid)
        const newFilter = {
          $default: [...new Set([...oldFilter?.$default||[], ...fids])]
        }
        await ctx.mjob.$filter.set(session.cid, newFilter)
      })

    ctx.on('mjob/watch', async (watcher: MajsoulWatcher) => {
      for (const [channel, players] of Object.entries(watcher.subscribers)) {
        const filter = await ctx.mjob.$filter.get(channel)
        if (!filter?.$default?.includes(watcher.document.fid)) {
          delete watcher.subscribers[channel]
        }
      }
      if (!Object.keys(watcher.subscribers).length) return true
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
