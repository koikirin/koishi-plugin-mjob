import { } from '@koishijs/plugin-admin'
import { Context, Logger, Schema } from 'koishi'
import { } from '@hieuzest/koishi-plugin-mjob-subscription'
import { CoreService, Provider, ProviderType, Watcher } from '@hieuzest/koishi-plugin-mjob'

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
  static using = ['mjob.$subscription', 'database']

  private fnameGetters: Record<ProviderType, FnameGetter>
  private defaultFids: Record<ProviderType, string[]>
  private filterEnableds: Record<ProviderType, boolean>

  constructor(ctx: Context, config: FidService.Config) {
    super(ctx, '$fid', {immediate: true})

    this.fnameGetters = {}
    this.defaultFids = {}
    this.filterEnableds = {}

    ctx.model.extend('mjob/fids', {
      provider: 'string' as never,
      cid: 'string',
      fid: 'string'
    }, {
      primary: ['provider', 'cid', 'fid']
    })

    ctx.model.extend('mjob/fnames', {
      provider: 'string' as never,
      fid: 'string',
      fname: 'string',
    }, {
      primary: ['provider', 'fid'],
    })

    ctx.command('mjob.fid.list', { admin: { channel: true } })
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }, ...players) => {
        const fids = await this.getFids(session.cid, options.provider as never)
        const fnames = await this.getFnames(fids, options.provider as never)
        return JSON.stringify(fnames)
      })

    ctx.command('mjob.fid.add <...fids>', { admin: { channel: true } })
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }, ...fids) => {
        await this.addFids(session.cid, fids, options.provider as never)
        return 'Finish'
      })

    ctx.command('mjob.fid.remove <...fids>', { admin: { channel: true } })
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }, ...fids) => {
        await this.removeFids(session.cid, fids, options.provider as never)
        return 'Finish'
      })

    ctx.command('mjob.fid.reset', { admin: { channel: true } })
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }) => {
        await this.clearFids(session.cid, options.provider as never)
        return 'Finish'
      })

    ctx.on('mjob/watch', async (watcher: Watcher) => {
      if (!(this.filterEnableds[watcher.type] ?? true)) return
      for (const [channel, players] of Object.entries(watcher.subscribers||{})) {
        const fids = await this.getFids(channel, watcher.type)
        if (!fids.includes(watcher.document?.fid)) {
          delete watcher.subscribers[channel]
        }
      }
      if (!Object.keys(watcher.subscribers).length) return true
    })
  }

  async getDefaultFids(provider?: ProviderType): Promise<string[]> {
    provider ||= Provider.get(this.caller) as never
    if (!provider || !Provider.keys.has(provider)) throw new Error('Must provide provider')
    if (this.defaultFids[provider]) return this.defaultFids[provider]
    return (await this.ctx.database.get('mjob/fids', { cid: '', provider })).map(x => x.fid)
  }

  async getFids(cid: string, provider?: ProviderType) {
    const filter = await this.ctx.database.get('mjob/fids', { cid, provider })
    return filter.length ? filter.map(x => x.fid) : await this.getDefaultFids(provider as never)
  }

  async getAllFids(provider?: ProviderType) {
    const filter = await this.ctx.database.get('mjob/fids', { provider })
    return [...new Set([...filter.map(x => x.fid), ...await this.getDefaultFids(provider)])]
  }

  async addFids(cid: string, fids: string[], provider?: ProviderType) {
    await this.ctx.database.upsert('mjob/fids', fids.map(fid => { return { cid, provider, fid }}))
  }

  async removeFids(cid: string, fids: string[], provider?: ProviderType) {
    await this.ctx.database.remove('mjob/fids', { cid, provider, fid: {
      $in: fids
    } })
  }

  async clearFids(cid: string, provider?: ProviderType) {
    await this.ctx.database.remove('mjob/fids', { cid, provider })
  }

  async getFname(fid: string, provider?: ProviderType) {
    provider ||= Provider.get(this.caller) as never
    if (!provider || !Provider.keys.has(provider)) throw new Error('Must provide provider')
    const f = await this.ctx.database.get('mjob/fnames', { provider, fid })
    if (!f.length && this.fnameGetters[provider]) {
      const fname = await (this.fnameGetters[provider] as FnameGetter)(fid)
      await this.setFname(fid, fname, provider)
      return fname
    } else return f?.[0]?.fname
  }

  async getFnames(fids: string[], provider?: ProviderType) {
    provider ||= Provider.get(this.caller) as never
    if (!provider || !Provider.keys.has(provider)) throw new Error('Must provide provider')
    return Object.fromEntries(await Promise.all(fids.map(async fid => [fid, await this.getFname(fid, provider)])))
  }

  async setFname(fid: string, fname: string, provider?: ProviderType) {
    provider ||= Provider.get(this.caller) as never
    if (!provider || !Provider.keys.has(provider)) throw new Error('Must provide provider')
    await this.ctx.database.upsert('mjob/fnames', [{ provider, fid, fname }])
  }

  registerFnameGetter(value: FnameGetter, provider?: ProviderType) {
    provider ||= Provider.get(this.caller) as never
    if (!provider || !Provider.keys.has(provider)) throw new Error('Must provide provider')
    this.fnameGetters[provider] = value as never
    return this.caller.collect('fnameGetter', () => delete this.fnameGetters[provider])
  }

  setDefaultFids(value: string[], flush: boolean = false, provider?: ProviderType) {
    provider ||= Provider.get(this.caller) as never
    if (!provider || !Provider.keys.has(provider)) throw new Error('Must provide provider')
    this.defaultFids[provider] = value as never
    if (flush) {
      this.clearFids('', provider).then(() => this.addFids('', value, provider)).catch(logger.error)
    }
    return this.caller.collect('defaultFids', () => delete this.defaultFids[provider])
  }

  setFilterEnabled(value: boolean, provider?: ProviderType) {
    provider ||= Provider.get(this.caller) as never
    if (!provider || !Provider.keys.has(provider)) throw new Error('Must provide provider')
    this.filterEnableds[provider] = value as never
  }
}

export namespace FidService {
  export interface Config {

  }
  
  export const Config: Schema<Config> = Schema.object({

  })
}

export default FidService
