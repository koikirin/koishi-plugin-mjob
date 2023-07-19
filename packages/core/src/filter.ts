import { Context, Schema } from 'koishi'
import { CoreService, Provider } from './service'
import { Mjob } from '.'

declare module 'koishi' {
  interface Tables {
    'mjob/filters': Filter
  }
}

interface Filter<P extends keyof Mjob.Providers=keyof Mjob.Providers> {
  cid: string
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
  static using = ['database', 'mjob']

  constructor(ctx: Context, config: {}) {
    super(ctx, '$filter')

    ctx.model.extend('mjob/filters', {
      // @ts-ignore
      provider: 'string',
      cid: 'string',
      // @ts-ignore
      value: 'json',
    }, {
      primary: ['provider', 'cid'],
    })


  }

  async set<P extends keyof Mjob.Providers>(cid: string, value: WatcherFilters[P], provider?: P) {
    provider ||= Provider.get(this.caller)
    if (!provider) throw new Error('Must provide provider')
    await this.ctx.database.upsert('mjob/filters', [{
      provider,
      cid,
      value,
    }])
  }

  async get<P extends keyof Mjob.Providers>(cid: string, provider?: P): Promise<WatcherFilters[P]> {
    provider ||= Provider.get(this.caller)
    if (!provider) throw new Error('Must provide provider')
    const query = await this.ctx.database.get('mjob/filters', {
      provider,
      cid,
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