import { Awaitable, Context, Dict, Schema } from 'koishi'
import { CoreService, Provider, ProviderType, Watcher } from '@hieuzest/koishi-plugin-mjob'

declare module 'koishi' {
  interface Tables {
    'mjob/subscriptions': Subscription
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

  interface Watcher {
    subscribers: Subscribers
  }
}

export class SubscriptionService extends CoreService {
  static using = ['database', 'mjob']

  constructor(ctx: Context, config: SubscriptionService.Config) {
    super(ctx, '$subscription')

    ctx.model.extend('mjob/subscriptions', {
      // @ts-ignore
      provider: 'string',
      cid: 'string',
      player: 'string',
    }, {
      primary: ['provider', 'cid', 'player'],
    })

    ctx.command('mjob.add <...players:string>')
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }, ...players) => {
        await this.add(session.cid, players, options.provider as never)
        return 'Finished'
      })

    ctx.command('mjob.remove <...players:string>')
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }, ...players) => {
        await this.remove(session.cid, players, options.provider as never)
        return 'Finished'
      })

    ctx.command('mjob.list')
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }) => {
        const players = await this.get(session.cid, options.provider as never)
        return [...players].join(', ')
      })

    ctx.before('mjob/watch', async (watchables, provider) => {
      if (!provider) return
      const subscriptions = await this.get(null, provider)
      watchables.forEach(watchable => {
        if (watchable.players.some((p: string) => subscriptions.has(p.valueOf()))) watchable.decision = 'approved'
      })
    })

    ctx.on('mjob/watch', async watcher => {
      watcher.subscribers = await this.getSubscribers(watcher.players, watcher.type)
    })

  }

  async add(cid: string, subscriptions: string[], provider?: ProviderType) {
    provider ||= Provider.get(this.caller)
    if (!provider) throw new Error('Must provide provider')
    await this.ctx.database.upsert('mjob/subscriptions', subscriptions.map(player => {
      return {
        provider,
        cid,
        player,
      }
    }))
  }

  async remove(cid: string, subscriptions: string[], provider?: ProviderType) {
    provider ||= Provider.get(this.caller)
    if (!provider) throw new Error('Must provide provider')
    await this.ctx.database.remove('mjob/subscriptions', {
        provider,
        cid,
        player: {
          $in: subscriptions
        },
      })
  }

  async get(cid?: string, provider?: ProviderType) {
    provider ||= Provider.get(this.caller)
    if (!provider) throw new Error('Must provide provider')
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

  async getSubscribers(players: string[], provider?: ProviderType) {
    provider ||= Provider.get(this.caller)
    if (!provider) throw new Error('Must provide provider')
    const query = await this.ctx.database.get('mjob/subscriptions', {
      provider,
      player: {
        $in: players
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
  export interface Config {

  }
  
  export const Config: Schema<Config> = Schema.object({

  })
}

export default SubscriptionService