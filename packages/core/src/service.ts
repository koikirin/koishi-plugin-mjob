import { Awaitable, Context, Dict, Schema, Service } from 'koishi'
import { Mjob } from '.'
// import { MajsoulProvider } from './majsoul'
import { Watcher, WatcherCollection, WatcherDump } from './watcher'
import { open, mkdir } from 'fs/promises'
import { resolve } from 'path'


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
    return ctx.runtime.plugin['provider']
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

export abstract class Provider extends Service {
  static readonly [$provider] = true

  static filter = false
  static keys = new Set<string>()
  static using = ['mjob']

  static define(name: keyof Mjob.Providers) {
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

  static get(ctx: Context): keyof Mjob.Providers {
    return findProvider(ctx) as never
  }

  constructor(protected ctx: Context, protected key: keyof Mjob.Providers, public options: Provider.Options = {}) {
    super(ctx, `mjob.${key}`, options.immediate)
    if (key != Object.getPrototypeOf(this).constructor['provider']) {
      throw new Error('Mjob Provider must declare key in its static property `provider`')
    }
    Provider.define(key)
  }

  abstract restoreWatcher(data: WatcherDump): void
}

export namespace Provider {
  export interface Options {
    immediate?: boolean
    authority?: number
  }
}
