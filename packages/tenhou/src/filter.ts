import { } from '@koishijs/plugin-admin'
import { Context, Logger, Schema, Service } from 'koishi'
import { } from '@hieuzest/koishi-plugin-mjob-subscription'
import { } from '@hieuzest/koishi-plugin-mjob-filter'
import { TenhouWatcher } from './watcher'

const logger = new Logger('mjob.majsoul')

declare module '@hieuzest/koishi-plugin-mjob-filter' {
  interface WatcherFilters {
    tenhou: {
      $default: string[]
    }
  }
}

export class TenhouFilterService extends Service {
  static using = ['mjob.$filter']

  constructor(public ctx: Context, public config: TenhouFilterService.Config) {
    super(ctx, 'mjob.tenhou.filter')

    ctx.command('mjob.tenhou.filter.list', { admin: { channel: true } })
      .action(async ({ session }, ...players) => {
        return JSON.stringify(await ctx.mjob.$filter.get(session.cid))
      })

    ctx.command('mjob.tenhou.filter.add <...fids>', { admin: { channel: true } })
      .action(async ({ session }, ...fids) => {
        const oldFilter = await ctx.mjob.$filter.get(session.cid)
        const newFilter = {
          $default: [...new Set([...oldFilter?.$default||[], ...fids])]
        }
        await ctx.mjob.$filter.set(session.cid, newFilter)
      })

    ctx.on('mjob/watch', async (watcher: TenhouWatcher) => {
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

export namespace TenhouFilterService {
  export interface Config {

  }
  
  export const Config: Schema<Config> = Schema.object({

  })
}

export default TenhouFilterService
