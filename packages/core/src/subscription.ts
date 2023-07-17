import { Awaitable, Context, Schema } from 'koishi'
import { CoreService, Provider } from './service'
import { Mjob } from '.'
import { parsePlatform, ChannelLike } from './utils'

declare module 'koishi' {
  // interface Events {
  //   'mjob/subscription'(platform: string, id: string, players: string[]): Awaitable<boolean>
  // }

  interface Tables {
    'mjob/subscriptions': Subscription
  }
}

interface Subscription {
  platform: string
  channelId: string
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
  // static using = ['database', 'mjob']

  constructor(ctx: Context, config: SubscriptionService.Config) {
    super(ctx, '$subscription')
    ctx.model.extend('mjob/subscriptions', {
      // @ts-ignore
      provider: 'string',
      platform: 'string',
      channelId: 'string',
      player: 'string',
    }, {
      primary: ['provider', 'platform', 'channelId', 'player'],
    })

  }

  async add(channel: ChannelLike, subscriptions: string[], provider?: keyof Mjob.Providers) {
    provider ||= Provider.get(this.caller)
    if (!provider) throw new Error('Must provide provider')
    const [platform, channelId] = parsePlatform(channel)
    await this.ctx.database.upsert('mjob/subscriptions', subscriptions.map(player => {
      return {
        provider,
        platform,
        channelId,
        player,
      }
    }))
  }

  async remove(channel: ChannelLike, subscriptions: string[], provider?: keyof Mjob.Providers) {
    provider ||= Provider.get(this.caller)
    if (!provider) throw new Error('Must provide provider')
    const [platform, channelId] = parsePlatform(channel)
    await this.ctx.database.remove('mjob/subscriptions', {
        provider,
        platform,
        channelId,
        player: {
          $in: subscriptions
        },
      })
  }

  async get(channel?: ChannelLike, provider?: keyof Mjob.Providers) {
    provider ||= Provider.get(this.caller)
    if (!provider) throw new Error('Must provide provider')
    let query: Pick<Subscription, 'player'>[]
    if (channel) {
      const [platform, channelId] = parsePlatform(channel)
      query = await this.ctx.database.get('mjob/subscriptions', {
        provider,
        platform,
        channelId,
      }, ['player'])
    } else {
      query = await this.ctx.database.get('mjob/subscriptions', {
        provider,
      }, ['player'])
    }
    return new Set(query.map(x => x.player))
  }

  async getSubscriber(players: string[], provider?: keyof Mjob.Providers) {
    provider ||= Provider.get(this.caller)
    if (!provider) throw new Error('Must provide provider')
    const query = await this.ctx.database.get('mjob/subscriptions', {
      provider,
      player: {
        $in: players
      },
    })
    return query.map(x => `${x.platform}:${x.channelId}`)
  }

}

export namespace SubscriptionService {
  export interface Config {

  }
  
  export const Config: Schema<Config> = Schema.object({

  }).description('Subscription')
}
