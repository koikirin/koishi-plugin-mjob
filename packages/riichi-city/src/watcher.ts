import { Context, defineProperty, Disposable, Logger, remove, Schema, Time } from 'koishi'
import { Progress as BaseProgress, clone, Watchable, Watcher } from '@hieuzest/koishi-plugin-mjob'
import { } from '@hieuzest/koishi-plugin-riichi-city'
import type * as types from '@hieuzest/koishi-plugin-riichi-city/types'
import { Player, RiichiCityProvider } from '.'
import { ActionType, agari2Str, allhais2Str, EventType } from './utils'

export class RiichiCityWatcher extends Watcher<typeof RiichiCityProvider.provider, Player> {
  declare type: typeof RiichiCityProvider.provider
  declare document: types.Room
  gameStatus: RiichiCityWatcher.GameStatus

  logger: Logger
  ctx: Context

  #started: boolean
  #idleCount: number
  #oldseq: number
  #seq: number
  #task: Disposable

  constructor(provider: RiichiCityProvider, watchable: Watchable<typeof RiichiCityProvider.provider, Player>, payload?: any, id?: string) {
    super(watchable, payload, id)
    this.ctx = provider.ctx
    this.logger = new Logger(`mjob.riichi-city:${this.id}`, defineProperty({}, 'ctx', this.ctx))
    this.#started = false
    this.#oldseq = -1
  }

