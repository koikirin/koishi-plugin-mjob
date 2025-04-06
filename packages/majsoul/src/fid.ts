import { Context, Schema } from 'koishi'
import { } from '@hieuzest/koishi-plugin-mjob-fid'

const DEFAULT_FIDS = [
  '211',
  '212',
  '223',
  '224',
  '215',
  '216',
  '225',
  '226',
]

const DEFAULT_FNAMES = {
  '216': '王座之间 四人南',
  '215': '王座之间 四人东',
  '212': '玉之间 四人南',
  '211': '玉之间 四人东',
  '209': '金之间 四人南',
  '208': '金之间 四人东',
  '226': '王座之间 三人南',
  '225': '王座之间 三人东',
  '224': '玉之间 三人南',
  '223': '玉之间 三人东',
  '222': '金之间 三人南',
  '221': '金之间 三人东',
  '0': '/',
}

export class MajsoulFid {
  static inject = ['mjob.$fid', 'mahjong', 'mahjong.majsoul']

  constructor(ctx: Context, config: MajsoulFid.Config) {
    ctx.mjob.$fid.setDefaultFids(config.defaultFids)
    ctx.mjob.$fid.setFilterEnabled(config.enableFidFilter)
    ctx.mjob.$fid.registerFnameGetter(async fid => {
      if (DEFAULT_FNAMES[fid]) return DEFAULT_FNAMES[fid]
      const contest = await ctx.mahjong.majsoul.getContest(fid)
      return contest?.contest_info?.contest_name ?? fid
    })
  }
}

export namespace MajsoulFid {
  export interface Config {
    enableFidFilter: boolean
    defaultFids: string[]
  }

  export const Config: Schema<Config> = Schema.object({
    enableFidFilter: Schema.boolean().default(true),
    defaultFids: Schema.array(String).default(DEFAULT_FIDS).role('table'),
  })
}

export default MajsoulFid
