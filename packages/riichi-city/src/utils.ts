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
}

export function agari2Str(fangs: {
  fang_type: number
  fang_num: number
}[]) {
  let ret = ''
  for (const fang of fangs) {
    ret += Yakus[fang.fang_type] + ' ' + fang.fang_num + '\n'
  }
  return ret
}
