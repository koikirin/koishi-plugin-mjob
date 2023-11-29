import { Awaitable, Context, noop, Schema, Service, Time } from 'koishi'
import {
  Player,
  Progress,
  Watchable,
  Watcher,
  WatcherCollection,
} from './watcher'
import { ProviderType } from './service'
import {} from '@hieuzest/koishi-plugin-scheduler'

export * from './service'
export * from './watcher'
export * from './utils'

declare module 'koishi' {
  interface Events {
    'mjob/attach'(
      watchables: Watchable[],
      provider?: ProviderType
    ): Awaitable<void | boolean>
    'mjob/before-watch'(watchable: Watchable): Awaitable<void | boolean>
    'mjob/watch'(watcher: Watcher): Awaitable<void | boolean>
    'mjob/progress'(watcher: Watcher, progress: Progress): Awaitable<void>
    'mjob/finish'(watcher: Watcher, players: Player[]): Awaitable<void>
    'mjob/error'(watcher: Watcher): Awaitable<void>
  }

  interface Context extends NestedServices {
    mjob: Mjob
  }
}

type NestedServices = {
  [K in keyof Mjob.Services as `mjob.${K}`]: Mjob.Services[K];
}

export interface Mjob extends Mjob.Services {}

export class Mjob extends Service {
  static inject = {
    required: ['scheduler'],
    optional: [],
  }

  watchers: WatcherCollection
  providers: Mjob.Providers = Object.create(null)

  constructor(ctx: Context, private config: Mjob.Config) {
    super(ctx, 'mjob', true)
    this.watchers = new WatcherCollection()

    ctx.i18n.define('zh', require('./locales/zh.yml'))

    ctx.scheduler.every(15 * Time.minute, () => this.watchers.recycle())

    ctx.command('mjob').action(noop)

    ctx.command('mjob.status').action(async ({ session }) => {
      return Object.values(this.watchers.watchers)
        .map((watcher) =>
          session.text(`mjob.${watcher.type}.status`, { watcher }),
        )
        .join('\n')
    })

    ctx.command('mjob.update').action(async ({ session }) => {
      await Promise.all(
        Object.values(this.providers).map(provider => provider.update()),
      )
      return ''
    })

    ctx.command('mjob.info <id:string>').action(async ({ session }, id) => {
      const watcher = this.watchers.getById(id)
      return watcher
        ? session.text(`mjob.${watcher.type}.info`, { watcher })
        : session.text('mjob.general.watcher-notfound')
    })

    ctx.on('dispose', async () => {
      this.watchers.stop()
    })
  }
}

export namespace Mjob {
  export interface CoreServices {}

  export interface Providers {}

  export type Services = CoreServices & Providers

  export interface Config {}

  export const Config: Schema<Config> = Schema.object({})
}

export default Mjob
