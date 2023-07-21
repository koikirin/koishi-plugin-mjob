import { Context, Logger, Schema, Service } from 'koishi'
import { TenhouWatcher } from './watcher'
import { Player } from '.'

const logger = new Logger('mjob.tenhou')

export class TenhouNotifyService extends Service {
  static using = ['mahjong', 'mjob.tenhou']

  constructor(public ctx: Context, public config: TenhouNotifyService.Config) {
    super(ctx, 'mjob.tenhou.notify')

    ctx.on('mjob/watch', (watcher: TenhouWatcher) => {
      watcher.logger.info('对局载入 ', watcher.players)
    })

    ctx.on('mjob/progress', (watcher: TenhouWatcher, progress: TenhouWatcher.Progress) => {
      if (progress.event === 'match-start')
        watcher.logger.info('对局开始:', progress.players)
      if (progress.event === 'round-end')
        watcher.logger.info('对局:', progress.status, progress.players)
    })

    ctx.on('mjob/finish', (watcher: TenhouWatcher, players: Player[]) => {
      watcher.logger.info('对局完成 ', players)
    })
  }

}

export namespace TenhouNotifyService {
  export interface Config {

  }
  
  export const Config: Schema<Config> = Schema.object({

  })
}

export default TenhouNotifyService
