import { Context, Logger, Schema, Service } from 'koishi'
import { MajsoulWatcher } from './watcher'
import { Player } from '.'

const logger = new Logger('mjob.majsoul')

export class MajsoulNotifyService extends Service {
  static using = ['mahjong', 'mjob.majsoul']

  constructor(public ctx: Context, public config: MajsoulNotifyService.Config) {
    super(ctx, 'mjob.majsoul.notify')

    ctx.on('mjob/watch', (watcher: MajsoulWatcher) => {
      watcher.logger.info('对局载入 ', watcher.players)
    })

    ctx.on('mjob/progress', (watcher: MajsoulWatcher, progress: MajsoulWatcher.Progress) => {
      if (progress.event === 'match-start')
        watcher.logger.info('对局开始:', progress.players)
      if (progress.event === 'round-end')
        watcher.logger.info('对局:', progress.status, progress.players)
    })

    ctx.on('mjob/finish', (watcher: MajsoulWatcher, players: Player[]) => {
      watcher.logger.info('对局完成 ', players)
    })
  }

}

export namespace MajsoulNotifyService {
  export interface Config {

  }
  
  export const Config: Schema<Config> = Schema.object({

  })
}

export default MajsoulNotifyService
