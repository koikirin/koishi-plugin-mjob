import { Dict, Logger } from "koishi"
import * as crypto from 'crypto'

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
  readonly wgid: string
  readonly realid: string
  closed: boolean
  checked: boolean
  // silent: boolean
  users: User[]
  type: string

  // visible: boolean
  status: WatcherStatus

  starttime: number
  statustime: number

  close(): void
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
    if (key in this.watchers) logger.warn('Duplicate watcher: ', key, this.watchers[key].realid, watcher.realid)
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
      curtime - watcher.statustime > 1000 * 15).map(([key, watcher]) => key)
    keys.forEach(key => delete this.watchers[key])
  }

  stop() {
    Object.values(this.watchers).forEach(watcher => watcher.close())
    delete this.watchers
    this.watchers = {}
  }
}

export abstract class BaseWatcher implements Watcher {
  readonly wgid: string
  abstract realid: string
  abstract users: User[]
  closed: boolean
  checked: boolean
  private _status: WatcherStatus

  starttime: number
  statustime: number

  constructor() {
    this.wgid = watchers.randomId()
    this.closed = false
    this.status = WatcherStatus.Waiting
    this.starttime = Date.now()
    watchers.set(this.wgid, this)
  }

  abstract close(): void
  
  public get status() : WatcherStatus {
    return this._status
  }

  public set status(val: WatcherStatus) {
    this._status = val
    this.statustime = Date.now()
  }

  public get type() : string {
    return this.constructor.name
  }

}


export const watchers = new WatcherCollection()
