import { Context, Dict, Schema, Time } from 'koishi'
import { } from '@koishijs/cache'
import { } from '@hieuzest/koishi-plugin-mjob-subscription'
import { CoreService, Mjob, Provider, ProviderType, Watchable } from '@hieuzest/koishi-plugin-mjob'

declare module 'koishi' {
  interface Tables {
    'mjob.fnames': Fname
    'mjob.fids': Fid
  }
}

declare module '@koishijs/cache' {
  interface Tables {
    'mjob.fids': string[]
  }
}

declare module '@hieuzest/koishi-plugin-mjob' {
  namespace Mjob {
    interface CoreServices {
      $fid: FidService
    }
  }

  interface Watchable {
    document?: {
      fid?: string
    }
  }
}

interface Fid {
  provider: ProviderType
  cid: string
  fid: string
}

interface Fname {
  provider: ProviderType
  fid: string
  fname: string
}

type FnameGetter = (fid: string) => Promise<string>

const DISABLED_FID = '/'

export class FidService extends CoreService {
  static inject = ['cache', 'database', 'mjob', 'mjob.$subscription']

  private fnameGetters: Record<ProviderType, FnameGetter>
  private defaultFids: Record<ProviderType, string[]>
  private filterEnableds: Record<ProviderType, boolean>

  readonly DISABLED_FID = DISABLED_FID

