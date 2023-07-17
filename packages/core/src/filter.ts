import { Context, Schema } from 'koishi'
import { Mjob, CoreService } from '.'
import { parsePlatform, ChannelLike } from './utils'

declare module 'koishi' {
  interface Tables {
    'mjob/filters': Filter
  }
}

interface Filter<T extends keyof Mjob.Providers=keyof Mjob.Providers> {
  platform: string
  channelId: string
  provider: T
  value: WatcherFilters[T]
}

declare module '.' {
  namespace Mjob {
    interface CoreServices {
      $filter: FilterService
    }
  }
}

export interface WatcherFilters {}

class FilterService extends CoreService {
  constructor(ctx: Context, config: {}) {
    super(ctx, '$filter')
  }

}

namespace FilterService {

  export interface Config {

  }

  export const Config: Schema<Config> = Schema.object({

  }).description('Subscription')
}
