import { Context, Dict, Schema, Service } from 'koishi'
import { resolve } from 'path'
import { } from '@koishijs/plugin-console'
import { Watcher } from '@hieuzest/koishi-plugin-mjob'
import { } from '@hieuzest/koishi-plugin-mjob-subscription'
import { } from '@hieuzest/koishi-plugin-mjob-fid'
import { } from '@hieuzest/koishi-plugin-mjob-filter'
import { } from '@hieuzest/koishi-plugin-mjob-exporter'

declare module '@koishijs/console' {
  interface Events {
    // Watchers
    'mjob-webui/watchers'(): Promise<MjobWebUI.WatcherInfo[]>
    'mjob-webui/providers'(): Promise<string[]>

    // Subscriptions
    'mjob-webui/subscriptions'(provider?: string): Promise<MjobWebUI.SubscriptionEntry[]>
    'mjob-webui/subscription-channels'(): Promise<string[]>
    'mjob-webui/subscription-add'(cid: string, players: string[], provider: string): Promise<void>
    'mjob-webui/subscription-remove'(cid: string, players: string[], provider: string): Promise<void>
    'mjob-webui/subscription-clear'(cid: string, provider: string): Promise<void>

    // Fids
    'mjob-webui/fids'(cid: string, provider: string): Promise<MjobWebUI.FidEntry[]>
    'mjob-webui/fid-channels'(provider?: string): Promise<string[]>
    'mjob-webui/fid-defaults'(provider: string): Promise<MjobWebUI.FidEntry[]>
    'mjob-webui/fid-add'(cid: string, fids: string[], provider: string): Promise<void>
    'mjob-webui/fid-set'(cid: string, fids: string[], provider: string): Promise<void>
    'mjob-webui/fid-remove'(cid: string, fids: string[], provider: string): Promise<void>
    'mjob-webui/fid-reset'(cid: string, provider: string): Promise<void>

    // Filter
    'mjob-webui/filters'(provider?: string): Promise<MjobWebUI.FilterEntry[]>
    'mjob-webui/filter-set'(cid: string, disabled: boolean, provider: string): Promise<void>

    // Exporter
    'mjob-webui/exporter-list'(): Promise<MjobWebUI.ExporterInfo[]>
    'mjob-webui/exporter-init'(endpoint: string, fids: string[], provider: string): Promise<void>
    'mjob-webui/exporter-add-fids'(endpoint: string, fids: string[], provider: string): Promise<void>
    'mjob-webui/exporter-remove-fids'(endpoint: string, fids: string[], provider: string): Promise<void>
    'mjob-webui/exporter-clear'(endpoint: string, provider: string): Promise<void>

    // Actions
    'mjob-webui/force-update'(): Promise<void>
  }
}

export class MjobWebUI extends Service {
  static inject = {
    required: ['console', 'mjob'],
    optional: ['database', 'mjob.$subscription', 'mjob.$fid', 'mjob.$filter', 'mjob.$exporter'],
  }

  constructor(ctx: Context, public config: MjobWebUI.Config) {
    super(ctx, 'mjob-webui', true)

    ctx.console.addEntry({
      dev: resolve(__dirname, '../client/index.ts'),
      prod: resolve(__dirname, '../dist'),
    })

    this.registerWatcherAPIs()
    this.registerSubscriptionAPIs()
    this.registerFidAPIs()
    this.registerFilterAPIs()
    this.registerExporterAPIs()
    this.registerActionAPIs()
  }

  private registerWatcherAPIs() {
    const { ctx } = this

    ctx.console.addListener('mjob-webui/watchers', async () => {
      const watchers = Object.values(ctx.mjob.watchers.watchers)
      return watchers.map((w: Watcher) => ({
        id: w.id,
        wid: w.wid,
        type: w.type,
        watchId: w.watchId,
        status: w.status,
        players: w.players?.map(p => String(p.valueOf())) || [],
        starttime: w.starttime,
        subscribers: w.subscribers || {},
      }))
    }, { authority: 4 })

    ctx.console.addListener('mjob-webui/providers', async () => {
      return Object.keys(ctx.mjob.providers)
    }, { authority: 4 })
  }

