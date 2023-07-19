import { Context, Dict, Logger } from "koishi"
import * as crypto from 'crypto'
import { Mjob } from '.'
import { Subscribers } from './subscription'

const logger = new Logger('mjob.watcher')

export enum WatcherStatus {
  Waiting,
  Playing,
  Finished,
  Error,
  Reconnecting,
  EarlyFinished,
}

export interface User {
  player: string
  point?: number
}

export type Result = User[]

export interface MatchStatus {
  status: WatcherStatus
  result?: Result
}

export interface Watcher {
  readonly id: string
  readonly realid: string
  closed: boolean
  // checked: boolean
  // silent: boolean
  users: User[]
  type: keyof Mjob.Providers

  // visible: boolean
  status: WatcherStatus

  subscribers: Subscribers

  _starttime: number
  _statustime: number

  close(): void
  dump(): WatcherDump
  
}

export interface WatcherDump {
  type: keyof Mjob.Providers
}

export class WatcherCollection {
  watchers: Dict<Watcher>

  constructor() {
    this.watchers = {}
  }

  get(key: string) {
    return this.watchers[key]
  }

  set(key: string, watcher: Watcher) {
    if (key in this.watchers) logger.warn('Duplicate watcher: ', this.watchers[key])
    this.watchers[key] = watcher
  }

  has(key: string) {
    return key in this.watchers
  }

  randomId(): string {
    let ret = crypto.randomBytes(3).toString('hex')
    while (ret in this.watchers) ret = crypto.randomBytes(3).toString('hex')
    return ret
  }

  recycle() {
    const curtime = Date.now()
    const keys = Object.entries(this.watchers).filter(([key, watcher]) => 
      [WatcherStatus.EarlyFinished, WatcherStatus.Finished, WatcherStatus.Error].includes(watcher.status) && 
      curtime - watcher._statustime > 1000 * 15).map(([key, watcher]) => key)
    keys.forEach(key => delete this.watchers[key])
  }

  dump() {
    return Object.values(this.watchers).map(watcher => watcher.dump()).filter(x => x)
  }

  stop() {
    Object.values(this.watchers).forEach(watcher => watcher.close())
    delete this.watchers
    this.watchers = {}
  }
}

export abstract class BaseWatcher implements Watcher {
  readonly id: string
  abstract realid: string
  abstract users: User[]
  abstract type: keyof Mjob.Providers
  closed: boolean
  // checked: boolean
  private _status: WatcherStatus

  subscribers: Subscribers

  _starttime: number
  _statustime: number

  constructor(ctx: Context, id?: string) {
    this.id = id || ctx.mjob.watchers.randomId()
    this.closed = false
    this.status = WatcherStatus.Waiting
    this._starttime = Date.now()
    ctx.mjob.watchers.set(this.id, this)
  }

  abstract close(): void
  abstract dump(): any
  
  public get status() : WatcherStatus {
    return this._status
  }

  public set status(val: WatcherStatus) {
    this._status = val
    this._statustime = Date.now()
  }

}
