import { Context } from 'koishi'
import { Provider, Watchable } from '@hieuzest/koishi-plugin-mjob'
import { } from '@hieuzest/koishi-plugin-mjob-subscription'

declare module '.' {
  export interface Filter {
    disabled: boolean
  }
}

export class SwtichFilter {
  static using = ['mjob.$subscription']

  constructor(ctx: Context) {
    ctx.model.extend('mjob/filters', {
      disabled: 'boolean',
    })

    ctx.command('mjob.on')
      .option('channel', '-c <channel:channel>')
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }, ...players) => {
        if (options.provider) {
          ctx.mjob.$filter.set(options.channel || session.cid, {
            disabled: false,
          }, options.provider as never)
          return session.text('mjob.general.success')
        } else {
          for (const key of Provider.keys) {
            ctx.mjob.$filter.set(options.channel || session.cid, {
              disabled: false,
            }, key as never)
          }
          return session.text('mjob.general.success')
        }
      })

    ctx.command('mjob.off')
      .option('channel', '-c <channel:channel>')
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }, ...players) => {
        if (options.provider) {
          ctx.mjob.$filter.set(options.channel || session.cid, {
            disabled: true,
          }, options.provider as never)
          return session.text('mjob.general.success')
        } else {
          for (const key of Provider.keys) {
            ctx.mjob.$filter.set(options.channel || session.cid, {
              disabled: true,
            }, key as never)
          }
          return session.text('mjob.general.success')
        }
      })

    ctx.before('mjob/watch', async (watchable: Watchable) => {
      for (const [channel] of Object.entries(watchable.subscribers || {})) {
        const filter = await ctx.mjob.$filter.get(channel, ['disabled'], watchable.type)
        if (filter?.disabled) {
          delete watchable.subscribers[channel]
        }
      }
      if (!Object.keys(watchable.subscribers).length) return true
    })
  }
}

export default SwtichFilter
