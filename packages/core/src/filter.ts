import { Context, Schema } from 'koishi'
import { CoreService, Provider } from './service'
import { Mjob } from '.'
import { parsePlatform, ChannelLike } from './utils'

declare module 'koishi' {
  interface Tables {
    'mjob/filters': Filter
  }
}

interface Filter<P extends keyof Mjob.Providers=keyof Mjob.Providers> {
  platform: string
  channelId: string
  provider: P
  value: WatcherFilters[P]
}

declare module '.' {
  namespace Mjob {
    interface CoreServices {
      $filter: FilterService
    }
  }
}

export interface WatcherFilters {}

export class FilterService extends CoreService {
  constructor(ctx: Context, config: {}) {
    super(ctx, '$filter')
  }

  async set<P extends keyof Mjob.Providers>(channel: ChannelLike, value: WatcherFilters[P], provider?: P) {
    provider ||= Provider.get(this.caller)
    if (!provider) throw new Error('Must provide provider')
    const [platform, channelId] = parsePlatform(channel)
    await this.ctx.database.upsert('mjob/filters', [{
      provider,
      platform,
      channelId,
      value,
    }])
  }

  async get<P extends keyof Mjob.Providers>(channel: ChannelLike, provider?: P): Promise<WatcherFilters[P]> {
    provider ||= Provider.get(this.caller)
    if (!provider) throw new Error('Must provide provider')
    const [platform, channelId] = parsePlatform(channel)
    const query = await this.ctx.database.get('mjob/filters', {
      provider,
      platform,
      channelId,
    }, ['value'])
    return query?.[0]?.value
  }

}

export namespace FilterService {
  export interface Config {

  }

  export const Config: Schema<Config> = Schema.object({

  }).description('Subscription')
}

export default FilterService