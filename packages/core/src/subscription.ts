import { Awaitable, Context, Dict, Schema } from 'koishi'
import { CoreService, Provider } from './service'
import { Mjob } from '.'

declare module 'koishi' {
  // interface Events {
  //   'mjob/subscription'(platform: string, id: string, players: string[]): Awaitable<boolean>
  // }

  interface Tables {
    'mjob/subscriptions': Subscription
  }
}

interface Subscription {
  cid: string
  provider: keyof Mjob.Providers
  player: string
}

declare module '.' {
  namespace Mjob {
    interface CoreServices {
      $subscription: SubscriptionService
    }
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

  }

  async add(cid: string, subscriptions: string[], provider?: keyof Mjob.Providers) {
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

  async remove(cid: string, subscriptions: string[], provider?: keyof Mjob.Providers) {
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

  async get(cid?: string, provider?: keyof Mjob.Providers) {
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

  async getSubscribers(players: string[], provider?: keyof Mjob.Providers) {
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

  }).description('Subscription')
}

export default SubscriptionService
