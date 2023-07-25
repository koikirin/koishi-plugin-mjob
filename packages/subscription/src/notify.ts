import { Watcher, Progress, Player, CoreService } from '@hieuzest/koishi-plugin-mjob'
import { Context, Logger, Schema, Service, remove } from 'koishi'
import { } from '@hieuzest/koishi-plugin-send'

const logger = new Logger('mjob.notify')

declare module '@hieuzest/koishi-plugin-mjob' {
  namespace Mjob {
    interface CoreServices {
      $notify: NotifyService
    }
  }

  interface Watcher {
    notifyChannels: string[]
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
    
    this.extendDump(['notifyChannels'])

    ctx.command('mjob.track <id:string>')
      .action(({ session }, id) => {
        const watcher = ctx.mjob.watchers.getById(id)
        if (watcher) {
          if (!watcher.notifyChannels) watcher.notifyChannels = []
          watcher.notifyChannels.includes(session.cid) || watcher.notifyChannels.push(session.cid)
          return session.text('mjob.general.success')
        }
        return session.text('mjob.general.watcher-notfound')
      })

    ctx.command('mjob.untrack <id:string>')
      .action(({ session }, id) => {
        const watcher = ctx.mjob.watchers.getById(id)
        if (watcher) {
          remove(watcher.notifyChannels, session.cid)
          return session.text('mjob.general.success')
        }
        return session.text('mjob.general.watcher-notfound')
      })

    ctx.on('mjob/watch', (watcher: Watcher) => {
      Promise.all(Object.entries(watcher.subscribers || {}).map(async ([cid, subscribedPlayers]) => {
        const locales = (await ctx.database.getChannel(...parsePlatform(cid), ['locales']))?.locales
        const message = ctx.i18n.render(locales, [`mjob.${watcher.type}.notify.watch`, 'mjob.$empty'], { watcher, cid, subscribedPlayers }).join('')
        return ctx.sendMessage(cid, message)
      }))
    })

    ctx.on('mjob/progress', (watcher: Watcher, progress: Progress) => {
      Promise.all((watcher.notifyChannels || []).map(async cid => {
        const locales = (await ctx.database.getChannel(...parsePlatform(cid), ['locales']))?.locales
        const message = ctx.i18n.render(locales, [`mjob.${watcher.type}.notify.${progress.event}`, 'mjob.$empty'], { watcher, progress, cid }).join('')
        return ctx.sendMessage(cid, message)
      }))
    })

    ctx.on('mjob/finish', (watcher: Watcher, players: Player[]) => {
      Promise.all(Object.entries(watcher.subscribers || {}).map(async ([cid, subscribedPlayers]) => {
        const locales = (await ctx.database.getChannel(...parsePlatform(cid), ['locales']))?.locales
        const message = ctx.i18n.render(locales, [`mjob.${watcher.type}.notify.finish`, 'mjob.$empty'], { watcher, players, cid, subscribedPlayers }).join('')
        return ctx.sendMessage(cid, message)
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
