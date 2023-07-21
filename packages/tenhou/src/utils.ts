import { Document } from ".";

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