import { Context, Driver, Keys, Row, Schema, Update } from 'koishi'
import { CoreService, Provider, ProviderType } from '@hieuzest/koishi-plugin-mjob'

declare module 'koishi' {
  interface Tables {
    'mjob/filters': Filter
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
  static using = ['database', 'mjob']

  constructor(ctx: Context, config: FilterService.Config) {
    super(ctx, '$filter')

    ctx.model.extend('mjob/filters', {
      provider: 'string' as never,
      cid: 'string',
    }, {
      primary: ['provider', 'cid'],
    })
  }

  async set(cid: string, fields: Row.Computed<Filter, Update<Filter>>, provider?: ProviderType) {
    provider ||= Provider.get(this.caller)
    if (!provider) throw new Error('Must provide provider')
    await this.ctx.database.upsert('mjob/filters', [{
      provider,
      cid,
      ...fields
    }])
  }

  async get<K extends Keys<Filter>>(cid: string, fields?: Driver.Cursor<K>, provider?: ProviderType): Promise<Pick<Filter, K>> {
    provider ||= Provider.get(this.caller)
    if (!provider) throw new Error('Must provide provider')
    const query = await this.ctx.database.get('mjob/filters', {
      provider,
      cid,
    }, fields)
    return query?.[0]
  }
}

export namespace FilterService {
  export interface Config {

  }

  export const Config: Schema<Config> = Schema.object({

  })
}

export default FilterService