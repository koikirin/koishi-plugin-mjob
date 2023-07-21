import { WebSocket } from 'ws'
import { Context, Dict, Logger } from 'koishi'
import { Watcher, Watchable, Progress as BaseProgress, ProgressEvents, clone } from '@hieuzest/koishi-plugin-mjob'
import { TenhouProvider, Document, Player } from '.'
import { agari2Str } from './utils'

const logger = new Logger('mjob.tenhou')

export class TenhouWatcher extends Watcher<typeof TenhouProvider.provider, Player> {
  
  type: typeof TenhouProvider.provider
  document: Document
  gameStatus: TenhouWatcher.GameStatus

  logger: Logger
  ctx: Context
  #ws: WebSocket
  #connectRetries: number
  #heartbeat: NodeJS.Timer
  #num: number
  
  constructor(provider: TenhouProvider, watchable: Watchable<typeof TenhouProvider.provider, Player>) {
    super(watchable)
    this.ctx = provider.ctx
    this.logger = logger
    this.#connectRetries = 0
    this.#num = this.document?.info?.playernum
  }

  close(): void {
    this.closed = true
    if (this.#ws) this.#ws.close()
    this.#ws = null
  }

  async #connect() {
    if (this.finished) return

    if (this.#ws) this.#ws.close()
    this.#ws = this.ctx.http.ws('wss://b-ww.mjv.jp/', {
      headers: {
        Origin: 'https://tenhou.net'
      }
    })
    this.#ws.on('message', this.#receive.bind(this))
    this.#ws.on('error', (e) => {
      this.logger.error(e)
      this.#ws?.close()
      this.#ws = null
      this.#connectRetries += 1
      if (this.#connectRetries > this.provider.config.reconnectTimes) {
        this.closed = false
        this.status = 'error'
      } else setTimeout(this.connect.bind(this), this.provider.config.reconnectInterval)
    })
    this.#ws.on('close', () => {
      this.#ws?.close()
      this.#ws = null
      this.#connectRetries += 1
      if (this.finished) return
      this.logger.info(`Connection closed. will reconnect... (${this.#connectRetries})`)
      if (this.#connectRetries > this.provider.config.reconnectTimes) {
        this.closed = false
        this.status = 'error'
      } else setTimeout(this.connect.bind(this), this.provider.config.reconnectInterval)
    })
    this.#ws.on('open', () => {
      this.#ws.send(JSON.stringify({
        tag: 'HELO',
        name: 'NoName',
        sx: 'M',
      }))
  
      this.#ws.send(JSON.stringify({
        tag: 'WG',
        id: this.document.info.id,
        tw: 0,
      }))
  
      this.#ws.send(JSON.stringify({
        tag: 'GOK'
      }))

      if (this.#heartbeat) clearInterval(this.#heartbeat)
      this.#heartbeat = setInterval(() => {
        if (this.closed || !this.#ws) {
          clearInterval(this.#heartbeat)
          this.#heartbeat = null
        } else try {
          this.#ws.send('<Z/>')
        } catch (e) {
          this.logger.error(e, this.watchId)
          clearInterval(this.#heartbeat)
          this.#heartbeat = null
        }
      }, 3000)

    })

  }

  async connect() {
    try {
      await this.#connect()
    } catch (e) {
      this.logger.error(e, this.watchId)
    }
  }

  async #receive(data: any) {
    const m: {
      tag: string,
      childNodes?: Dict[],
    } & Dict = JSON.parse(data)
    this.logger.debug(m)

    if (m.tag === 'UN') {
      this.players = []
      for (const i of Array((m.dan as string).split(',').length).keys()) {
        if (!m[`n${i}`]) continue
        this.players.push(Object.assign(decodeURIComponent(m[`n${i}`]), {
          name: decodeURI(m[`n${i}`]),
          dan: m.dan.split(',')[i],
          rate: Number(m.rate.split(',')[i])
        }))
      }
      this.#num = this.players.length
      this.logger.info('Start, Users', this.players)
      this.#progress('match-start', m, clone(this.gameStatus), clone(this.players))

    } else if (['WGC', 'INITBYLOG'].includes(m.tag)) {
      for (const node of m.childNodes) {
        if (node.tag === 'INIT') {
          // round-start
          this.status = 'playing'
          const seed: string[] = node.seed.split(','), nums: string[] = node.ten.split(',')
          this.gameStatus = new TenhouWatcher.GameStatus({
            oya: Number(node.oya),
            kyoku: Number(seed[0]),
            honba: Number(seed[1]),
            riichi: Number(seed[2]),
          })
          for (const i of Array(this.#num).keys()) {
            this.players[i].point = Number(nums[i])
          }
          this.#progress('round-start', node, clone(this.gameStatus), clone(this.players))

        } else if (['AGARI', 'RYUUKYOKU'].includes(node.tag)) {
          const nums: string[] = node.sc.split(',')
          for (const i of Array(this.#num).keys()) {
            this.players[i].point = Number(nums[i * 2]) + Number(nums[i * 2 + 1])
            this.players[i].dpoint = Number(nums[i * 2 + 1])
          }

          this.#progress('round-end', node, clone(this.gameStatus), clone(this.players))
          if (node.owari) {
            // match-end

            const nums: string[] = node.owari.split(',')
            for (const i of Array(this.#num).keys()) {
              this.players[i].point = Number(nums[i * 2])
              this.players[i].score = Number(nums[i * 2 + 1])
            }

            this.#finish(this.players, 'finished')
          }
        }
      }

    } else if (m.tag === 'ERR') {
      this.closed = true
      this.status = 'error'
    } else if (['HELO', 'LN', 'GO', 'KANSEN'].includes(m.tag)) {
    
    }
  
  }

  async #progress(event: ProgressEvents, data: Dict, status: TenhouWatcher.GameStatus, players: Player[]) {
    // players.sort((p1, p2) => - p1.point + p2.point)
    this.logger.debug('Progress', this.watchId, status, players)

    if (data.tag === 'AGARI') {
      const action = players[Number(data.who)].name + ' '
        + ((data.fromWho === data.who) ? 'ツモ' : `ロン ${players[Number(data.fromWho)].name}`)
        + data.ten.split(",")[1]
      const agariStr = agari2Str(data).trimEnd()
      
      // console.log(this.players.map(p => p.name + ' ' + String(p.point*100)).join('\n'))
      // console.log(players.map(p => p.valueOf() + ' ' + String((p.point - p.dpoint)*100)+ ' -> ' + String(p.point*100)).join('\n'))

      await this.ctx.parallel('mjob/progress', this, {
        event, raw: data, status, players, details: action + '\n' + agariStr
      } as TenhouWatcher.Progress)
    } else if (data.tag === 'RYUUKYOKU') {
      const action = '流局'
      await this.ctx.parallel('mjob/progress', this, {
        event, raw: data, status, players, details: action
      } as TenhouWatcher.Progress)
    } else {
      await this.ctx.parallel('mjob/progress', this, {
        event, raw: data, status, players
      } as TenhouWatcher.Progress)
    }
  }

  async #finish(players: Player[], finalStatus: Watcher.Status) {
    if (this.finished) return
    if (finalStatus === 'finished') this.closed = true
    this.status = finalStatus
    this.logger.info('Finish', this.watchId, players)
    await this.ctx.parallel('mjob/finish', this, players)
  }

  toJSON(): any {
    if (this.finished) return
    return {
      type: this.type,
      watchId: this.watchId,
      // options: this.options,
    }
  }

  // static restore(ctx: Context, data: MajsoulProvider.WatcherDump): MajsoulWatcher {
  //   console.log('Restore', data.options.uuid)
  //   const watcher = new MajsoulWatcher(ctx, data.options, data.id)
  //   watcher.#oldseq = data.seq
  //   return watcher
  // }

}

export namespace TenhouWatcher {

  export interface GameStatus {
    oya: number
    kyoku: number
    honba: number
    riichi: number
  }

  export class GameStatus {
    constructor(fields: GameStatus) {
      Object.assign(this, fields)
    }

    toString() {
      const kaze = this.kyoku < 4 ? '東' : this.kyoku < 8 ? '南' : '西'
      return `${kaze}${this.kyoku % 4 + 1}局 ${this.honba}本場`
    }
  }

  export interface Progress extends BaseProgress {
    status: GameStatus
    players: Player[]
    raw?: any
    details?: string
  }
}
