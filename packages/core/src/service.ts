import { Awaitable, Context, Service, remove } from 'koishi'
import { Mjob } from '.'
import { Player, Watcher } from './watcher'
import { restore, dump } from './dump'

type RawProperties<T> = Pick<T, { 
  [K in keyof T]: T[K] extends Function ? never : K
}[keyof T]>;

export abstract class CoreService extends Service {
  static filter = false
  static keys = new Set<string>()
  static dumpKeys: (keyof any)[] = []

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

    ctx.on('ready', async () => {
      await Promise.resolve()
      restore(ctx, key).forEach(x => this.restoreWatcher(x))
    })
  
  }

  abstract update(): Promise<void>
  abstract restoreWatcher(data: any): Awaitable<void>

  submit<P extends Player>(watcher: Watcher<T, P>) {
    this.ctx.mjob.watchers.set(watcher)
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