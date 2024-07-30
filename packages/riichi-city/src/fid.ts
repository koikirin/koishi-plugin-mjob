import { Context, Schema } from 'koishi'
import { } from '@hieuzest/koishi-plugin-mjob-fid'

export const DEFAULT_FIDS = [
  '413', '423', '414', '424', '313', '323', '314', '324',
]

export const DEFAULT_FNAMES = {
  '413': '四人炎阳东风战',
  '423': '四人炎阳半庄战',
  '414': '四人银河东风战',
  '424': '四人银河半庄战',
  '313': '三人炎阳东风战',
  '323': '三人炎阳半庄战',
  '314': '三人银河东风战',
  '324': '三人银河半庄战',
  '0': '/',
}

export class RiichiCityFid {
  static inject = ['mjob.$fid']

  constructor(ctx: Context, config: RiichiCityFid.Config) {
    ctx.mjob.$fid.setDefaultFids(config.defaultFids)
    ctx.mjob.$fid.setFilterEnabled(config.enableFidFilter)
    ctx.mjob.$fid.registerFnameGetter(async fid => {
      if (DEFAULT_FNAMES[fid]) return DEFAULT_FNAMES[fid]
      return fid
    })
  }
}

export namespace RiichiCityFid {
  export interface Config {
    enableFidFilter: boolean
    defaultFids: string[]
  }

  export const Config: Schema<Config> = Schema.object({
    enableFidFilter: Schema.boolean().default(true),
    defaultFids: Schema.array(String).default(DEFAULT_FIDS).role('table'),
  })
}
