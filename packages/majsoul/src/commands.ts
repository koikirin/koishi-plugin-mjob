import { Context, Schema } from 'koishi'
import { } from '@hieuzest/koishi-plugin-mjob-subscription'

export class MajsoulCommands {
  static using = ['mjob.$subscription']

  constructor(ctx: Context) {
    ctx.command('mjob.majsoul.add <...players:string>')
      .action(async ({ session }, ...players) => {
        const curtime = Date.now() / 1000
        let sNotFound = [], sLikeliy = [], sPrefer = [], sConflict = [], success = 0
        const lNames = players.filter(x => !x.startsWith('$')), lAids = players.filter(x => x.startsWith('$'))
        const decodeds = [...lAids]
        const namepairs = await ctx.mahjong.majsoul.queryMultiAccountIdFromNickname(lNames)
        for (const [name, aids] of Object.entries(namepairs)) {
          if (Object.keys(aids).length === 1) {
            decodeds.push(`$${Object.keys(aids)[0]}`)
            continue
          }
          if (!Object.keys(aids).length) {
            sNotFound.push(name)
            continue
          }
          
          const filteredAids: [number, number][] = Object.entries(aids).filter(([aid, mt]) => mt + 60 * 60 * 24 * 100 > curtime) as any
          if (filteredAids.length === 1) {
            decodeds.push(`$${filteredAids[0][0]}`)
            sLikeliy.push(`${name} (${ctx.mahjong.majsoul.getAccountZone(filteredAids[0][0])}${filteredAids[0][0]})`)
            continue
          } 

          const preferedAid = Object.keys(aids).find(aid => ctx.mahjong.majsoul.getAccountZone(aid as unknown as number) === 'Ⓒ' )
          if (preferedAid) {
            decodeds.push(`$${preferedAid}`)
            sPrefer.push(`${name} (Ⓒ${preferedAid})`)
            continue
          }

          const strAid = (aid: number) => `${ctx.mahjong.majsoul.getAccountZone(aid)}${aid}`
          sConflict.push(`${name} (` + (Object.keys(aids) as unknown as number[]).map(strAid).join(',') + `)`)  
        }

        await ctx.mjob.$subscription.add(session.cid, decodeds)
        let msg = session.text('mjob.majsoul.commands.add-success', [decodeds.length])
        if (sLikeliy.length) msg += '\n' + session.text('mjob.majsoul.commands.add-likely') + '\n' + sLikeliy.join('\n')
        if (sPrefer.length) msg += '\n' + session.text('mjob.majsoul.commands.add-prefer') + '\n' + sPrefer.join('\n')
        if (sConflict.length) msg += '\n' + session.text('mjob.majsoul.commands.add-conflict') + '\n' + sConflict.join('\n')
        if (sNotFound.length) msg += '\n' + session.text('mjob.majsoul.commands.add-notfound') + '\n' + sNotFound.join('\n')
        return msg
      })

    ctx.command('mjob.majsoul.remove <...players:string>')
      .action(async ({ session }, ...players) => {
        const lNames = players.filter(x => !x.startsWith('$')), lAids = players.filter(x => x.startsWith('$'))
        const decodeds = [...lAids]
        const namepairs = await ctx.mahjong.majsoul.queryMultiAccountIdFromNickname(lNames)
        for (const [name, aids] of Object.entries(namepairs)) {
          for (const aid of Object.keys(aids)) {
            decodeds.push(`$${aid}`)
          }
        }

        await ctx.mjob.$subscription.remove(session.cid, decodeds)
        return session.text('mjob.general.success')
      })

    ctx.command('mjob.majsoul.list')
      .action(async ({ session }) => {
        const aids = await ctx.mjob.$subscription.get(session.cid)
        const names = await ctx.mahjong.majsoul.queryMultiNicknameFromAccountId([...aids].map(x => Number(x.slice(1))))
        let msg = ''
        msg += session.text('mjob.commands.list-prompt', [session.text(`mjob.majsoul.name`)]) + '\n'
        msg += session.text('mjob.commands.list', Object.values(names))
        return msg
      })

  }
}
