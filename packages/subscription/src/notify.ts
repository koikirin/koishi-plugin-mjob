import { CoreService, Player, Progress, Watcher } from '@hieuzest/koishi-plugin-mjob'
import { Context, Dict, h, remove, Schema } from 'koishi'
import { } from '@hieuzest/koishi-plugin-send'

declare module '@hieuzest/koishi-plugin-mjob' {
  namespace Mjob {
    interface CoreServices {
      $notify: NotifyService
    }
  }

  interface Watcher {
    notifyChannels: string[]
    notifyStartMessageIds?: Dict<string>
    notifyProgressMessageIds?: Dict<string>
  }
}

function parsePlatform(target: string): [platform: string, id: string] {
  const index = target.indexOf(':')
  const platform = target.slice(0, index)
  const id = target.slice(index + 1)
  return [platform, id] as any
}

function isEmptyMessage(message: h[]) {
  return message.every(isEmptyFragment)
}

function isEmptyFragment(fragment: h) {
  return fragment.type === h.Fragment && fragment.children.every(isEmptyFragment)
}

export class NotifyService extends CoreService {
  static inject = ['sendMessage']

  constructor(public ctx: Context, public config: NotifyService.Config) {
    super(ctx, '$notify')

    this.extendDump(['notifyChannels', 'notifyStartMessageIds', 'notifyProgressMessageIds'])

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
        const message = ctx.i18n.render(locales, [`mjob.${watcher.type}.notify.watch`, 'mjob.$empty'], { watcher, cid, subscribedPlayers })
        if (isEmptyMessage(message)) return
        const messageIds = await ctx.sendMessage(cid, message, undefined, { source: 'mjob' })
        if (messageIds?.[0]) (watcher.notifyStartMessageIds ??= {})[cid] = messageIds[0]
      }))
    })

    ctx.on('mjob/progress', (watcher: Watcher, progress: Progress) => {
      Promise.all((watcher.notifyChannels || []).map(async cid => {
        const locales = (await ctx.database.getChannel(...parsePlatform(cid), ['locales']))?.locales
        const message = ctx.i18n.render(locales, [`mjob.${watcher.type}.notify.${progress.event}`, 'mjob.$empty'], { watcher, progress, cid })
        if (isEmptyMessage(message)) return
        if (config.replyOnProgress === 'last' && (watcher.notifyProgressMessageIds?.[cid] || watcher.notifyStartMessageIds?.[cid])) {
          message.unshift(h.quote(watcher.notifyProgressMessageIds?.[cid] || watcher.notifyStartMessageIds?.[cid]))
        } else if (config.replyOnProgress === 'start' && watcher.notifyStartMessageIds?.[cid]) {
          message.unshift(h.quote(watcher.notifyStartMessageIds[cid]))
        }
        const messageIds = await ctx.sendMessage(cid, message, undefined, { source: 'mjob' })
        if (messageIds?.[0]) (watcher.notifyProgressMessageIds ??= {})[cid] = messageIds[0]
      }))
    })

    ctx.on('mjob/finish', (watcher: Watcher, players: Player[]) => {
      Promise.all(Object.entries(watcher.subscribers || {}).map(async ([cid, subscribedPlayers]) => {
        const locales = (await ctx.database.getChannel(...parsePlatform(cid), ['locales']))?.locales
        const message = ctx.i18n.render(locales, [`mjob.${watcher.type}.notify.finish`, 'mjob.$empty'], { watcher, players, cid, subscribedPlayers })
        if (isEmptyMessage(message)) return
        if (config.replyOnFinish === 'last' && (watcher.notifyProgressMessageIds?.[cid] || watcher.notifyStartMessageIds?.[cid])) {
          message.unshift(h.quote(watcher.notifyProgressMessageIds?.[cid] || watcher.notifyStartMessageIds?.[cid]))
        } else if (config.replyOnFinish === 'start' && watcher.notifyStartMessageIds?.[cid]) {
          message.unshift(h.quote(watcher.notifyStartMessageIds[cid]))
        }
        return ctx.sendMessage(cid, message, undefined, { source: 'mjob' })
      }))
    })
  }
}

export namespace NotifyService {
  export interface Config {
    replyOnProgress: 'none' | 'start' | 'last'
    replyOnFinish: 'none' | 'start' | 'last'
  }

  export const Config: Schema<Config> = Schema.object({
    replyOnProgress: Schema.union(['none', 'start', 'last']).default('none'),
    replyOnFinish: Schema.union(['none', 'start', 'last']).default('none'),
  })
}

export default NotifyService
