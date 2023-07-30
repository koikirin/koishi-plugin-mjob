import { Dict, remove } from "koishi";
import { Document } from ".";

const Yakus = {
  0: '門前清自摸和',
  1: '立直',
  2: '一発',
  3: '搶槓',
  4: '嶺上開花',
  5: '海底摸月',
  6: '河底撈魚',
  7: '平和',
  8: '断么九',
  9: '一盃口',
  10: '自風東',
  11: '自風南',
  12: '自風西',
  13: '自風北',
  14: '場風東',
  15: '場風南',
  16: '場風西',
  17: '場風北',
  18: '役牌白',
  19: '役牌發',
  20: '役牌中',
  21: 'ダブル立直',
  22: '七対子',
  23: '混全帯么九',
  24: '一気通貫',
  25: '三色同順',
  26: '三色同刻',
  27: '三槓子',
  28: '対々和',
  29: '三暗刻',
  30: '小三元',
  31: '混老頭',
  32: '二盃口',
  33: '純全帯么九',
  34: '混一色',
  35: '清一色',
  52: 'ドラ',
  53: '裏ドラ',
  54: '赤ドラ',
  36: '人和',
  37: '天和',
  38: '地和',
  39: '大三元',
  40: '四暗刻',
  41: '四暗刻単騎',
  42: '字一色',
  43: '緑一色',
  44: '清老頭',
  45: '九蓮宝燈',
  46: '純正九蓮宝燈',
  47: '国士無双',
  48: '国士無双十三面待ち',
  49: '大四喜',
  50: '小四喜',
  51: '四槓子'
}

interface Hai {
  tp?: 'm' | 'p' | 's' | 'z' | '?'
  no?: string
}

function decodeM(m: number) {
  const kui = m & 3
  let t: number, r: number, h: number[] = []
  // SYUNNTSU
  if (m & (1 << 2)) {
    t = (m & 0xFC00) >> 10
    r = t % 3
    t = Math.floor(t / 3)
    t = Math.floor(t / 7) * 9 + t % 7
    t *= 4
    h = [
        t + 4 * 0 + ((m & 0x0018) >> 3), t + 4 * 1 + ((m & 0x0060) >> 5),
        t + 4 * 2 + ((m & 0x0180) >> 7)
    ]
    return h
  // KOUTSU
  } else if (m & (1 << 3)) {
    const unused = (m & 0x0060) >> 5
    t = (m & 0xFE00) >> 9
    r = t % 3
    t = Math.floor(t / 3)
    t *= 4
    h = [t, t + 1, t + 2, t + 3]
    remove(h, t + unused)
    return h
  // CHAKANN
  } else if (m & (1 << 4)) {
    const added = (m & 0x0060) >> 5
    t = (m & 0xFE00) >> 9
    r = t % 3
    t = Math.floor(t / 3)
    t *= 4
    h = [t, t + 1, t + 2, t + 3]
    return h
  // NUKI
  } else if (m & (1 << 5)) {
    return [30 * 4]
  // MINNKANN, ANNKANN
  } else {
    let hai0 = (m & 0xFF00) >> 8
    if (!kui)
        hai0 = (hai0 & ~3) + 3
    t = Math.floor(hai0 / 4) * 4
    h = [t, t + 1, t + 2, t + 3]
    return h
  }
}

function hai2Tp(hai: number): Hai {
  let tp
  if (0 <= hai && hai < 36) tp = 'm'
  else if (36 <= hai && hai < 72) tp = 'p'
  else if (72 <= hai && hai < 108) tp = 's'
  else if (108 <= hai && hai < 136) tp = 'z'
  else tp = '?'

  let no = Math.floor((hai % 36) / 4) + 1
  if (no === 5 && hai < 108 && hai % 4 === 0) no = 0
  return {no: String(no), tp}
}

function hais2Str(hai: number[]) {
  const tps = hai.sort().map(hai2Tp)

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

function allhais2Str(hai: number[], ms: number[], machi: number) {
  let ret = hais2Str(hai) + ' '
  for (const m of ms) {
    const dm = decodeM(m)
    if (dm) ret += hais2Str(dm) + ' '
  }
  ret += hais2Str([machi])
  return ret
}

export function agari2Str(agari: Dict<string>) {
  const hai: number[] = agari.hai.split(',').map(Number)
  const ms = agari.m ? agari.m.split(',').map(Number) : []
  const machi = Number(agari.machi)
  remove(hai, machi)
  const yaku = agari.yaku ? agari.yaku.split(',').map(Number) : []
  const yakuman = agari.yakuman ? agari.yakuman.split(',').map(Number) : []
  const haiStr = allhais2Str(hai, ms, machi)
  let yakuStr = ''
  for (const i of Array(Math.floor(yaku.length / 2)).keys()) {
    yakuStr += yaku[i*2+1] + ' ' + Yakus[yaku[i*2]] + '\n'
  }
  for (const ya of yakuman) {
    yakuStr += Yakus[ya] + '\n'
  }
  return haiStr + '\n' + yakuStr
}

function convertTime(timeString: string) {
  const [hours, minutes] = timeString.split(':').map(Number)
  const date = new Date()
  if (date.getUTCHours() === 23 && hours === 9) date.setUTCHours(24)
  else if (date.getUTCHours() < 3 && hours === 8) date.setUTCHours(-1)
  else date.setUTCHours((hours + 24 - 9) % 24)
  date.setMinutes(minutes)
  date.setSeconds(0)
  return date.getTime()
}

function parseWgString(s: string) {
  const ss = s.split(',')
  const wgametype = Number(ss[3])
  const res: Document = {
    info: {
      id: ss[0],
      starttime: convertTime(ss[2]),
      playernum: wgametype & 0b00010000 ? 3 : 4,
      playlength: wgametype & 0b00001000 ? 2 : 1,
      playerlevel: (wgametype & 0b10100000) === 0b10100000 ? 3 : 2,
      kuitanari: wgametype & 0b00000100 ? 0 : 1,
      akaari: wgametype & 0b00000010 ? 0 : 1,
      rapid: wgametype & 0b01000000 ? 1 : 0,
      yami: 0,
    },
    players: []
  }
  for (const i of Array(res.info.playernum).keys()) {
    res.players.push({
      name: Buffer.from(ss[4 + 3 * i], 'base64').toString('utf-8'),
      rate: Math.floor(Number(ss[6 + 3 * i])),
      grade: Number(ss[5 + 3 * i]),
    })
  }
  return res
}

export function * parseWgStrings(s: string) {
  let flag = false
  for(const cfg of s.split('"')) {
    if (flag) yield parseWgString(cfg)
    flag = !flag
  }
}

export function getFidFromDocument(wg: Document) {
  let fid = 0b00000001
  if (wg.info.playernum === 3)
      fid |= 0b00010000
  if (wg.info.playerlevel === 3)
      fid |= 0b10100000
  else
      fid |= 0b00100000
  if (wg.info.playlength === 2)
      fid |= 0b00001000
  if (wg.info.rapid === 1)
      fid |= 0b01000000
  return String(fid)
}

export function getFnameFromDocument(wg: Document) {
  const mapping = {
    "三": wg.info.playernum === 3,
    "四": wg.info.playernum === 4,
    "特": wg.info.playerlevel === 2,
    "鳳": wg.info.playerlevel === 3,
    "東": wg.info.playlength === 1,
    "南": wg.info.playlength === 2,
    "喰": wg.info.kuitanari,
    "赤": wg.info.akaari,
    "速": wg.info.rapid,
  }
  return Object.entries(mapping).reduce((prev, [key, cond]) => cond ? prev + key : prev, '')
}
