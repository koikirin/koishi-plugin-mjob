import { Awaitable, Context, Dict, Schema, Service } from 'koishi'
import { Mjob } from '.'
import { Player, Watcher } from './watcher'
// import { MajsoulProvider } from './majsoul'
// import { Watcher, WatcherCollection, WatcherDump } from './watcher222'


export abstract class CoreService extends Service {
  static filter = false
  static keys = new Set<string>()
  // static using = ['mjob']

  static define(name: keyof Mjob.CoreServices) {
    this.keys.add(name)
    if (Object.prototype.hasOwnProperty.call(Mjob.prototype, name)) return
    const key = `mjob.${name}`
    Object.defineProperty(Mjob.prototype, name, {
      get(this: Mjob) {
        return this.caller[key]
      },
      set(this: Mjob, value) {
        this.caller[key] = value
      },
    })
  }

  constructor(protected ctx: Context, protected key: keyof Mjob.CoreServices, public options: CoreService.Options = {}) {
    super(ctx, `mjob.${key}`, options.immediate)
    CoreService.define(key)
  }

  static get(ctx: Context): keyof Mjob.CoreServices {
    return ctx.runtime.plugin['provider'] as never
  }

}

export namespace CoreService {
  export interface Options {
    immediate?: boolean
    authority?: number
  }
}

const $provider = Symbol('provider')

function findProvider(ctx: Context) {
  if (ctx === ctx.root) return
  return ctx.runtime.plugin['provider'] || findProvider(ctx.runtime.parent)
}

export abstract class Provider<T extends ProviderType = ProviderType> extends Service {
  static readonly [$provider] = true

  static filter = false
  static keys = new Set<string>()
  static using = ['mjob']

  static define(name: ProviderType) {
    this.keys.add(name)
    if (Object.prototype.hasOwnProperty.call(Mjob.prototype, name)) return
    const key = `mjob.${name}`
    Object.defineProperty(Mjob.prototype, name, {
      get(this: Mjob) {
        return this.caller[key]
      },
      set(this: Mjob, value) {
        this.caller[key] = value
      },
    })
  }

  static get(ctx: Context): ProviderType {
    return findProvider(ctx) as never
  }

  constructor(protected ctx: Context, protected key: ProviderType, public options: Provider.Options = {}) {
    super(ctx, `mjob.${key}`, options.immediate)
    if (!key || key != Object.getPrototypeOf(this).constructor['provider']) {
      throw new Error('Mjob Provider must declare key in its static property `provider`')
    }
    Provider.define(key)
  }

  // abstract restoreWatcher(data: WatcherDump): void

  submit<P extends Player>(watcher: Watcher<T, P>) {
    this.ctx.mjob.watchers.set(watcher)
    watcher.connect()
  }

}

export namespace Provider {
  export interface Options {
    immediate?: boolean
    authority?: number
  }
}

export type ProviderType = keyof Mjob.Providers