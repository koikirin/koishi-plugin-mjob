import { } from '@hieuzest/koishi-plugin-mahjong'
import { } from 'koishi-plugin-cron'
import { Awaitable, Context, Dict, Logger, Schema, Service, clone } from 'koishi'
import { MajsoulWatcher } from './watcher'
import { Document } from '.'

const logger = new Logger('mjob.majsoul')

export class MajsoulNotifyService extends Service {
  // static using = ['mahjong', 'mjob.majsoul']

  constructor(public ctx: Context, public config: MajsoulNotifyService.Config) {
    super(ctx, 'mjob.majsoul.notify')

    ctx.on('mjob/majsoul/watch', function onWatch(watcher: MajsoulWatcher) {
      
      watcher.logger.info('对局开始 fname fid')
    })

    ctx.on('mjob/majsoul/progress', function onWatch(watcher: MajsoulWatcher) {
      watcher.logger.info('对局:', watcher.gameStatus, watcher.users)
    })

    ctx.on('mjob/majsoul/finish', function onWatch(watcher: MajsoulWatcher, users: MajsoulWatcher.User[]) {
      watcher.logger.info('对局完成 ', users)
    })
  }

}

export namespace MajsoulNotifyService {
  export interface Config {

  }
  
  export const Config: Schema<Config> = Schema.object({

  })
}

// export default MajsoulNotifyService
