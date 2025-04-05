import { Context, Dict, noop, Schema } from 'koishi'
import { CoreService, Player, Progress, Watcher } from '@hieuzest/koishi-plugin-mjob'
import { } from '@hieuzest/koishi-plugin-mjob-subscription'
import { } from '@hieuzest/koishi-plugin-mjob-fid'

declare module '@hieuzest/koishi-plugin-mjob' {
  namespace Mjob {
    interface CoreServices {
      $exporter: ExporterService
    }
  }
}

function parsePlatform(target: string): [platform: string, id: string] {
  const index = target.indexOf(':')
  const platform = target.slice(0, index)
  const id = target.slice(index + 1)
  return [platform, id] as any
}

export class ExporterService extends CoreService {
  static inject = ['mjob', 'mjob.$fid', 'mjob.$subscription']

  constructor(ctx: Context, public config: ExporterService.Config) {
    super(ctx, '$exporter')

    ctx.mjob.$subscription.registerInternalPlatform(ExporterService.platform)

    ctx.command('mjob.exporter', { authority: 3 }).action(noop)

    ctx.command('mjob.exporter.list [endpoint:string]')
      .action(async ({ session }, endpoint) => {
        if (endpoint) {
          const subs = await ctx.mjob.$subscription.getByChannel(`${ExporterService.platform}:${endpoint}`)
          const allFids = await Promise.all(subs.map(async (x) => [x.provider, await ctx.mjob.$fid.getFids(x.cid, x.provider)] as [string, string[]]))
          let msg = ''
          for (const [provider, fids] of allFids) {
            const fnames = await ctx.mjob.$fid.getFnames(fids, provider as never)
            msg += session.text('mjob.commands.list-prompt', [session.text(`mjob.${provider}.name`)]) + '\n'
            msg += session.text('mjob.commands.list', fids.map(fid => fnames[fid] || fid)) + '\n'
          }
          return msg.trimEnd()
        } else {
          const channels = await ctx.mjob.$subscription.getChannels().then(x => x.filter(y => ExporterService.isExporterChannel(y)))
          let msg = ''
          msg += '- Configured: \n'
          msg += session.text('mjob.commands.list', Object.entries(config.trustedEndpoints).map(([name, endpoint]) => `${name}: ${endpoint.endpoint}`)) + '\n'
          msg += '- In Use: \n'
          msg += session.text('mjob.commands.list', [...channels].map(x => parsePlatform(x)[1])) + '\n'
          return msg.trimEnd()
        }
      })

    ctx.command('mjob.exporter.init <endpoint:string> [...fids]')
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }, endpoint, ...fids) => {
        await ctx.mjob.$subscription.add(`${ExporterService.platform}:${endpoint}`, ['*'], options.provider as never)
        await ctx.mjob.$fid.setFids(`${ExporterService.platform}:${endpoint}`, [ctx.mjob.$fid.DISABLED_FID, ...fids], options.provider as never)
        return session.text('mjob.general.success')
      })

    ctx.command('mjob.exporter.add <endpoint:string> <...fids>')
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }, endpoint, ...fids) => {
        await ctx.mjob.$fid.addFids(`${ExporterService.platform}:${endpoint}`, fids, options.provider as never)
        return session.text('mjob.general.success')
      })

    ctx.command('mjob.exporter.remove <endpoint:string> <...fids>')
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }, endpoint, ...fids) => {
        await ctx.mjob.$fid.removeFids(`${ExporterService.platform}:${endpoint}`, fids, options.provider as never)
        return session.text('mjob.general.success')
      })

    ctx.command('mjob.exporter.clear <endpoint:string>')
      .option('provider', '-p <provider:string>')
      .action(async ({ session, options }, endpoint) => {
        await ctx.mjob.$subscription.clear(`${ExporterService.platform}:${endpoint}`, options.provider as never)
        await ctx.mjob.$fid.clearFids(`${ExporterService.platform}:${endpoint}`, options.provider as never)
        return session.text('mjob.general.success')
      })

    ctx.command('mjob.exporter.notify')
      .action(async ({ session }) => {
        await Promise.all(Object.values(ctx.mjob.watchers.watchers).flatMap((watcher) =>
          Object.entries(watcher.subscribers || {})
            .filter(([cid]) => ExporterService.isExporterChannel(cid))
            .map(async ([cid]) => this.send(parsePlatform(cid)[1], {
              type: 'progress',
              watcher,
              progress: { event: 'notify' } as Progress,
            })),
        ))
        return session.text('mjob.general.success')
      })

    ctx.on('mjob/watch', (watcher: Watcher) => {
      Promise.all(Object.entries(watcher.subscribers || {})
        .filter(([cid]) => ExporterService.isExporterChannel(cid))
        .map(async ([cid]) => this.send(parsePlatform(cid)[1], {
          type: 'watch',
          watcher,
        })))
    })

    ctx.on('mjob/progress', (watcher: Watcher, progress: Progress) => {
      Promise.all(Object.entries(watcher.subscribers || {})
        .filter(([cid]) => ExporterService.isExporterChannel(cid))
        .map(async ([cid]) => this.send(parsePlatform(cid)[1], {
          type: 'progress',
          watcher,
          progress,
        })))
    })

    ctx.on('mjob/finish', (watcher: Watcher, players: Player[]) => {
      Promise.all(Object.entries(watcher.subscribers || {})
        .filter(([cid]) => ExporterService.isExporterChannel(cid))
        .map(async ([cid]) => this.send(parsePlatform(cid)[1], {
          type: 'finish',
          watcher,
          players,
        })))
    })

    ctx.on('mjob/error', (watcher: Watcher, error?: any) => {
      Promise.all(Object.entries(watcher.subscribers || {})
        .filter(([cid]) => ExporterService.isExporterChannel(cid))
        .map(async ([cid]) => this.send(parsePlatform(cid)[1], {
          type: 'error',
          watcher,
          error,
        })))
    })
  }

  async send(name: string, data: any) {
    const endpoint = this.config.trustedEndpoints[name]
    if (!endpoint) {
      this.ctx.logger.warn(`Unknown exporter endpoint: ${name}`)
      return
    }
    return this.ctx.http.post(endpoint.endpoint, data, {
      headers: {
        Authorization: endpoint.token ? `Bearer ${endpoint.token}` : undefined,
        'Content-Type': 'application/json',
      },
    }).catch((error) => {
      this.ctx.logger.warn(`Failed to send data to ${name}:`, error)
    })
  }
}

export interface ExporterEndpoint {
  endpoint: string
  token?: string
}

export namespace ExporterService {
  export const platform = '$mjob-exporter'

  export function isExporterChannel(cid: string) {
    return cid.startsWith(`${ExporterService.platform}:`)
  }

  export interface Config {
    trustedEndpoints: Dict<ExporterEndpoint>
  }

  export const Config: Schema<Config> = Schema.object({
    trustedEndpoints: Schema.dict(Schema.object({
      endpoint: Schema.string(),
      token: Schema.string(),
    }), Schema.string().description('name')).role('table'),
  })
}

export default ExporterService
