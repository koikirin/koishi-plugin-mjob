import { Context, Schema } from 'koishi'
import { CoreService, Provider, ProviderType } from '@hieuzest/koishi-plugin-mjob'
import { } from '@koishijs/plugin-admin'

declare module 'koishi' {
  interface Tables {
    'mjob/filters': Filter
  }
}

interface Filter<T extends ProviderType = ProviderType> {
  cid: string
  provider: T
  value: WatcherFilters[T]
}

declare module '@hieuzest/koishi-plugin-mjob' {
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

    ctx.command('mjob.filter.list', { admin: { channel: true } })
      .action(async ({ session }, ...players) => {
        const filter = await this.get(session.cid)
      })

    ctx.command('mjob.filter.add', { admin: { channel: true } })
      .action(async ({ session }, ...players) => {
        const filter = await this.get('')
      })
  }

  async set<T extends ProviderType>(cid: string, value: WatcherFilters[T], provider?: T) {
    provider ||= Provider.get(this.caller)
    if (!provider) throw new Error('Must provide provider')
    await this.ctx.database.upsert('mjob/filters', [{
      provider,
      cid,
      value,
    }])
  }

  async get<T extends ProviderType>(cid: string, provider?: T): Promise<WatcherFilters[T]> {
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

  })
}

export default FilterService