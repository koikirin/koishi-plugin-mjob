import { Context, Schema } from 'koishi'
import { } from '@hieuzest/koishi-plugin-mjob-subscription'

export class TenhouCommands {
  static using = ['mjob.$subscription']

  constructor(ctx: Context) {
    ctx.command('mjob.tenhou.add <...players:string>')
      .action(async ({ session }, ...players) => {
        await ctx.mjob.$subscription.add(session.cid, players)
        return session.text('mjob.general.success')
      })

    ctx.command('mjob.tenhou.remove <...players:string>')
      .action(async ({ session }, ...players) => {
        await ctx.mjob.$subscription.remove(session.cid, players)
        return session.text('mjob.general.success')
      })

    ctx.command('mjob.tenhou.list')
      .action(async ({ session }) => {
        const names = await ctx.mjob.$subscription.get(session.cid)
        let msg = ''
        msg += session.text('mjob.commands.list-prompt', [session.text(`mjob.tenhou.name`)]) + '\n'
        msg += session.text('mjob.commands.list', [...names])
        return msg
      })
  }
}
