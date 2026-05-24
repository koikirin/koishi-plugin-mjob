import { inflate } from 'pako'
import { Document } from '.'

const Yakus = [
  '无', '大四喜', '大三元', '绿一色', '九莲宝灯', '四杠', '连七对', '十三幺', '清幺九',
  '小四喜', '小三元', '字一色', '四暗刻', '一色双龙会', '一色四同顺', '一色四节高',
  '一色四步高', '一色四连环', '三杠', '混幺九', '七对', '七星不靠', '全双刻', '清一色',
  '一色三同顺', '一色三节高', '全大', '全中', '全小', '清龙', '三色双龙会', '一色三步高',
  '一色三连环', '全带五', '三同刻', '三暗刻', '全不靠', '组合龙', '大于五', '小于五',
  '三风刻', '花龙', '推不倒', '三色三同顺', '三色三节高', '无番和', '妙手回春', '海底捞月',
  '杠上开花', '抢杠和', '碰碰和', '混一色', '三色三步高', '五门齐', '全求人', '双暗杠',
  '双箭刻', '全带幺', '不求人', '双明杠', '和绝张', '箭刻', '圈风刻', '门风刻', '门前清',
  '平和', '四归一', '双同刻', '双暗刻', '暗杠', '断幺', '一般高', '喜相逢', '连六',
  '老少副', '幺九刻', '明杠', '缺一门', '无字', '独听・边张', '独听・嵌张', '独听・单钓',
  '自摸', '花牌', '明暗杠', '\u203b 天和', '\u203b 地和', '\u203b 人和Ⅰ', '\u203b 人和Ⅱ',
]

interface Hai {
  tp?: 'm' | 's' | 'p' | 'z' | 'f' | '?'
  no?: string
}

function decodeP(p: number) {
  const tile = (p & 0x3F) << 2
  const type = (p >> 8) & 3

  if (type === 0) return [tile - 4, tile, tile + 4]
  else if (type === 1) return [tile >> 2 << 2, (tile >> 2 << 2) + 1, (tile >> 2 << 2) + 2]
  else if (type === 2 || type === 3) return [tile >> 2 << 2, (tile >> 2 << 2) + 1, (tile >> 2 << 2) + 2, (tile >> 2 << 2) + 3]
  else return []
}

function hai2Tp(hai: number): Hai {
  let tp: Hai['tp']
  if (hai >= 0 && hai < 36) tp = 'm'
  else if (hai >= 36 && hai < 72) tp = 's'
  else if (hai >= 72 && hai < 108) tp = 'p'
  else if (hai >= 108 && hai < 136) tp = 'z'
  else if (hai >= 136 && hai < 144) tp = 'f'
  else tp = '?'

  let no: number
  if (hai < 136) {
    no = Math.floor((hai % 36) / 4) + 1
  } else {
    no = hai - 136 + 1
  }
  return { no: String(no), tp }
}

function hais2Str(hai: number[]) {
  const tps = [...hai].sort((a, b) => a - b).map(hai2Tp)

  function reduceTp(res: { str: string; tp: Hai['tp'] }, cur: Hai) {
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
  const { str, tp } = tps.reduce(reduceTp, { str: '', tp: '' as Hai['tp'] })
  return str + tp
}

function allhais2Str(hai: number[], ms: number[], machi: number) {
  let ret = hais2Str(hai) + ' '
  for (const m of ms) {
    const dm = decodeP(m)
    if (dm.length) ret += hais2Str(dm) + ' '
  }
  ret += hais2Str([machi])
  return ret
}

export function agari2Str(agari: any) {
  const hai: number[] = [...agari.h.s]
  const ms: number[] = agari.h.p
  const machi = hai[hai.length - 1]
  const idx = hai.lastIndexOf(machi)
  if (idx !== -1) hai.splice(idx, 1)
  const yaku: Record<string, number> = agari.t

  const haiStr = allhais2Str(hai, ms, machi)
  let yakuStr = ''
  for (const [i, v] of Object.entries(yaku)) {
    const val = (v % 256) * (Math.floor(v / 256) + 1)
    yakuStr += String(val) + ' ' + Yakus[Number(i)] + '\n'
  }
  return haiStr + '\n' + yakuStr
}

// Decompress base64+zlib record script
export function parseRecord(script: string): any {
  const binary = Uint8Array.from(atob(script), c => c.charCodeAt(0))
  const json = inflate(binary, { to: 'string' })
  return JSON.parse(json)
}

// Parse cfg2 format (new API)
export function parseCfg2(cfg: number): Document.GameConfig {
  const hex = cfg.toString(16).padStart(16, '0')
  const l = parseInt(hex.slice(8), 16)
  const h = parseInt(hex.slice(0, 8), 16)
  return {
    l: (h >> 24) & 0xff,
    b: (h >> 16) & 0xff,
    r0: (h >> 8) & 0xff,
    r1: h & 0xff,
    e: (l >> 24) & 0xff,
    lt: (l >> 16) & 0xff,
    z: !!((l >> 14) & 1),
    d: !!((l >> 13) & 1),
    s: !!((l >> 12) & 1),
    o: !!((l >> 11) & 1),
    a: !!((l >> 10) & 1),
    r: !!((l >> 9) & 1),
    bl: !!((l >> 8) & 1),
  }
}

// Parse time limit from cfg (in minutes)
export function parseCfgTimeLimit(cfg: number): number {
  const hex = cfg.toString(16).padStart(16, '0')
  const l = parseInt(hex.slice(8), 16)
  return ((l >> 16) & 0xff) * 5
}

export function calcRS(v: number, b: number): number[] {
  const a = [0, 0, 0, 0]
  const f = v >> 16
  let w = -1, c = -1
  if (f) {
    for (let i = 0; i < 4; i++) {
      if (v & (1 << i)) w = i
      if (v & (1 << (i + 4))) c = i
    }
    if (w !== c) {
      const s = -b
      for (let i = 0; i < 4; i++) {
        if (i === w) a[i] = f + b * 3
        else if (i === c) a[i] = s - f
        else a[i] = s
      }
    } else {
      const s = b + f
      const t = s * 3
      for (let i = 0; i < 4; i++) {
        a[i] = i !== w ? -s : t
      }
    }
  }
  return a
}
