import { Context } from 'koishi'
import { Watcher } from './watcher'
import { ProviderType, CoreService } from './service'
import { } from '@hieuzest/koishi-plugin-cache-sync'

export function restore(ctx: Context, provider: ProviderType, drop: boolean = true) {
  if (!ctx.synccache) return []
  const dumps = Object.values(ctx.synccache.table(provider)).map(x => x.value)
  if (drop) ctx.synccache.clear(provider)
  return dumps
}

export function dump(ctx: Context, watcher: Watcher) {
  if (!ctx.synccache) return false
  const dump = watcher.dump()
  if (dump) {
    if (!dump.payload) dump.payload = {}
    CoreService.dumpKeys.forEach(x => {
      dump.payload[x] = watcher[x]
    })
    return (ctx.synccache.set(watcher.type, watcher.id, dump), true)
  }
  return false
}