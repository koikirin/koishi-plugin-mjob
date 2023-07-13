import { Awaitable, Dict, Logger } from 'koishi'
import { Mjob, ProviderType } from '.'

const logger = new Logger('mjob.watcher')


export type WatchDecision = 'approved' | 'rejected'

export interface Player {
  valueOf(): string
}

export type ProgressEvents = 'match-start' | 'match-end' | 'round-start' | 'round-end'

export interface Progress {
  event?: ProgressEvents
}

export interface Watchable<T extends ProviderType = ProviderType, P extends Player = Player> {
  type: ProviderType
  provider: Mjob.Providers[T]
  watchId: string
  players: P[]

  decision?: WatchDecision
}

let _internalId = 0

export abstract class Watcher<T extends ProviderType = ProviderType, P extends Player = Player> implements Watchable<T, P> {

  id: string
  type: ProviderType
  provider: Mjob.Providers[T]
  watchId: string
  players: P[]

  closed: boolean
  #status: Watcher.Status
  #starttime: number
  #statustime: number

  constructor(watchable: Watchable<T, P>, payload?: any, id?: string) {
    this.id = id ?? String(_internalId++)
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
  abstract dump(): WatcherDump
}

export namespace Watcher {
  export type Status = 'waiting' | 'playing' | 'finished' | 'error' | 'reconnecting' | 'earlyFinished'
}

export interface WatcherDump {
  watchId: string
  payload?: any
}

export class WatcherCollection {
  watchers: Dict<Watcher>
  mapping: Dict<string>

  constructor() {
    this.watchers = {}
    this.mapping = {}
  }

  get(key: string) {
    return this.watchers[key]
  }

  getById(key: string) {
    return this.watchers[this.mapping[key]]
  }

  set(watcher: Watcher) {
    if (this.has(watcher.wid)) logger.warn('Duplicate watcher with wid: ', this.get(watcher.wid))
    if (this.hasById(watcher.id)) logger.warn('Duplicate watcher with id: ', this.getById(watcher.id))
    this.watchers[watcher.wid] = watcher
    this.mapping[watcher.id] = watcher.wid
  }

  has(key: string) {
    return key in this.watchers
  }

  hasById(key: string) {
    return key in this.mapping
  }

  remove(key: string) {
    if (this.has(key)) {
      delete this.mapping[this.watchers[key].id]
      delete this.watchers[key]
    }
  }

  removeById(key: string) {
    if (this.hasById(key))
    delete this.watchers[this.mapping[key]]
    delete this.mapping[key]
  }

  recycle() {
    const curtime = Date.now()
    Object.entries(this.watchers)
      .forEach(([key, watcher]) => {
        if (watcher.shouldRecycle(curtime)) {
          delete this.watchers[key]
          delete this.mapping[watcher.id]
        } 
      })
  }

  stop() {
    Object.values(this.watchers).forEach(watcher => watcher.close())
    delete this.watchers
    delete this.mapping
    this.watchers = {}
    this.mapping = {}
  }
}