  constructor(ctx: Context, public config: FidService.Config) {
    super(ctx, '$fid')

    this.fnameGetters = {}
    this.defaultFids = {}
    this.filterEnableds = {}

    ctx.model.extend('mjob.fids', {
      provider: 'string' as never,
      cid: 'string',
      fid: 'string',
    }, {
      primary: ['provider', 'cid', 'fid'],
    })

    ctx.model.extend('mjob.fnames', {
      provider: 'string' as never,
      fid: 'string',
      fname: 'string',
    }, {
      primary: ['provider', 'fid'],
    })

    ctx.command('mjob.fid.list')
      .option('channel', '-c <channel:channel>', Mjob.Const.channelOptionConfig)
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }) => {
        const fids = await this.getFids(options.channel || session.cid, options.provider as never)
        const fnames = await this.getFnames(fids, options.provider as never)
        return Object.entries(fnames).map(([fid, fname]) => `${fid}: ${fname}`).join('\n')
      })

    ctx.command('mjob.fid.add <...fids>')
      .option('channel', '-c <channel:channel>', Mjob.Const.channelOptionConfig)
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }, ...fids) => {
        await this.addFids(options.channel || session.cid, fids, options.provider as never)
        return session.text('mjob.general.success')
      })

    ctx.command('mjob.fid.set <...fids>')
      .option('channel', '-c <channel:channel>', Mjob.Const.channelOptionConfig)
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }, ...fids) => {
        await this.setFids(options.channel || session.cid, fids, options.provider as never)
        return session.text('mjob.general.success')
      })

    ctx.command('mjob.fid.remove <...fids>')
      .option('channel', '-c <channel:channel>', Mjob.Const.channelOptionConfig)
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }, ...fids) => {
        await this.removeFids(options.channel || session.cid, fids, options.provider as never)
        return session.text('mjob.general.success')
      })

    ctx.command('mjob.fid.reset')
      .option('channel', '-c <channel:channel>', Mjob.Const.channelOptionConfig)
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }) => {
        await this.clearFids(options.channel || session.cid, options.provider as never)
        return 'Finish'
      })

    ctx.before('mjob/watch', async (watchable: Watchable) => {
      if (!(this.filterEnableds[watchable.type] ?? true)) return
      for (const [channel] of Object.entries(watchable.subscribers || {})) {
        const fids = await this.getFids(channel, watchable.type)
        if (!fids?.includes(watchable.document?.fid)) {
          delete watchable.subscribers[channel]
        }
      }
      if (!Object.keys(watchable.subscribers).length) return true
    })
  }

  async getDefaultFids(provider?: ProviderType): Promise<string[]> {
    provider = Provider.ensure(this.ctx, provider)
    if (this.defaultFids[provider]) return this.defaultFids[provider]
    return (await this.ctx.database.get('mjob.fids', { cid: '', provider })).map(x => x.fid)
  }

  async _getFids(cid: string, provider?: ProviderType) {
    provider = Provider.ensure(this.ctx, provider)
    const filter = await this.ctx.database.get('mjob.fids', { cid, provider })
    const res = filter.length ? filter.map(x => x.fid) : await this.getDefaultFids(provider as never)
    await this.ctx.cache.set('mjob.fids', `${provider}:${cid}`, res, this.config.cacheTTL)
    return res
  }

  async getFids(cid: string, provider?: ProviderType) {
    provider = Provider.ensure(this.ctx, provider)
    const cache = await this.ctx.cache.get('mjob.fids', `${provider}:${cid}`)
    return cache || this._getFids(cid, provider)
  }

  async getAllFids(provider?: ProviderType) {
    provider = Provider.ensure(this.ctx, provider)
    const filter = await this.ctx.database.get('mjob.fids', { provider })
    return [...new Set([...filter.map(x => x.fid), ...await this.getDefaultFids(provider)])]
  }

  async addFids(cid: string, fids: string[], provider?: ProviderType) {
    provider = Provider.ensure(this.ctx, provider)
    const old = await this.getFids(cid, provider)
    await this.ctx.database.upsert('mjob.fids', [...old, ...fids].map(fid => ({ cid, provider, fid })))
    await this.ctx.cache.delete('mjob.fids', `${provider}:${cid}`)
  }

  async setFids(cid: string, fids: string[], provider?: ProviderType) {
    provider = Provider.ensure(this.ctx, provider)
    await this.clearFids(cid, provider)
    await this.ctx.database.upsert('mjob.fids', fids.map(fid => ({ cid, provider, fid })))
    await this.ctx.cache.delete('mjob.fids', `${provider}:${cid}`)
  }

  async removeFids(cid: string, fids: string[], provider?: ProviderType) {
    provider = Provider.ensure(this.ctx, provider)
    const filter = await this.ctx.database.get('mjob.fids', { cid, provider })
    if (filter.length) {
      await this.ctx.database.remove('mjob.fids', {
        cid,
        provider,
        fid: {
          $in: fids,
        },
      })
    } else {
      const old = await this.getDefaultFids(provider as never)
      await this.ctx.database.upsert('mjob.fids', old.filter(fid => !fids.includes(fid)).map(fid => ({ cid, provider, fid })))
    }
    await this.ctx.cache.delete('mjob.fids', `${provider}:${cid}`)
  }

  async clearFids(cid: string, disabled: boolean = false, provider?: ProviderType) {
    provider = Provider.ensure(this.ctx, provider)
    await this.ctx.database.remove('mjob.fids', { cid, provider })
    if (disabled) await this.ctx.database.create('mjob.fids', { cid, provider, fid: DISABLED_FID })
    await this.ctx.cache.delete('mjob.fids', `${provider}:${cid}`)
  }

  async getFname(fid: string, provider?: ProviderType) {
    provider = Provider.ensure(this.ctx, provider)
    try {
      const f = await this.ctx.database.get('mjob.fnames', { provider, fid })
      if (!f.length && this.fnameGetters[provider]) {
        const fname = await (this.fnameGetters[provider] as FnameGetter)(fid)
        await this.setFname(fid, fname, provider)
        return fname
      } else return f?.[0]?.fname
    } catch (e) {
      this.ctx.logger.warn(e)
      return fid
    }
  }

  async getFnames(fids: string[] = [], provider?: ProviderType): Promise<Dict> {
    provider = Provider.ensure(this.ctx, provider)
    try {
      const res = Object.fromEntries((await this.ctx.database.get('mjob.fnames', { provider })).map(x => [x.fid, x.fname]))
      for (const fid of fids) {
        if (fid in res) continue
        else if (this.fnameGetters[provider]) {
          const fname = await (this.fnameGetters[provider] as FnameGetter)(fid)
          await this.setFname(fid, fname, provider)
          res[fid] = fname
        } else res[fid] = fid
      }
      return res
    } catch (e) {
      this.ctx.logger.warn(e)
      return {}
    }
  }

  async setFname(fid: string, fname: string, provider?: ProviderType) {
    provider = Provider.ensure(this.ctx, provider)
    await this.ctx.database.upsert('mjob.fnames', [{ provider, fid, fname }])
  }

  registerFnameGetter(value: FnameGetter, provider?: ProviderType) {
    provider = Provider.ensure(this.ctx, provider)
    this.ctx.effect(() => {
      this.fnameGetters[provider] = value as never
      return () => delete this.fnameGetters[provider]
    })
  }

  setDefaultFids(value: string[], flush: boolean = false, provider?: ProviderType) {
    provider = Provider.ensure(this.ctx, provider)
    this.ctx.effect(() => {
      this.defaultFids[provider] = value as never
      if (flush) {
        this.clearFids('', provider).then(() => this.addFids('', value, provider)).catch(msg => this.ctx.logger.warn(msg))
      }
      return () => delete this.defaultFids[provider]
    })
  }

  setFilterEnabled(value: boolean, provider?: ProviderType) {
    provider = Provider.ensure(this.ctx, provider)
    this.filterEnableds[provider] = value as never
  }
}

export namespace FidService {
  export interface Config {
    cacheTTL: number
  }

  export const Config: Schema<Config> = Schema.object({
    cacheTTL: Schema.natural().role('ms').default(Time.hour),
  })
}

export default FidService