  close(): void {
    this.closed = true
    if (this.#task) this.#task()
    this.#task = null
  }

  async #connect() {
    if (this.finished) return
    if (this.#task) this.#task()
    this.#task = this.ctx.setInterval(async () => {
      if (this.finished) return this.#task()

      try {
        if (!this.#started) {
          const room = await this.ctx['riichi-city'].api.getRoomData(this.watchId)
          this.#idleCount = 0
          this.#started = true
          this.players = []
          for (const round of room.handRecord) {
            // init players
            if (!this.players.length) {
              this.players = round.players.map(p => Object.assign(`$${p.userId}`, {
                userId: p.userId,
                nickname: p.nickname,
              }))
              this.gameStatus = new RiichiCityWatcher.GameStatus()

              await this.ctx.parallel('mjob/progress', this, {
                event: 'match-start', players: this.players, status: this.gameStatus,
              } as RiichiCityWatcher.Progress)
            }
            for (const event of round.handEventRecord) {
              await this._receive(event)
            }
          }
        } else {
          const data = await this.ctx['riichi-city'].api.getGameData(this.watchId, this.#seq + 1)
          if (data.handEventRecord?.length) {
            this.#idleCount = 0
            for (const event of data.handEventRecord) await this._receive(event)
          } else {
            this.#idleCount++
          }
        }
      } catch (e) {
        if (e.code === 155) this.#idleCount++
      }

      if (this.#idleCount > this.provider.config.queryMaxTimes) this.close()
    }, this.provider.config.queryInterval)
  }

  async connect() {
    try {
      await this.#connect()
    } catch (e) {
      this.logger.warn(e, this.watchId)
    }
  }

  async _updatePlayer(id: number, point: number, dpoint: number = 0) {
    const player = this.players.find(p => p.userId === id)
    if (player) {
      player.point = point
      player.dpoint = dpoint
    } else {
      this.players.push(Object.assign(`$${id}`, {
        userId: id,
        nickname: this.document.players.find(p => p.userId === id).nickname,
        point,
        dpoint,
      }))
    }
  }

  async _updatePlayerProgress(id: number, hais: number[] | number) {
    const player = this.players.find(p => p.userId === id)
    if (player) {
      if (Array.isArray(hais)) (player.hais ??= []).push(hais)
      else if (player.hais.some(h => h.every(x => x % 256 === hais % 256))) {
        player.hais.find(h => h.every(x => x % 256 === hais % 256)).push(hais)
      }
    }
  }

  async _resetPlayersProgress() {
    this.players.forEach(p => p.hais = [])
  }

  async _receive(event: types.GameEventRecord) {
    // this.logger.debug(event.eventPos, event.eventType)
    this.#seq = event.eventPos
    try {
      switch (event.eventType) {
        case EventType.GameStart: {
          const data: RiichiCityWatcher.EventType1 = JSON.parse(event.data)
          // Skip duplicate inits
          if (this.gameStatus?.changci === data.chang_ci && this.gameStatus?.honba === data.ben_chang_num) return

          data.user_info_list.forEach(info => this._updatePlayer(info.user_id, info.hand_points))
          this.gameStatus = new RiichiCityWatcher.GameStatus({
            dealer: data.dealer_pos,
            changci: data.chang_ci,
            quan: data.quan_feng,
            honba: data.ben_chang_num,
            riichi: data.li_zhi_bang_num,
          })
          this._resetPlayersProgress()
          if (this.#seq > this.#oldseq) {
            this.ctx.parallel('mjob/progress', this, {
              event: 'round-start', raw: data, status: clone(this.gameStatus), players: clone(this.players),
            } as RiichiCityWatcher.Progress)
          }
          break
        }
        case EventType.SendCurrentAction: break
        case EventType.SendOtherAction: break
        case EventType.ActionBrc: {
          // process action to fill final hands
          const data: RiichiCityWatcher.EventType4 = JSON.parse(event.data)
          switch (data.action) {
            case ActionType.ActionZuoChi:
            case ActionType.ActionZhongChi:
            case ActionType.ActionYouChi:
            case ActionType.ActionPeng:
            case ActionType.ActionMingGang:
            case ActionType.ActionAnGang:
            case ActionType.ActionPullNorth: {
              this._updatePlayerProgress(data.user_id, [data.card, ...data.group_cards ?? []])
              break
            }
            case ActionType.ActionBuGang: {
              this._updatePlayerProgress(data.user_id, data.card)
              break
            }
            case ActionType.ActionChiHu:
            case ActionType.ActionZiMo: {
              this.gameStatus.lastHai = data.card
              break
            }
            default: break
          }
          break
        }
        case EventType.GameEnd: {
          const data: RiichiCityWatcher.EventType5 = JSON.parse(event.data)
          data.user_profit.forEach(info => this._updatePlayer(info.user_id, info.user_point, info.point_profit))
          if (this.#seq > this.#oldseq) {
            const details = []
            const losers = data.user_profit.filter(info => info.point_profit < 0)
            const loser = losers.length === 1 ? losers[0].user_id : null
            for (const win of data.win_info) {
              if (win.fang_info?.length) {
                const winner = this.players.find(p => p.userId === win.user_id)
                const action = winner.nickname
                 + (loser ? (` ロン ${this.players.find(p => p.userId === loser).nickname} `) : ' ツモ ') + win.all_point
                const agariStr = agari2Str(win.fang_info).trimEnd()
                if (!loser) remove(winner.hais, [this.gameStatus.lastHai])
                details.push(action + '\n' + allhais2Str(win.user_cards, winner.hais, this.gameStatus.lastHai) + '\n' + agariStr)
              }
            }
            this.ctx.parallel('mjob/progress', this, {
              event: 'round-end', raw: data, status: clone(this.gameStatus), players: clone(this.players), details: details.length ? details.join('\n') : '流局',
            } as RiichiCityWatcher.Progress)
          }
          break
        }
        case EventType.RoomEnd: {
          const data: RiichiCityWatcher.EventType6 = JSON.parse(event.data)
          data.user_data.forEach(info => this._updatePlayer(info.user_id, info.point_num))
          if (this.#seq > this.#oldseq) {
            this.ctx.parallel('mjob/progress', this, {
              event: 'match-end', raw: data, status: clone(this.gameStatus), players: clone(this.players),
            } as RiichiCityWatcher.Progress)
            this._finish(clone(this.players), 'finished')
          }
          break
        }
        case EventType.GangBaoBrc: break
        case EventType.LiZhiBrc: break
        case EventType.UserZhenTing: break
        case EventType.Pause: break
        case EventType.Ting: break
        default: {
          this.logger.warn('unexpected eventType', event.eventType, event)
          break
        }
      }
    } catch (e) {
      this.logger.warn(e)
    }
  }

  async _finish(players: Player[], finalStatus: Watcher.Status) {
    if (this.finished) return
    if (finalStatus === 'finished') this.closed = true
    this.status = finalStatus
    this.logger.info('Finish', this.watchId, players)
    await this.ctx.parallel('mjob/finish', this, players)
  }

  async _error(err?: any) {
    this.closed = true
    this.status = 'error'
    if (err) this.logger.warn(err)
    await this.ctx.parallel('mjob/error', this)
  }

  dump(): RiichiCityProvider.WatcherDump {
    if (this.finished) return
    return {
      id: this.id,
      watchId: this.watchId,
      seq: this.#seq,
      document: this.document,
    }
  }

  static restore(provider: RiichiCityProvider, data: RiichiCityProvider.WatcherDump): RiichiCityWatcher {
    const watcher = new RiichiCityWatcher(provider, {
      type: RiichiCityProvider.provider,
      provider,
      watchId: data.watchId,
      players: data.document?.players?.map(p =>
        Object.assign(`$${p.userId}`, {
          userId: p.userId,
          nickname: p.nickname,
        })) || [],
    }, { document: data.document, ...(data.payload || {}) }, data.id)
    watcher.#oldseq = data.seq
    return watcher
  }
}

export namespace RiichiCityWatcher {
  export interface GameStatus {
    dealer: number
    changci: number
    quan: number
    honba: number
    riichi: number
    lastHai?: number
  }