  private registerSubscriptionAPIs() {
    const { ctx } = this

    ctx.console.addListener('mjob-webui/subscriptions', async (provider) => {
      if (!ctx.mjob.$subscription) return []
      const results: MjobWebUI.SubscriptionEntry[] = []
      const channels = await ctx.mjob.$subscription.getChannels()
      for (const cid of channels) {
        const subs = await ctx.mjob.$subscription.getByChannel(cid)
        for (const sub of subs) {
          if (provider && sub.provider !== provider) continue
          results.push({
            cid: sub.cid,
            provider: sub.provider,
            player: sub.player,
          })
        }
      }
      return results
    }, { authority: 4 })

    ctx.console.addListener('mjob-webui/subscription-channels', async () => {
      if (!ctx.mjob.$subscription) return []
      return await ctx.mjob.$subscription.getChannels()
    }, { authority: 4 })

    ctx.console.addListener('mjob-webui/subscription-add', async (cid, players, provider) => {
      if (!ctx.mjob.$subscription) throw new Error('Subscription service not available')
      await ctx.mjob.$subscription.add(cid, players, provider as never)
    }, { authority: 4 })

    ctx.console.addListener('mjob-webui/subscription-remove', async (cid, players, provider) => {
      if (!ctx.mjob.$subscription) throw new Error('Subscription service not available')
      await ctx.mjob.$subscription.remove(cid, players, provider as never)
    }, { authority: 4 })

    ctx.console.addListener('mjob-webui/subscription-clear', async (cid, provider) => {
      if (!ctx.mjob.$subscription) throw new Error('Subscription service not available')
      await ctx.mjob.$subscription.clear(cid, provider as never)
    }, { authority: 4 })
  }

  private registerFidAPIs() {
    const { ctx } = this

    ctx.console.addListener('mjob-webui/fids', async (cid, provider) => {
      if (!ctx.mjob.$fid) return []
      const fids = await ctx.mjob.$fid.getFids(cid, provider as never)
      const fnames = await ctx.mjob.$fid.getFnames(fids, provider as never)
      return fids.map(fid => ({ fid, fname: fnames[fid] || fid }))
    }, { authority: 4 })

    ctx.console.addListener('mjob-webui/fid-channels', async (provider) => {
      if (!ctx.mjob.$fid || !ctx.database) return []
      const query = provider
        ? await ctx.database.get('mjob.fids', { provider: provider as never })
        : await ctx.database.get('mjob.fids', {})
      return [...new Set(query.map(x => x.cid).filter(Boolean))]
    }, { authority: 4 })

    ctx.console.addListener('mjob-webui/fid-defaults', async (provider) => {
      if (!ctx.mjob.$fid) return []
      const fids = await ctx.mjob.$fid.getDefaultFids(provider as never)
      const fnames = await ctx.mjob.$fid.getFnames(fids, provider as never)
      return fids.map(fid => ({ fid, fname: fnames[fid] || fid }))
    }, { authority: 4 })

    ctx.console.addListener('mjob-webui/fid-add', async (cid, fids, provider) => {
      if (!ctx.mjob.$fid) throw new Error('Fid service not available')
      await ctx.mjob.$fid.addFids(cid, fids, provider as never)
    }, { authority: 4 })

    ctx.console.addListener('mjob-webui/fid-set', async (cid, fids, provider) => {
      if (!ctx.mjob.$fid) throw new Error('Fid service not available')
      await ctx.mjob.$fid.setFids(cid, fids, provider as never)
    }, { authority: 4 })

    ctx.console.addListener('mjob-webui/fid-remove', async (cid, fids, provider) => {
      if (!ctx.mjob.$fid) throw new Error('Fid service not available')
      await ctx.mjob.$fid.removeFids(cid, fids, provider as never)
    }, { authority: 4 })

    ctx.console.addListener('mjob-webui/fid-reset', async (cid, provider) => {
      if (!ctx.mjob.$fid) throw new Error('Fid service not available')
      await ctx.mjob.$fid.clearFids(cid, false, provider as never)
    }, { authority: 4 })
  }

  private registerFilterAPIs() {
    const { ctx } = this

    ctx.console.addListener('mjob-webui/filters', async (provider) => {
      if (!ctx.mjob.$filter || !ctx.database) return []
      const rows = await ctx.database.get('mjob.filters', provider ? { provider: provider as never } : {})
      return rows.map(row => ({
        cid: row.cid,
        provider: row.provider,
        disabled: (row as any).disabled ?? false,
      }))
    }, { authority: 4 })

    ctx.console.addListener('mjob-webui/filter-set', async (cid, disabled, provider) => {
      if (!ctx.mjob.$filter) throw new Error('Filter service not available')
      await ctx.mjob.$filter.set(cid, { disabled } as any, provider as never)
    }, { authority: 4 })
  }

