import { Context, Logger, Schema, Service } from 'koishi'

const logger = new Logger('mjob.majsoul')

export class MajsoulFidService extends Service {
  // static using = ['mahjong', 'mjob.majsoul']

  constructor(public ctx: Context, public config: MajsoulFidService.Config) {
    super(ctx, 'mjob.majsoul.fid')

  }

  async set(fid: string, fname: string) {

  }

  async get(fid: string) {
    return 'Un'
  }

}

export namespace MajsoulFidService {
  export interface Config {

  }
  
  export const Config: Schema<Config> = Schema.object({

  })
}

// export default MajsoulFidService