  export class GameStatus {
    constructor(fields: GameStatus = {
      dealer: 0,
      changci: 0,
      quan: 49,
      honba: 0,
      riichi: 0,
    }) {
      Object.assign(this, fields)
    }

    toString() {
      const kaze = this.quan === 49 ? '東' : this.quan === 65 ? '南' : '西'
      return `${kaze}${this.changci}局 ${this.honba}本場`
    }
  }

  export interface Progress extends BaseProgress {
    status: GameStatus
    players: Player[]
    raw?: any
    details?: string
  }

  export interface EventType1 {
    hand_cards: number[]
    dealer_pos: number
    dices: number[]
    bao_pai_card: number
    ting_list: number[]
    quan_feng: number
    chang_ci: number
    ben_chang_num: number
    li_zhi_bang_num: number
    user_info_list: {
      user_id: number
      hand_points: number
    }[]
  }

  export interface EventType4 {
    action: number
    card: number
    move_cards_pos: number[]
    user_id: number
    hand_cards?: number[]
    group_cards?: number[]
    is_li_zhi: boolean
    li_zhi_operate: number
    li_zhi_type: number
    command_game_info: unknown[]
  }

  export interface EventType5 {
    end_type: number
    win_info: {
      fang_info: {
        fang_type: number
        fang_num: number
      }[]
      all_fang_num: number
      all_fu: number
      all_point: number
      user_cards: number[]
      li_bao_card: unknown
      user_id: number
      ting_card_list: number[]
      bash_points: number
      luck_score: number
    }[]
    user_profit: {
      user_id: number
      point_profit: number
      li_zhi_profit: number
      is_bao_pai: boolean
      user_point: number
    }[]
    zhong_liu_info: unknown[]
    cheat_info_list: unknown[]
    command_game_info: unknown[]
  }

  export interface EventType6 {
    user_data: {
      user_id: number
      point_num: number
      score: number
      coin: number
      rate_value: number
      pt_value: number
      user_pt_value: number
      next_pt_value: number
      last_user_pt: number
      last_next_pt: number
      StageLevel: number
    }[]
    pai_pu_id: string
    is_exist_room: boolean
  }

  export interface Config {
    queryInterval: number
    queryMaxTimes: number
  }

  export const Config: Schema<Config> = Schema.object({
    queryInterval: Schema.natural().role('ms').default(10 * Time.second),
    queryMaxTimes: Schema.natural().default(100),
  })
}