  private registerExporterAPIs() {
    const { ctx } = this

    ctx.console.addListener('mjob-webui/exporter-list', async () => {
      if (!ctx.mjob.$exporter || !ctx.mjob.$subscription) return []
      const config = (ctx.mjob.$exporter as any).config
      const results: MjobWebUI.ExporterInfo[] = []

      for (const [name, ep] of Object.entries<any>(config?.trustedEndpoints || {})) {
        const cid = `$mjob-exporter:${name}`
        const subs = await ctx.mjob.$subscription.getByChannel(cid)
        const fidsPerProvider: Dict<string[]> = {}
        for (const sub of subs) {
          if (!fidsPerProvider[sub.provider]) {
            if (ctx.mjob.$fid) {
              fidsPerProvider[sub.provider] = await ctx.mjob.$fid.getFids(cid, sub.provider as never)
            } else {
              fidsPerProvider[sub.provider] = []
            }
          }
        }
        results.push({
          name,
          endpoint: ep.endpoint,
          token: ep.token,
          subscriptions: subs.map(s => ({ provider: s.provider, player: s.player })),
          fids: fidsPerProvider,
        })
      }
      return results
    }, { authority: 4 })

    ctx.console.addListener('mjob-webui/exporter-init', async (endpoint, fids, provider) => {
      if (!ctx.mjob.$exporter || !ctx.mjob.$subscription || !ctx.mjob.$fid) {
        throw new Error('Exporter/Subscription/Fid service not available')
      }
      const cid = `$mjob-exporter:${endpoint}`
      await ctx.mjob.$subscription.add(cid, ['*'], provider as never)
      await ctx.mjob.$fid.setFids(cid, [ctx.mjob.$fid.DISABLED_FID, ...fids], provider as never)
    }, { authority: 4 })

    ctx.console.addListener('mjob-webui/exporter-add-fids', async (endpoint, fids, provider) => {
      if (!ctx.mjob.$fid) throw new Error('Fid service not available')
      const cid = `$mjob-exporter:${endpoint}`
      await ctx.mjob.$fid.addFids(cid, fids, provider as never)
    }, { authority: 4 })

    ctx.console.addListener('mjob-webui/exporter-remove-fids', async (endpoint, fids, provider) => {
      if (!ctx.mjob.$fid) throw new Error('Fid service not available')
      const cid = `$mjob-exporter:${endpoint}`
      await ctx.mjob.$fid.removeFids(cid, fids, provider as never)
    }, { authority: 4 })

    ctx.console.addListener('mjob-webui/exporter-clear', async (endpoint, provider) => {
      if (!ctx.mjob.$exporter || !ctx.mjob.$subscription || !ctx.mjob.$fid) {
        throw new Error('Exporter/Subscription/Fid service not available')
      }
      const cid = `$mjob-exporter:${endpoint}`
      await ctx.mjob.$subscription.clear(cid, provider as never)
      await ctx.mjob.$fid.clearFids(cid, false, provider as never)
    }, { authority: 4 })
  }

  private registerActionAPIs() {
    const { ctx } = this

    ctx.console.addListener('mjob-webui/force-update', async () => {
      await Promise.all(
        Object.values(ctx.mjob.providers).map(provider => provider.update()),
      )
    }, { authority: 4 })
  }
}

export namespace MjobWebUI {
  export interface WatcherInfo {
    id: string
    wid: string
    type: string
    watchId: string
    status: string
    players: string[]
    starttime?: number
    subscribers: Dict<string[]>
  }

  export interface SubscriptionEntry {
    cid: string
    provider: string
    player: string
  }

  export interface FidEntry {
    fid: string
    fname: string
  }

  export interface FilterEntry {
    cid: string
    provider: string
    disabled: boolean
  }

  export interface ExporterInfo {
    name: string
    endpoint: string
    token?: string
    subscriptions: { provider: string; player: string }[]
    fids: Dict<string[]>
  }

  export interface Config {}

  export const Config: Schema<Config> = Schema.object({})
}

export default MjobWebUI
