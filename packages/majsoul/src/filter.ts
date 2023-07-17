import { } from '@hieuzest/koishi-plugin-mahjong'
import { } from 'koishi-plugin-cron'
import { Awaitable, Context, Dict, Logger, Schema, Service, clone } from 'koishi'
import { MajsoulWatcher } from './watcher'
import { Document } from '.'

const logger = new Logger('mjob.majsoul')

export class MajsoulFilterService extends Service {
  // static using = ['mahjong', 'mjob.majsoul']

  constructor(public ctx: Context, public config: MajsoulFilterService.Config) {
    super(ctx, 'mjob.majsoul.filter')

  }


}

export namespace MajsoulFilterService {
  export interface Config {

  }
  
  export const Config: Schema<Config> = Schema.object({

  })
}

// export default MajsoulFilterService
