import { Context, Dict, Logger, Schema } from 'koishi'
import { } from '@hieuzest/koishi-plugin-mjob-subscription'
import { CoreService, Mjob, Provider, ProviderType, Watchable } from '@hieuzest/koishi-plugin-mjob'

const logger = new Logger('mjob.$fid')

declare module 'koishi' {
  interface Tables {
    'mjob/fnames': Fname
    'mjob/fids': Fid
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

export class FidService extends CoreService {
  static inject = ['mjob', 'mjob.$subscription', 'database']

  private fnameGetters: Record<ProviderType, FnameGetter>
  private defaultFids: Record<ProviderType, string[]>
  private filterEnableds: Record<ProviderType, boolean>

  constructor(ctx: Context, config: FidService.Config) {
    super(ctx, '$fid')

    this.fnameGetters = {}
    this.defaultFids = {}
    this.filterEnableds = {}

    ctx.model.extend('mjob/fids', {
      provider: 'string' as never,
      cid: 'string',
      fid: 'string',
    }, {
      primary: ['provider', 'cid', 'fid'],
    })

    ctx.model.extend('mjob/fnames', {
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
    provider = Provider.ensure(this[Context.current], provider)
    if (this.defaultFids[provider]) return this.defaultFids[provider]
    return (await this.ctx.database.get('mjob/fids', { cid: '', provider })).map(x => x.fid)
  }

  async getFids(cid: string, provider?: ProviderType) {
    provider = Provider.ensure(this[Context.current], provider)
    const filter = await this.ctx.database.get('mjob/fids', { cid, provider })
    return filter.length ? filter.map(x => x.fid) : await this.getDefaultFids(provider as never)
  }

  async getAllFids(provider?: ProviderType) {
    provider = Provider.ensure(this[Context.current], provider)
    const filter = await this.ctx.database.get('mjob/fids', { provider })
    return [...new Set([...filter.map(x => x.fid), ...await this.getDefaultFids(provider)])]
  }

  async addFids(cid: string, fids: string[], provider?: ProviderType) {
    provider = Provider.ensure(this[Context.current], provider)
    const old = await this.getFids(cid, provider)
    await this.ctx.database.upsert('mjob/fids', [...old, ...fids].map(fid => ({ cid, provider, fid })))
  }

  async setFids(cid: string, fids: string[], provider?: ProviderType) {
    provider = Provider.ensure(this[Context.current], provider)
    await this.clearFids(cid, provider)
    await this.ctx.database.upsert('mjob/fids', fids.map(fid => ({ cid, provider, fid })))
  }

  async removeFids(cid: string, fids: string[], provider?: ProviderType) {
    provider = Provider.ensure(this[Context.current], provider)
    const filter = await this.ctx.database.get('mjob/fids', { cid, provider })
    if (filter.length) {
      await this.ctx.database.remove('mjob/fids', {
        cid,
        provider,
        fid: {
          $in: fids,
        },
      })
    } else {
      const old = await this.getDefaultFids(provider as never)
      await this.ctx.database.upsert('mjob/fids', old.filter(fid => !fids.includes(fid)).map(fid => ({ cid, provider, fid })))
    }
  }

  async clearFids(cid: string, provider?: ProviderType) {
    provider = Provider.ensure(this[Context.current], provider)
    await this.ctx.database.remove('mjob/fids', { cid, provider })
  }

  async getFname(fid: string, provider?: ProviderType) {
    provider = Provider.ensure(this[Context.current], provider)
    try {
      const f = await this.ctx.database.get('mjob/fnames', { provider, fid })
      if (!f.length && this.fnameGetters[provider]) {
        const fname = await (this.fnameGetters[provider] as FnameGetter)(fid)
        await this.setFname(fid, fname, provider)
        return fname
      } else return f?.[0]?.fname
    } catch (e) {
      logger.error(e)
      return fid
    }
  }

  async getFnames(fids: string[], provider?: ProviderType): Promise<Dict> {
    provider = Provider.ensure(this[Context.current], provider)
    try {
      const fs = Object.fromEntries((await this.ctx.database.get('mjob/fnames', { provider })).map(x => [x.fid, x.fname]))
      const res = {}
      for (const fid of fids) {
        if (fid in fs) res[fid] = fs[fid]
        else if (this.fnameGetters[provider]) {
          const fname = await (this.fnameGetters[provider] as FnameGetter)(fid)
          await this.setFname(fid, fname, provider)
          res[fid] = fname
        } else res[fid] = fid
      }
      return res
    } catch (e) {
      logger.error(e)
      return {}
    }
  }

  async getAllFnames(fids: string[] = [], provider?: ProviderType): Promise<Dict> {
    provider = Provider.ensure(this[Context.current], provider)
    try {
      const res = Object.fromEntries((await this.ctx.database.get('mjob/fnames', { provider })).map(x => [x.fid, x.fname]))
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
      logger.error(e)
      return {}
    }
  }

  async setFname(fid: string, fname: string, provider?: ProviderType) {
    provider = Provider.ensure(this[Context.current], provider)
    await this.ctx.database.upsert('mjob/fnames', [{ provider, fid, fname }])
  }

  registerFnameGetter(value: FnameGetter, provider?: ProviderType) {
    provider = Provider.ensure(this[Context.current], provider)
    this.fnameGetters[provider] = value as never
    return this[Context.current].collect('fnameGetter', () => delete this.fnameGetters[provider])
  }

  setDefaultFids(value: string[], flush: boolean = false, provider?: ProviderType) {
    provider = Provider.ensure(this[Context.current], provider)
    this.defaultFids[provider] = value as never
    if (flush) {
      this.clearFids('', provider).then(() => this.addFids('', value, provider)).catch(logger.error)
    }
    return this[Context.current].collect('defaultFids', () => delete this.defaultFids[provider])
  }

  setFilterEnabled(value: boolean, provider?: ProviderType) {
    provider = Provider.ensure(this[Context.current], provider)
    this.filterEnableds[provider] = value as never
  }
}

export namespace FidService {
  export interface Config {}

  export const Config: Schema<Config> = Schema.object({})
}

export default FidService
