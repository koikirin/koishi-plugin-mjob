const Yakus = {
  0: '立直',
  1: '门清自摸',
  2: '一发',
  3: '岭上开花',
  4: '海底捞月',
  5: '河底捞鱼',
  6: '抢杠',
  7: '役牌：中',
  8: '役牌：发',
  9: '役牌：白',
  10: '役牌：场风牌',
  11: '役牌：自风牌',
  12: '一杯口',
  13: '平和',
  14: '断幺九',
  15: '双立直',
  16: '对对和',
  17: '七对子',
  18: '三暗刻',
  19: '三杠子',
  20: '混老头',
  21: '混全带幺九',
  22: '一气通贯',
  23: '三色同顺',
  24: '小三元',
  25: '三色同刻',
  26: '纯全带幺九',
  27: '混一色',
  28: '二杯口',
  29: '清一色',
  30: '流局满贯',
  31: '天和',
  32: '地和',
  33: '人和',
  34: '国士无双',
  35: '国士无双十三面',
  36: '九莲宝灯',
  37: '纯正九莲宝灯',
  38: '四暗刻',
  39: '四暗刻单骑',
  40: '四杠子',
  41: '清老头',
  42: '字一色',
  43: '大四喜',
  44: '小四喜',
  45: '大三元',
  46: '绿一色',
  47: '无发绿一色',
  48: '八连庄',
  49: '赤宝牌',
  50: '宝牌',
  51: '里宝牌',
  52: '开立直',
  53: '开双立直',
  54: '开立直',
  55: '拔北宝牌',
  56: '役牌：北',
}

export namespace ActionType {
  export const ActionNotOperate = 0
  export const ActionCheck = 1
  export const ActionZuoChi = 2
  export const ActionZhongChi = 3
  export const ActionYouChi = 4
  export const ActionPeng = 5
  export const ActionMingGang = 6
  export const ActionChiHu = 7
  export const ActionAnGang = 8
  export const ActionBuGang = 9
  export const ActionZiMo = 10
  export const ActionOutCard = 11
  export const ActionEndGame = 12
  export const ActionPullNorth = 13
  export const ActionNextInCard = 100
  export const ActionLiZhi = 200
  export const ActionDrawCard = 201
  export const ActionOfficalEnter = 202
  export const ActionOfficalPromotion = 203
  export const ActionOfficalFinal = 204
  export const ActionKaiLiZhi = 205
}

export namespace EventType {
  export const GameStart = 1
  export const SendCurrentAction = 2
  export const SendOtherAction = 3
  export const ActionBrc = 4
  export const GameEnd = 5
  export const RoomEnd = 6
  export const GangBaoBrc = 7
  export const LiZhiBrc = 8
  export const UserZhenTing = 9
  export const Pause = 10
  export const Ting = 11

  export interface GameStart {
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

  export interface SendCurrentAction {
    in_card: number
    is_zi_mo: boolean
    gang_cards: number[]
    bu_gang_cards: number[]
    is_gang_incard: boolean
    is_can_lizhi: boolean
    oper_fixed_time: number
    oper_var_time: number
    in_ting_info: unknown[]
    is_nine_cards: boolean
    is_kai_li_zhi: boolean
    is_pull_north: boolean
    is_first_xun_in: boolean
  }

  export interface SendOtherAction {
    out_card: number
    action_list: number[]
    oper_fixed_time: number
    oper_var_time: number
  }

  export interface ActionBrc {
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

  export interface GameEnd {
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

  export interface RoomEnd {
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

  export interface LiZhiBrc {
    user_id: number
    is_auto_gang: boolean
  }
}

interface Hai {
  tp?: 'm' | 'p' | 's' | 'z' | '?'
  no?: string
}

/*
0x01-0x09 1p-9p
0x11-0x19 1s-9s
0x21-0x29 1m-9m
0x31-0x91 1z-7z
0x105-0x125 0p0s0m
*/
function hai2Tp(hai: number): Hai {
  const d1 = hai & 0xf, d2 = (hai & 0xf0) >> 4, d3 = (hai & 0xf00) >> 8
  const tp = d2 < 3 ? ['p', 's', 'm'][d2] : d2 < 10 ? 'z' : '?' as any
  const no = d3 === 1 ? 0 : d1
  return { no: String(no), tp }
}

function hais2Str(hai: number[]) {
  const tps = hai.sort((x, y) => (x % 256 - y % 256)).map(hai2Tp)

  function reduceTp(res: {str: string; tp: Hai['tp']}, cur: Hai) {
    if (!res.tp) {
      res.tp = cur.tp
      res.str += cur.no
    } else if (res.tp === cur.tp) {
      res.str += cur.no
    } else {
      res.str += res.tp
      res.tp = cur.tp
      res.str += cur.no
    }
    return res
  }
  const { str, tp } = tps.reduce(reduceTp, { str: '', tp: '' })
  return str + tp
}

export function allhais2Str(hai: number[], ms: number[][], machi: number) {
  let ret = hais2Str(hai) + ' '
  for (const m of ms) {
    ret += hais2Str(m) + ' '
  }
  ret += hais2Str([machi])
  return ret
}

export function agari2Str(fangs: {
  fang_type: number
  fang_num: number
}[]) {
  let ret = ''
  for (const fang of fangs) {
    ret += fang.fang_num + ' ' + Yakus[fang.fang_type] + '\n'
  }
  return ret
}
