import { WebSocket } from 'ws'
import { } from '@hieuzest/koishi-plugin-mahjong'
import { Context, Dict, Logger, Schema, Time } from 'koishi'
import { Watcher, Watchable, Progress as BaseProgress, ProgressEvents, clone } from '@hieuzest/koishi-plugin-mjob'
import { MajsoulProvider, Document, Player } from '.'
import { agari2Str } from './utils'

const logger = new Logger('mjob.majsoul')

export class MajsoulWatcher extends Watcher<typeof MajsoulProvider.provider, Player> {
  
  type: typeof MajsoulProvider.provider
  document: Document
  gameStatus: MajsoulWatcher.GameStatus

  logger: Logger
  ctx: Context
  #ws: WebSocket
  #token: string
  #connectRetries: number
  #seq: number
  #oldseq: number
  
  constructor(provider: MajsoulProvider, watchable: Watchable<typeof MajsoulProvider.provider, Player>, payload?: any, id?: string) {
    super(watchable, payload, id)
    this.ctx = provider.ctx
    this.logger = logger
    this.#connectRetries = 0
    this.#oldseq = 0
  }

  close(): void {
    this.closed = true
    if (this.#ws) this.#ws.close()
    this.#ws = null
  }

  private async _queryResult() {
    if (this.finished) return true
    const paipu = await this.ctx.mahjong.majsoul.getPaipuHead(this.watchId)
    if (!paipu || paipu.err) return
    if (!this.players.length) {
      Array(paipu.head.result.players.length).forEach(_ => this.players.push(Object.assign('$0', {
        nickname: '電腦',
        accountId: 0,
      })))
      paipu.head.accounts.forEach(p => {
        this.players[p.seat] = Object.assign(`$${p.account_id}`, {
          nickname: p.nickname,
          accountId: p.account_id,
        })
      })
    }
    const players = clone(this.players)
    paipu.head.result.players.forEach(p => {
      players[p.seat].score = p.grading_score
      players[p.seat].point = p.part_point_1
    })
    this.logger.debug('Early finished')
    await this.#finish(players, 'earlyFinished')
    return true
  }

  async queryResult() {
    try {
      if (await this._queryResult()) return
      setTimeout(this.queryResult.bind(this), 1000 * 30)
    } catch (e) {
      this.logger.error(e)
      setTimeout(this.queryResult.bind(this), 1000 * 60)
    }
  }

  async #connect() {
    if (this.finished) return
    let retries = 0

    if (!this.#token) while (!this.closed) {
      try {
        this.#token = (await this.ctx.mahjong.majsoul.getObToken<{token: string}>(this.watchId)).token
        break
      }
      catch (e) {
        retries += 1
        if (retries > 6) {
          this.closed = true
          this.status = 'error'
          // emit
          this.logger.error('Fail to fetch token')
          return
        }
      }
    }

    this.logger.debug('Token: ', this.#token)
    if (this.finished) return
    if (this.#ws) this.#ws.close()
    this.#ws = this.ctx.http.ws(`${this.provider.config.obUri}?token=${this.#token}&tag=${this.watchId}`)
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
      seq: number,
      name: string,
      data?: any,
    } = JSON.parse(data)
    // this.logger.debug(m)

    const seq = m.seq
    if (seq === 0 && this.#seq <= 0) {}
    else if (seq <= this.#seq) return
    this.#seq = seq

    if (m.name === 'ob_init') {
      const data = JSON.parse(m.data)
      if ('head' in data) {
        const wg: Document.Wg = JSON.parse(JSON.parse(m.data).head)
        this.players = []
        const tmpPlayers: Dict<Player> = {}
        for (const player of wg.players)
          tmpPlayers[player.account_id] = Object.assign(`$${player.account_id}`, {
            nickname: player.nickname,
            accountId: player.account_id,
            point: 0,
            dpoint: 0,
          })
        for (const aid of wg.seat_list)
          if (aid === 0) this.players.push(Object.assign('$0', {
            nickname: '電腦',
            accountId: 0,
            point: 0,
            dpoint: 0,
          }))
          else this.players.push(tmpPlayers[aid])
      } else if ('seq' in data) {
        this.status = 'playing'
        this.#progress(m, clone(this.gameStatus), clone(this.players))
      } else {
        this.logger.debug('Waiting')
        // Should we count this as retry?
      }
        
    } else if (m.name === '.lq.RecordNewRound') {
      this.gameStatus = new MajsoulWatcher.GameStatus({
        oya: m.data.ju,
        kyoku: m.data.chang * 4 + m.data.ju,
        honba: m.data.ben,
        riichi: m.data.liqibang,
      })

      this.players.forEach((user, i) => {
        user.point = m.data.scores[i]
      })
      if (this.#seq > this.#oldseq) this.#progress(m, clone(this.gameStatus), clone(this.players))

    } else if (m.name === '.lq.RecordHule') {
      this.players.forEach((user, i) => {
        user.point = m.data.scores[i]
        user.dpoint = m.data.delta_scores[i]
      })
      if (this.#seq > this.#oldseq) this.#progress(m, clone(this.gameStatus), clone(this.players))

    } else if (m.name === '.lq.RecordLiuju') {
      logger.error('Should not reach here, please contact dev if this happens', m)
      // this.players.forEach((user, i) => {
      //   user.point = m.data.scores[i]
      //   user.dpoint = m.data.delta_scores[i]
      // })
      if (this.#seq > this.#oldseq) this.#progress(m, clone(this.gameStatus), clone(this.players))

    } else if (m.name === '.lq.RecordNoTile') {
      const ss = m.data.scores[m.data.scores.length - 1]
      if ('scores' in ss) 
        this.players.forEach((user, i) => {
          user.point = ss.scores[i]
          user.dpoint = 0
        })
      else
        this.players.forEach((user, i) => {
          user.dpoint = ss.delta_scores?.[i] || 0
          user.point = ss.old_scores[i] + user.dpoint
        })
      if (this.#seq > this.#oldseq) this.#progress(m, clone(this.gameStatus), clone(this.players))

    } else if (m.name === '.lq.NotifyGameEndResult') {
      m.data.result.players.forEach(p => {
        this.players[p.seat].score = p.grading_score
        this.players[p.seat].point = p.part_point_1
      })
      if (this.#seq > this.#oldseq) {
        this.#finish(clone(this.players), 'finished')
      }
    }
  }

  async #progress(m: {
    seq: number,
    name: string,
    data?: any,
  }, status: MajsoulWatcher.GameStatus, players: Player[]) {
    players.sort((p1, p2) => - p1.point + p2.point)
    this.logger.debug('Progress', this.watchId, status, players)

    if (m.name === '.lq.RecordHule') {
      let details = []
      for (const hule of m.data.hules) {
        const action = players[hule.seat].nickname + ' '
          + (hule.zimo ? 'ツモ'
          : ('ロン ' + players[(m.data.delta_scores as number[]).findIndex((value, i) => value < 0)].nickname))
          + hule.dadian
        const agariStr = agari2Str(hule).trimEnd()
        details.push(action + '\n' + agariStr)
      }
      await this.ctx.parallel('mjob/progress', this, {
        event: MajsoulWatcher.ProgressEventMapping[m.name],
        status, players, raw: m, details: details.join('\n')
      } as MajsoulWatcher.Progress)
    } else if (m.name === '.lq.RecordNoTile' || m.name === '.lq.RecordLiuju') {
      const action = '流局' + (m.data.liujumanguan ? '满贯' : '')
      await this.ctx.parallel('mjob/progress', this, {
        event: MajsoulWatcher.ProgressEventMapping[m.name],
        status, players, raw: m, details: action
      } as MajsoulWatcher.Progress)
    } else {
      await this.ctx.parallel('mjob/progress', this, {
        event: MajsoulWatcher.ProgressEventMapping[m.name],
        status, players, raw: m
      } as MajsoulWatcher.Progress)
    }
  }

  async #finish(players: Player[], finalStatus: Watcher.Status) {
    if (this.finished) return
    if (finalStatus === 'finished') this.closed = true
    this.status = finalStatus
    this.logger.info('Finish', this.watchId, players)
    await this.ctx.parallel('mjob/finish', this, players)
  }

  dump(): MajsoulProvider.WatcherDump {
    if (this.finished) return
    return {
      id: this.id,
      watchId: this.watchId,
      seq: this.#seq,
      document: this.document,
    }
  }

  static restore(provider: MajsoulProvider, data: MajsoulProvider.WatcherDump): MajsoulWatcher {
    const watcher = new MajsoulWatcher(provider, {
      type: MajsoulProvider.provider,
      provider,
      watchId: data.watchId,
      players: data.document?.wg?.players?.map(p =>
        Object.assign(`$${p.account_id}`, {
          accountId: p.account_id,
          nickname: p.nickname,
        })) || [],
    }, { document: data.document, ...(data.payload||{}) }, data.id)
    watcher.#oldseq = data.seq
    return watcher
  }
}

export namespace MajsoulWatcher {

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

  export const ProgressEventMapping: Dict<ProgressEvents> = {
    '.lq.RecordNewRound': 'round-start',
    '.lq.RecordHule': 'round-end',
    '.lq.RecordLiuju': 'round-end',
    '.lq.RecordNoTile': 'round-end',
    'ob_init': 'match-start',
  }

  export interface Progress extends BaseProgress {
    status: GameStatus
    players: Player[]
    raw: {
      seq: number
      name: string
      data?: any
    }
  }

  export interface Config {
    obUri: string
    reconnectInterval: number
    reconnectTimes: number
  }

  export const Config: Schema<Config> = Schema.object({
    obUri: Schema.string().default('ws://localhost:7237'),
    reconnectInterval: Schema.natural().role('ms').default(20 * Time.second),
    reconnectTimes: Schema.natural().default(5),
  })
}
