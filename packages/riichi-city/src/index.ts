import { Context, Schema, Time } from 'koishi'
import { Player as BasePlayer, WatcherDump as BaseWatcherDump, Provider, Watchable } from '@hieuzest/koishi-plugin-mjob'
import { } from '@hieuzest/koishi-plugin-scheduler'
import type * as types from '@hieuzest/koishi-plugin-riichi-city/types'
import { RiichiCityWatcher } from './watcher'
import { DEFAULT_FIDS, DEFAULT_FNAMES, RiichiCityFid } from './fid'
import { RiichiCityCommands } from './commands'

declare module '@hieuzest/koishi-plugin-riichi-city/types' {
  interface Room {
    fid?: string
    fname?: string
  }
}

declare module '@hieuzest/koishi-plugin-mjob' {
  namespace Mjob {
    interface Providers {
      'riichi-city': RiichiCityProvider
    }
  }
}

export class RiichiCityProvider extends Provider {
  static provider: 'riichi-city' = 'riichi-city'
  static inject = {
    required: ['mjob', 'scheduler', 'riichi-city', 'database'],
    optional: ['mjob.$fid'],
  }

  constructor(public ctx: Context, public config: RiichiCityProvider.Config) {
    super(ctx, RiichiCityProvider.provider)

    ctx.i18n.define('zh', require('./locales/zh'))

    ctx.plugin(RiichiCityFid, config)
    ctx.plugin(RiichiCityCommands)

    if (config.updateWatchInterval) {
      ctx.scheduler.every(config.updateWatchInterval, () => this.update())
    }

    ctx.command('mjob.riichi-city.watch <uuid:string>')
      .option('fid', '-f <fid:string>')
      .action(async ({ session }, uuid) => {
        const watcher = new RiichiCityWatcher(this, {
          type: RiichiCityProvider.provider,
          provider: this,
          watchId: uuid,
          players: [],
        })
        this.submit(watcher)
        return session.text('mjob.general.success')
      })
  }

  async #update(forceSync: boolean = false) {
    const curtime = Date.now() / 1000
    const fids = this.ctx.mjob.$fid ? await this.ctx.mjob.$fid.getAllFids() : DEFAULT_FIDS
    const fnames = this.ctx.mjob.$fid ? await this.ctx.mjob.$fid.getFnames(fids) : DEFAULT_FNAMES
    const watchables: Watchable<typeof RiichiCityProvider.provider, Player>[] = []

    for (const fid of fids) {
      const documents = await this.ctx['riichi-city'].api.listGames(fid.length <= 3 ? {
        playerCount: +fid[0] as 3 | 4,
        round: +fid[1] as 1 | 2,
        stageType: +fid[2],
      } : {
        classifyID: fid,
      })

      for (const document of documents) {
        document.fid = fid
        document.fname = fnames[fid] || fid

        // Basic checking
        if (document.isEnd) continue
        if (!forceSync && curtime - document.startTime > this.config.matchExpireTime) continue
        if (this.ctx.mjob.watchers.has(`${this.key}:${document.roomId}`)) continue

        const watchable = {
          type: this.key,
          provider: this,
          watchId: document.roomId,
          players: document.players.map(p =>
            Object.assign(`$${p.userId}`, {
              userId: p.userId,
              nickname: p.nickname,
            })),
          // The raw document
          document,
        }
        watchables.push(watchable)
      }
    }

    if (await this.ctx.serial('mjob/attach', watchables, RiichiCityProvider.provider)) return

    for (const watchable of watchables) {
      if (watchable.decision !== 'approved') continue
      if (await this.ctx.serial('mjob/before-watch', watchable)) continue

      const watcher = new RiichiCityWatcher(this, watchable)
      await this.ctx.parallel('mjob/watch', watcher)

      if (this.ctx.mjob.watchers.has(watcher.wid)) continue
      if (this.submit(watcher)) watcher.logger.info(`Watch ${watcher.watchId}`)
    }
  }

  async update(forceSync: boolean = false) {
    try {
      return await this.#update(forceSync)
    } catch (e) {
      this.ctx.logger.warn(e)
    }
  }

  async stringifySubscriptions(aids: Iterable<string>) {
    const accounts = await this.ctx['riichi-city'].getAccounts([...aids].map(x => Number(x.slice(1))))
    return Object.entries(accounts).map(([aid, account]) => account?.nickname ?? `$${aid}`)
  }

  restoreWatcher(data: RiichiCityProvider.WatcherDump) {
    const watcher = RiichiCityWatcher.restore(this, data)
    return !!this.submit(watcher)
  }
}

export interface Player extends BasePlayer {
  userId: number
  nickname: string
  point?: number
  dpoint?: number
  hais?: number[][]
}

export namespace RiichiCityProvider {
  export interface Config extends RiichiCityWatcher.Config, RiichiCityFid.Config {
    updateWatchInterval: number
    matchExpireTime: number
  }

  export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
      updateWatchInterval: Schema.natural().role('ms').default(90 * Time.second),
      matchExpireTime: Schema.natural().default(600).description('in seconds'),
    }),
    RiichiCityWatcher.Config.description('Watcher'),
    RiichiCityFid.Config.description('Filter'),
  ])

  export interface WatcherDump extends BaseWatcherDump {
    id: string
    document: types.Room
    seq: number
  }
}

export default RiichiCityProvider
