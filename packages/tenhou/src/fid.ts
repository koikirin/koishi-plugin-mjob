import { Context, Schema } from 'koishi'
import { } from '@hieuzest/koishi-plugin-mjob-fid'

const DEFAULT_FIDS = [
  '121', '57', '113', '49', '249', '185', '241', '177', '105', '41', '97',
  '33', '233', '169', '225', '161',
]

const DEFAULT_FNAMES = {
  '121': '三特南喰赤速',
  '57': '三特南喰赤',
  '113': '三特東喰赤速',
  '49': '三特東喰赤',
  '249': '三鳳南喰赤速',
  '185': '三鳳南喰赤',
  '241': '三鳳東喰赤速',
  '177': '三鳳東喰赤',
  '105': '四特南喰赤速',
  '41': '四特南喰赤',
  '97': '四特東喰赤速',
  '33': '四特東喰赤',
  '233': '四鳳南喰赤速',
  '169': '四鳳南喰赤',
  '225': '四鳳東喰赤速',
  '161': '四鳳東喰赤',
  '0': '/',
}

export class TenhouFid {
  static inject = ['mjob.$fid']

  constructor(ctx: Context, config: TenhouFid.Config) {
    ctx.mjob.$fid.setDefaultFids(config.defaultFids)
    ctx.mjob.$fid.setFilterEnabled(config.enableFidFilter)
    ctx.mjob.$fid.registerFnameGetter(async fid => {
      if (DEFAULT_FNAMES[fid]) return DEFAULT_FNAMES[fid]
      return fid
    })
  }
}

export namespace TenhouFid {
  export interface Config {
    enableFidFilter: boolean
    defaultFids: string[]
  }

  export const Config: Schema<Config> = Schema.object({
    enableFidFilter: Schema.boolean().default(true),
    defaultFids: Schema.array(String).default(DEFAULT_FIDS).role('table'),
  })
}
