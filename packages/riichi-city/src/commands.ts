import { Context } from 'koishi'
import { } from '@hieuzest/koishi-plugin-mjob-subscription'

export class RiichiCityCommands {
  static inject = ['mjob.$subscription']

  constructor(ctx: Context) {
    ctx.command('mjob.riichi-city.add <...players:string>')
      .action(async ({ session }, ...players) => {
        const lNames = players.filter(x => !x.startsWith('$')), lAids = players.filter(x => x.startsWith('$'))
        const queryIds = await ctx['riichi-city'].getAccountsByNicknames(lNames)
        await ctx.mjob.$subscription.add(session.cid, [...lAids, ...Object.values(queryIds).map(x => `$${x[0].userId}`)])
        const failed = lNames.filter(x => !queryIds[x])
        if (failed.length) return session.text('mjob.riichi-city.add-failed', [failed])
        else return session.text('mjob.general.success')
      })

    ctx.command('mjob.riichi-city.remove <...players:string>')
      .action(async ({ session }, ...players) => {
        const lNames = players.filter(x => !x.startsWith('$')), lAids = players.filter(x => x.startsWith('$'))
        const queryIds = await ctx['riichi-city'].getAccountsByNicknames(lNames)
        await ctx.mjob.$subscription.remove(session.cid, [...lAids, ...Object.values(queryIds).map(x => `$${x[0].userId}`)])
        return session.text('mjob.general.success')
      })

    ctx.command('mjob.riichi-city.list')
      .action(async ({ session }) => {
        const ids = await ctx.mjob.$subscription.get(session.cid)
        const accounts = ctx['riichi-city'].getAccounts([...ids].map(x => +x.slice(1)))
        let msg = ''
        msg += session.text('mjob.commands.list-prompt', [session.text(`mjob.riichi-city.name`)]) + '\n'
        msg += session.text('mjob.commands.list', [...Object.entries(accounts).map(([id, account]) => account ? account.nickname : `$${id}`)]) + '\n'
        return msg
      })
  }
}
