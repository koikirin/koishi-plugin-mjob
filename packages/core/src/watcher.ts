import { Awaitable, Dict, Logger } from 'koishi'
import { Provider, ProviderType } from './service'

const logger = new Logger('mjob.watcher')


export type WatchDecision = 'approved' | 'rejected'

export interface Watchable<P extends string = any> {
  type: ProviderType
  provider: Provider
  watchId: string
  players: P[]

  decision?: WatchDecision
}

export abstract class Watcher<T extends ProviderType = ProviderType, P extends string = any> implements Watchable<P> {

  // id: string
  type: ProviderType
  provider: Provider[T]
  watchId: string
  players: P[]

  closed: boolean
  #status: Watcher.Status
  #starttime: number
  #statustime: number

  constructor(watchable: Watchable<P>, payload?: any) {
    Object.assign(this, watchable)
    if (payload) Object.assign(this, payload)
    this.closed = false
    this.status = 'waiting'
    this.#starttime = Date.now()
  }

  get wid() {
    return `${this.type}:${this.watchId}`
  }

  get status() : Watcher.Status {
    return this.#status
  }

  set status(val: Watcher.Status) {
    this.#status = val
    this.#statustime = Date.now()
  }

  get finished() {
    if (this.status === 'finished' || this.status === 'earlyFinished') return true
    if (this.closed) return true
    return false
  }

  shouldRecycle(curtime: number) {
    return (this.finished || this.status === 'error') && curtime - this.#statustime > 1000 * 15
  }

  abstract connect(): Awaitable<void>
  abstract close(): Awaitable<void>
  abstract toJSON(): any
}

export namespace Watcher {
  export type Status = 'waiting' | 'playing' | 'finished' | 'error' | 'reconnecting' | 'earlyFinished'

  export interface Progress {

  }
}

export class WatcherCollection {
  watchers: Dict<Watcher>

  constructor() {
    this.watchers = {}
  }

  get(key: string) {
    return this.watchers[key]
  }

  set(watcher: Watcher) {
    const key = watcher.wid
    if (key in this.watchers) logger.warn('Duplicate watcher: ', this.watchers[key])
    this.watchers[key] = watcher
  }

  has(key: string) {
    return key in this.watchers
  }

  recycle() {
    const curtime = Date.now()
    Object.entries(this.watchers)
      .forEach(([key, watcher]) => watcher.shouldRecycle(curtime) && delete this.watchers[key])
  }

  dump() {
    return Object.values(this.watchers).map(watcher => watcher.toJSON()).filter(x => x)
  }

  stop() {
    Object.values(this.watchers).forEach(watcher => watcher.close())
    delete this.watchers
    this.watchers = {}
  }
}
