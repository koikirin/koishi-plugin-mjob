import { Awaitable, Dict, Logger } from 'koishi'
import { Mjob, Provider, ProviderType } from '.'

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

export abstract class Watcher<T extends ProviderType = ProviderType, P extends Player = Player> implements Watchable<T, P> {
  id: string
  type: ProviderType
  provider: Mjob.Providers[T]
  watchId: string
  players: P[]
  starttime: number

  closed: boolean
  #status: Watcher.Status
  #statustime: number

  constructor(watchable: Watchable<T, P>, payload?: any, id?: string) {
    this.id = id ?? (watchable.provider as Provider).ctx.mjob.watchers.generateId()
    Object.assign(this, watchable)
    this.starttime = Date.now()
    if (payload) Object.assign(this, payload)
    this.closed = false
    this.status = 'waiting'
  }

  get wid() {
    return `${this.type}:${this.watchId}`
  }

  get status(): Watcher.Status {
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

const letters = 'abcdefghijklmnopqrstuvwxyz'
const numbers = '0123456789'
const suffixs = letters + numbers

export class WatcherCollection {
  watchers: Dict<Watcher> = Object.create(null)
  mapping: Dict<string> = Object.create(null)

  _generateId() {
    const prefix = letters[Math.floor(Math.random() * letters.length)]
    const suffix = Array(3).fill(0).map(() => suffixs[Math.floor(Math.random() * suffixs.length)]).join('')
    return prefix + suffix
  }

  generateId() {
    let retry = 0
    let id = this._generateId()
    while (id in this.mapping && retry < 5) {
      id = this._generateId()
      retry++
    }
    return id
  }

  get(key: string) {
    return this.watchers[key]
  }

  getById(key: string) {
    key = key.toLowerCase()
    return this.watchers[this.mapping[key]]
  }

  set(watcher: Watcher) {
    if (this.has(watcher.wid)) {
      logger.warn('Duplicate watcher with wid: %s, reject', this.get(watcher.wid))
      return false
    }
    if (this.hasById(watcher.id)) {
      logger.warn('Duplicate watcher with id: %s, reject', this.getById(watcher.id))
      return false
    }
    this.watchers[watcher.wid] = watcher
    this.mapping[watcher.id] = watcher.wid
    return true
  }

  has(key: string) {
    return key in this.watchers
  }

  hasById(key: string) {
    key = key.toLowerCase()
    return key in this.mapping
  }

  remove(key: string) {
    if (this.has(key)) {
      delete this.mapping[this.watchers[key].id]
      delete this.watchers[key]
    }
  }

  removeById(key: string) {
    key = key.toLowerCase()
    if (this.hasById(key)) { delete this.watchers[this.mapping[key]] }
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
    logger.debug('stopping watchers...')
    Object.values(this.watchers).forEach(watcher => watcher.close())
    delete this.watchers
    delete this.mapping
    this.watchers = Object.create(null)
    this.mapping = Object.create(null)
  }
}
