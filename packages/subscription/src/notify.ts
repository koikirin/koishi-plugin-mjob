import { Watcher, Progress, Player, CoreService } from '@hieuzest/koishi-plugin-mjob'
import { Context, Logger, Schema, Service } from 'koishi'
import { } from '@hieuzest/koishi-plugin-send'

const logger = new Logger('mjob.notify')

declare module '@hieuzest/koishi-plugin-mjob' {
  namespace Mjob {
    interface CoreServices {
      $notify: NotifyService
    }
  }
}

function parsePlatform(target: string): [platform: string, id: string] {
  const index = target.indexOf(':')
  const platform = target.slice(0, index)
  const id = target.slice(index + 1)
  return [platform, id] as any
}

export class NotifyService extends CoreService {
  static using = ['__send__']

  constructor(public ctx: Context, public config: NotifyService.Config) {
    super(ctx, '$notify')

    ctx.i18n.define('zh', require('./locales/zh.yml'))
    
    ctx.on('mjob/watch', (watcher: Watcher) => {
      Promise.all(Object.entries(watcher.subscribers).map(async ([cid, _]) => {
        const locales = (await ctx.database.getChannel(...parsePlatform(cid), ['locales']))?.locales
        const message = ctx.i18n.render(locales, [`mjob.${watcher.type}.notify.watch`, 'mjob.$empty'], { watcher }).join('')
        logger.info('watch', cid, message)
        ctx.sendMessage(cid, message)
      }))
    })

    ctx.on('mjob/progress', (watcher: Watcher, progress: Progress) => {
      Promise.all(Object.entries(watcher.subscribers).map(async ([cid, _]) => {
        const locales = (await ctx.database.getChannel(...parsePlatform(cid), ['locales']))?.locales
        const message = ctx.i18n.render(locales, [`mjob.${watcher.type}.notify.${progress.event}`, 'mjob.$empty'], { watcher, progress }).join('')
        console.log('progress', cid, message)
        ctx.sendMessage(cid, message)
      }))
    })

    ctx.on('mjob/finish', (watcher: Watcher, players: Player[]) => {
      Promise.all(Object.entries(watcher.subscribers).map(async ([cid, _]) => {
        const locales = (await ctx.database.getChannel(...parsePlatform(cid), ['locales']))?.locales
        const message = ctx.i18n.render(locales, [`mjob.${watcher.type}.notify.finish`, 'mjob.$empty'], { watcher, players }).join('')
        console.log('finish', cid, message)
        ctx.sendMessage(cid, message)
      }))
    })
  }

}

export namespace NotifyService {
  export interface Config {

  }
  
  export const Config: Schema<Config> = Schema.object({

  })
}

export default NotifyService
