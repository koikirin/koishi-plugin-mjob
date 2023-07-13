import { Dict, remove } from "koishi";
import { Document } from ".";

const Yakus = [
  '',
  '门前清自摸和','立直','枪杠','岭上开花','海底摸月',
  '河底捞鱼','役牌 白','役牌 发','役牌 中','役牌:门风牌',
  '役牌:场风牌','断幺九','一杯口','平和','混全带幺九',
  '一气通贯','三色同顺','两立直','三色同刻','三杠子',
  '对对和','三暗刻','小三元','混老头','七对子',
  '纯全带幺九','混一色','二杯口','清一色','一发',
  '宝牌','红宝牌','里宝牌','拔北宝牌','天和',
  '地和','大三元','四暗刻','字一色','绿一色',
  '清老头','国士无双','小四喜','四杠子','九莲宝灯',
  '八连庄','纯正九莲宝灯','四暗刻单骑','国士无双十三面','大四喜'
]

type RawHai = string

interface Hai {
  tp?: 'm' | 'p' | 's' | 'z' | '?'
  no?: string
}

function hai2Tp(hai: RawHai): Hai {
  return { no: hai[0], tp: hai[1] as Hai['tp'] }
}

function hais2Str(hai: RawHai[]) {
  const tps = hai.map(hai2Tp)

  function reduceTp(res: {str: string, tp: Hai['tp']}, cur: Hai) {
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
  const {str, tp} = tps.reduce(reduceTp, {str: '', tp: ''})
  return str + tp
}

function allhais2Str(hai: RawHai[], ms: RawHai[], machi: RawHai) {
  let ret = hais2Str(hai) + ' '
  for (const m of ms) {
    ret += hais2Str(m.split("(")[1].split(")")[0].split(",")) + ' '
  }
  ret += hais2Str([machi])
  return ret

}

export function agari2Str(agari: Dict) {
  const hai: string[] = agari.hand
  const ms = agari.ming || []
  const machi = agari.hu_tile
  const yaku = agari.fans || []
  const haiStr = allhais2Str(hai, ms, machi)
  let yakuStr = ''
  for (const fan of yaku) {
    const ya = fan.name || Yakus[fan.id] || '未知役种'
    yakuStr += `${fan.val} ${ya}\n`
  }

  return haiStr + '\n' + yakuStr
}
