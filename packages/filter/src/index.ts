import { Context, Row, Schema, Time, Update } from 'koishi'
import { } from '@koishijs/cache'
import { CoreService, Provider, ProviderType } from '@hieuzest/koishi-plugin-mjob'
import { SwtichFilter } from './switch'

declare module 'koishi' {
  interface Tables {
    'mjob.filters': Filter
  }
}

declare module '@koishijs/cache' {
  interface Tables {
    'mjob.filters': Filter
  }
}

export interface Filter {
  cid: string
  provider: ProviderType
}

declare module '@hieuzest/koishi-plugin-mjob' {
  namespace Mjob {
    interface CoreServices {
      $filter: FilterService
    }
  }
}

export class FilterService extends CoreService {
  static inject = ['cache', 'database', 'mjob']

  constructor(ctx: Context, public config: FilterService.Config) {
    super(ctx, '$filter')

    ctx.model.extend('mjob.filters', {
      provider: 'string' as never,
      cid: 'string',
    }, {
      primary: ['provider', 'cid'],
    })

    ctx.plugin(SwtichFilter)
  }

  async set(cid: string, fields: Row.Computed<Filter, Update<Filter>>, provider?: ProviderType) {
    provider = Provider.ensure(this.ctx, provider)
    await this.ctx.database.upsert('mjob.filters', [{
      provider,
      cid,
      ...fields,
    }])
    await this.ctx.cache.delete('mjob.filters', `${provider}:${cid}`)
  }

  private async _get(cid: string, provider?: ProviderType): Promise<Filter> {
    provider = Provider.ensure(this.ctx, provider)
    const [query] = await this.ctx.database.get('mjob.filters', {
      provider,
      cid,
    })
    if (query) await this.ctx.cache.set('mjob.filters', `${provider}:${cid}`, query, this.config.cacheTTL)
    return query
  }

  async get(cid: string, provider?: ProviderType): Promise<Filter> {
    provider = Provider.ensure(this.ctx, provider)
    const cached = await this.ctx.cache.get('mjob.filters', `${provider}:${cid}`)
    return cached || this._get(cid, provider)
  }
}

export namespace FilterService {
  export interface Config {
    cacheTTL: number
  }

  export const Config: Schema<Config> = Schema.object({
    cacheTTL: Schema.natural().role('ms').default(Time.hour),
  })
}

export default FilterService
