import { Context, Dict, Schema, Time } from 'koishi'
import { } from '@koishijs/cache'
import { CoreService, Player, Provider, ProviderType } from '@hieuzest/koishi-plugin-mjob'
import { NotifyService } from './notify'

declare module 'koishi' {
  interface Tables {
    'mjob.subscriptions': Subscription
  }
}

declare module '@koishijs/cache' {
  interface Tables {
    'mjob.subscriptions': Subscription[]
  }
}

declare module '@hieuzest/koishi-plugin-mjob' {
  interface Provider {
    stringifySubscriptions?(subscriptions: Iterable<string>): Promise<Iterable<string>>
  }
}

interface Subscription {
  cid: string
  provider: ProviderType
  player: string
}

declare module '@hieuzest/koishi-plugin-mjob' {
  namespace Mjob {
    interface CoreServices {
      $subscription: SubscriptionService
    }
  }

  interface Watchable {
    subscribers?: Subscribers
  }

  interface Watcher extends Watchable {}
}

export class SubscriptionService extends CoreService {
  static inject = ['cache', 'database', 'mjob']

  _internalPlatforms: Set<string> = new Set()

  constructor(ctx: Context, public config: SubscriptionService.Config) {
    super(ctx, '$subscription')

    ctx.plugin(NotifyService, config)

    this.extendDump(['subscribers'])

    ctx.model.extend('mjob.subscriptions', {
      provider: 'string' as never,
      cid: 'string',
      player: 'string',
    }, {
      primary: ['provider', 'cid', 'player'],
    })

    ctx.command('mjob.add <...players:string>')
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }, ...players) => {
        await this.add(session.cid, players, options.provider as never)
        return session.text('mjob.general.success')
      })

    ctx.command('mjob.remove <...players:string>')
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }, ...players) => {
        await this.remove(session.cid, players, options.provider as never)
        return session.text('mjob.general.success')
      })

    ctx.command('mjob.clear')
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }) => {
        await this.clear(session.cid, options.provider as never)
        return session.text('mjob.general.success')
      })

    ctx.command('mjob.list')
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }) => {
        if (options.provider) {
          const players = await this.get(session.cid, options.provider as never)
          return [...players].join(', ')
        } else {
          let msg = ''
          for (const [key, provider] of Object.entries(ctx.mjob.providers)) {
            let players = await this.get(session.cid, key as never)
            if (provider.stringifySubscriptions) players = new Set(await provider.stringifySubscriptions(players))
            msg += session.text('mjob.commands.list-prompt', [session.text(`mjob.${key}.name`)]) + '\n'
            msg += session.text('mjob.commands.list', [...players]) + '\n'
          }
          return msg.trimEnd()
        }
      })

    ctx.command('mjob.status').action(async ({ session }) => {
      return session.text('mjob.commands.status-prompt') + '\n' + Object.values(this.ctx.mjob.watchers.watchers)
        .filter((watcher) => watcher.notifyChannels?.includes(session.cid) || session.cid in (watcher.subscribers || {}))
        .map((watcher) =>
          session.text(`mjob.${watcher.type}.status`, { watcher }),
        )
        .join('\n')
    })

    ctx.on('mjob/attach', async (watchables, provider) => {
      if (!provider) return
      const subscriptions = await this.get(null, provider as never)
      await Promise.all(watchables.map(async watchable => {
        if (subscriptions.has('*') || watchable.players.some((p: Player) => subscriptions.has(p.valueOf()))) {
          watchable.decision = 'approved'
          watchable.subscribers = await this.getSubscribers(watchable.players, watchable.type as never)
        }
      }))
    })
  }

  registerInternalPlatform(platform: string) {
    return this.ctx.effect(() => {
      this._internalPlatforms.add(platform)
      return () => this._internalPlatforms.delete(platform)
    })
  }

  isInternalChannel(cid: string) {
    const index = cid.indexOf(':')
    const platform = cid.slice(0, index)
    return this._internalPlatforms.has(platform)
  }

  async add(cid: string, subscriptions: string[], provider?: ProviderType) {
    provider = Provider.ensure(this.ctx, provider)
    await this.ctx.database.upsert('mjob.subscriptions', subscriptions.map(player => {
      return {
        provider,
        cid,
        player,
      }
    }))
    await this.ctx.cache.delete('mjob.subscriptions', provider)
  }

  async remove(cid: string, subscriptions: string[], provider?: ProviderType) {
    provider = Provider.ensure(this.ctx, provider)
    await this.ctx.database.remove('mjob.subscriptions', {
      provider,
      cid,
      player: {
        $in: subscriptions,
      },
    })
    await this.ctx.cache.delete('mjob.subscriptions', provider)
  }

  async clear(cid: string, provider?: ProviderType) {
    provider = Provider.ensure(this.ctx, provider)
    await this.ctx.database.remove('mjob.subscriptions', {
      provider,
      cid,
    })
    await this.ctx.cache.delete('mjob.subscriptions', provider)
  }

  async _get(cid?: string, provider?: ProviderType): Promise<Subscription[]> {
    provider = Provider.ensure(this.ctx, provider)
    let query: Subscription[]
    if (cid) {
      query = await this.ctx.database.get('mjob.subscriptions', {
        provider,
        cid,
      })
    } else {
      query = await this.ctx.database.get('mjob.subscriptions', {
        provider,
      })
      await this.ctx.cache.set('mjob.subscriptions', provider, query, this.config.cacheTTL)
    }
    return query
  }

  async get(cid?: string, provider?: ProviderType): Promise<Set<string>> {
    provider = Provider.ensure(this.ctx, provider)
    let query: Subscription[]
    if (!cid) query = await this.ctx.cache.get('mjob.subscriptions', provider)
    query ||= await this._get(cid, provider)
    return new Set(query.map(x => x.player))
  }

  async getByChannel(cid: string): Promise<Subscription[]> {
    return await this.ctx.database.get('mjob.subscriptions', { cid })
  }

  async getChannels(): Promise<string[]> {
    const query = await this.ctx.database.select('mjob.subscriptions').groupBy('cid').execute()
    return [...new Set(query.map(x => x.cid))]
  }

  async getSubscribers<P extends Player = Player>(players: P[], provider?: ProviderType): Promise<Subscribers> {
    provider = Provider.ensure(this.ctx, provider)
    const query = (await this.ctx.cache.get('mjob.subscriptions', provider)) || (await this._get(null, provider))
    const ret: Subscribers = {}
    query.forEach(x => {
      if (x.player === '*') {
        ret[x.cid] ||= []
        return
      }
      if (!players.some(player => player.valueOf() === x.player)) return
      ;(ret[x.cid] ||= []).push(x.player)
    })
    return ret
  }
}

export type Subscribers = Dict<string[]>

export namespace SubscriptionService {
  export interface Config extends NotifyService.Config {
    cacheTTL: number
  }

  export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
      cacheTTL: Schema.natural().role('ms').default(Time.hour),
    }),
    NotifyService.Config.description('Notify'),
  ])
}

export default SubscriptionService
