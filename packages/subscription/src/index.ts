import { Context, Dict, Schema } from 'koishi'
import { CoreService, Player, Provider, ProviderType } from '@hieuzest/koishi-plugin-mjob'
import { NotifyService } from './notify'

declare module 'koishi' {
  interface Tables {
    'mjob/subscriptions': Subscription
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
  static inject = ['database', 'mjob']

  constructor(ctx: Context, config: SubscriptionService.Config) {
    super(ctx, '$subscription')

    ctx.plugin(NotifyService)

    this.extendDump(['subscribers'])

    ctx.model.extend('mjob/subscriptions', {
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
        .filter((watcher) => session.cid in (watcher.subscribers || {}))
        .map((watcher) =>
          session.text(`mjob.${watcher.type}.status`, { watcher }),
        )
        .join('\n')
    })

    ctx.on('mjob/attach', async (watchables, provider) => {
      if (!provider) return
      const subscriptions = await this.get(null, provider as never)
      await Promise.all(watchables.map(async watchable => {
        if (watchable.players.some((p: Player) => subscriptions.has(p.valueOf()))) {
          watchable.decision = 'approved'
          watchable.subscribers = await this.getSubscribers(watchable.players, watchable.type as never)
        }
      }))
    })
  }

  async add(cid: string, subscriptions: string[], provider?: ProviderType) {
    provider = Provider.ensure(this[Context.current], provider)
    await this.ctx.database.upsert('mjob/subscriptions', subscriptions.map(player => {
      return {
        provider,
        cid,
        player,
      }
    }))
  }

  async remove(cid: string, subscriptions: string[], provider?: ProviderType) {
    provider = Provider.ensure(this[Context.current], provider)
    await this.ctx.database.remove('mjob/subscriptions', {
      provider,
      cid,
      player: {
        $in: subscriptions,
      },
    })
  }

  async get(cid?: string, provider?: ProviderType) {
    provider = Provider.ensure(this[Context.current], provider)
    let query: Pick<Subscription, 'player'>[]
    if (cid) {
      query = await this.ctx.database.get('mjob/subscriptions', {
        provider,
        cid,
      }, ['player'])
    } else {
      query = await this.ctx.database.get('mjob/subscriptions', {
        provider,
      }, ['player'])
    }
    return new Set(query.map(x => x.player))
  }

  async getSubscribers<P extends Player = Player>(players: P[], provider?: ProviderType) {
    provider = Provider.ensure(this[Context.current], provider)
    const query = await this.ctx.database.get('mjob/subscriptions', {
      provider,
      player: {
        $in: players.map(p => p.valueOf()),
      },
    })
    const ret: Subscribers = {}
    query.forEach(x => {
      if (x.cid in ret) ret[x.cid].push(x.player)
      else ret[x.cid] = [x.player]
    })
    return ret
  }
}

export type Subscribers = Dict<string[]>

export namespace SubscriptionService {
  export interface Config {}

  export const Config: Schema<Config> = Schema.object({})
}

export default SubscriptionService
