import { Awaitable, Context, Service, SessionError } from 'koishi'
import { Mjob } from '.'
import { Player, Watcher } from './watcher'
import { dump, restore } from './dump'

type RawProperties<T> = Pick<T, {
  [K in keyof T]: T[K] extends Function ? never : K
}[keyof T]>

export abstract class CoreService extends Service {
  static filter = false
  static dumpKeys: (keyof any)[] = []

  constructor(protected ctx: Context, protected key: keyof Mjob.CoreServices, public options: CoreService.Options = {}) {
    super(ctx, `mjob.${key}`, options.immediate)
  }

  protected extendDump<T extends Watcher>(keys: Iterable<keyof RawProperties<T>>) {
    [...keys].forEach(key => {
      if (!CoreService.dumpKeys.includes(key)) CoreService.dumpKeys.push(key)
    })
  }
}

export namespace CoreService {
  export interface Options {
    immediate?: boolean
    authority?: number
  }
}

function findProvider(ctx: Context) {
  if (ctx === ctx.root || !ctx.runtime.plugin) return
  return ctx.runtime.plugin['provider'] || findProvider(ctx.runtime.parent)
}

export abstract class Provider<T extends ProviderType = ProviderType> extends Service {
  static filter = false

  private static get(ctx: Context): ProviderType {
    return findProvider(ctx) as never
  }

  static ensure(ctx: Context, provider?: ProviderType) {
    provider ||= this.get(ctx)
    if (!provider) throw new SessionError('mjob.general.provider-notfound')
    return provider
  }

  constructor(protected ctx: Context, protected key: ProviderType, public options: Provider.Options = {}) {
    super(ctx, `mjob.${key}`, options.immediate)
    if (!key || key !== Object.getPrototypeOf(this).constructor['provider']) {
      throw new Error('Mjob Provider must declare key in its static property `provider`')
    }

    ctx.mjob.providers[key] = this as never
    ctx.collect('provider', () => delete ctx.mjob.providers[key])
    ctx.on('ready', async () => {
      await Promise.resolve()
      restore(ctx, key).forEach(x => this.restoreWatcher(x))
    })
  }

  abstract update(): Promise<void>
  abstract restoreWatcher(data: any): Awaitable<boolean>

  submit<P extends Player>(watcher: Watcher<T, P>) {
    if (!this.ctx.mjob.watchers.set(watcher)) return
    watcher.connect()
    return this.ctx.collect('watcher', () => {
      dump(this.ctx, watcher)
      watcher.close()
      this.ctx.mjob.watchers.remove(watcher.wid)
      return true
    })
  }
}

export namespace Provider {
  export interface Options {
    immediate?: boolean
    authority?: number
  }
}

export type ProviderType = keyof Mjob.Providers
