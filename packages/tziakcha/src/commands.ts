import { Context } from 'koishi'
import { } from '@hieuzest/koishi-plugin-mjob-subscription'

export class TziakchaCommands {
  static inject = ['mjob.$subscription']

  constructor(ctx: Context) {
    ctx.command('mjob.tziakcha').action(() => {})

    ctx.command('mjob.tziakcha.add <...players:string>')
      .action(async ({ session }, ...players) => {
        await ctx.mjob.$subscription.add(session.cid, players)
        return session.text('mjob.general.success')
      })

    ctx.command('mjob.tziakcha.remove <...players:string>')
      .action(async ({ session }, ...players) => {
        await ctx.mjob.$subscription.remove(session.cid, players)
        return session.text('mjob.general.success')
      })

    ctx.command('mjob.tziakcha.list')
      .action(async ({ session }) => {
        const names = await ctx.mjob.$subscription.get(session.cid)
        let msg = ''
        msg += session.text('mjob.commands.list-prompt', [session.text(`mjob.tziakcha.name`)]) + '\n'
        msg += session.text('mjob.commands.list', [...names])
        return msg
      })
  }
}
