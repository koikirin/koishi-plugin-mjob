import { Context } from 'koishi'
import { WatcherDump } from './watcher'
import { ProviderType } from './service'
import { resolve } from 'path'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'

export function restore(ctx: Context, provider: ProviderType): WatcherDump[] {
  try {
    const dumps = readFileSync(resolve(ctx.baseDir, `data/mjob/${provider}.dump.json`))
    return JSON.parse(dumps.toString())
  } catch {
    return []
  }
}

export function dump(ctx: Context, provider: ProviderType) {
  try {
    const dumps = Object.values(ctx.mjob.watchers.watchers)
      .filter((watcher) => watcher.type === provider)
      .map((watcher) => {
        const dump = watcher.dump()
        if (dump) {
          if (!dump.payload) dump.payload = {}
          ctx.mjob.dumpKeys.forEach(x => {
            dump.payload[x] = watcher[x]
          })
        }
        return dump
      })
      .filter(x => x)
    mkdirSync(resolve(ctx.baseDir, `data/mjob/`), { recursive: true })
    writeFileSync(resolve(ctx.baseDir, `data/mjob/${provider}.dump.json`), JSON.stringify(dumps, undefined, 2))
    ctx.logger.info(`dumped ${dumps.length} ${provider} watchers`)
  } catch (e) {
    ctx.logger.warn(`dump ${provider} watchers failed`)
  }
}
