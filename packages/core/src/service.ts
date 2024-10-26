import { Awaitable, Context, remove, Service, SessionError } from 'koishi'
import { Mjob } from '.'
import { Player, Watcher } from './watcher'
import { dump, restore } from './dump'

type RawProperties<T> = Pick<T, {
  [K in keyof T]: T[K] extends Function ? never : K
}[keyof T]>

export abstract class CoreService extends Service {
  static filter = false

  constructor(protected ctx: Context, protected key: keyof Mjob.CoreServices, public options: CoreService.Options = {}) {
    super(ctx, `mjob.${key}`, options.immediate)
  }

  protected extendDump<T extends Watcher>(keys: Iterable<keyof RawProperties<T>>) {
    [...keys].forEach(key => {
      if (!this.ctx.mjob.dumpKeys.includes(key)) {
        this.ctx.effect(() => {
          this.ctx.mjob.dumpKeys.push(key)
          return () => remove(this.ctx.mjob.dumpKeys, key)
        })
      }
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
  private _closed = false

  private static get(ctx: Context): ProviderType {
    return findProvider(ctx) as never
  }

  static ensure(ctx: Context, provider?: ProviderType) {
    provider ||= this.get(ctx)
    if (!provider) throw new SessionError('mjob.general.provider-notfound')
    return provider
  }

  constructor(public ctx: Context, protected key: ProviderType, public options: Provider.Options = {}) {
    super(ctx, `mjob.${key}`, options.immediate)
    if (!key || key !== Object.getPrototypeOf(this).constructor['provider']) {
      throw new Error('Mjob Provider must declare key in its static property `provider`')
    }

    ctx.effect(() => {
      ctx.mjob.providers[key] = this as never
      return () => delete ctx.mjob.providers[key]
    })

    const resurrect = () => {
      this._closed = false
      const current = Date.now()
      const count = restore(ctx, key)
        .filter(x => !ctx.mjob.watchers.has(x.watchId))
        .filter(x => !x.payload?.starttime || current - x.payload?.starttime < 1000 * 60 * 60 * 6)
        .map(x => this.restoreWatcher(x))
        .filter(x => x)
        .length
      this.ctx.logger.info(`restored ${count} watchers`)
    }

    ctx.on('dispose', () => this.shutdown())
    ctx.on('shutdown', () => this.shutdown())
    ctx.on('ready', async () => {
      await Promise.resolve()
      resurrect()
    })
    ctx.on('resurrect', resurrect)
  }

  shutdown() {
    if (this._closed) return
    dump(this.ctx, this.key)
    Object.values(this.ctx.mjob.watchers.watchers)
      .filter(wathcer => wathcer.type === this.key)
      .forEach(watcher => {
        watcher.close()
        this.ctx.mjob.watchers.remove(watcher.wid)
      })
    this._closed = true
  }

  abstract update(): Promise<void>
  abstract restoreWatcher(data: any): Awaitable<boolean>

  submit<P extends Player>(watcher: Watcher<T, P>) {
    if (!this.ctx.mjob.watchers.set(watcher)) return
    watcher.connect()
    return true
  }
}

export namespace Provider {
  export interface Options {
    immediate?: boolean
    authority?: number
  }
}

export type ProviderType = keyof Mjob.Providers
