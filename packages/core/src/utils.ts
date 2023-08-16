import { Dict } from 'koishi'

export function valueMap<T, U>(object: Dict<T>, transform: (value: T, key: string) => U): Dict<U> {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]))
}

export function valueStringMap<T, U>(object: Dict<T>, transform: (value: T, key: string) => U): Dict<U> {
  return Object.fromEntries(Object.entries(object).filter(([key, _]) => isNaN(parseInt(key))).map(([key, value]) => [key, transform(value, key)]))
}

export function is<K extends keyof typeof globalThis>(type: K, value: any): value is InstanceType<typeof globalThis[K]> {
  return type in globalThis && value instanceof (globalThis[type] as any)
    || Object.prototype.toString.call(value).slice(8, -1) === type
}

export function clone<T>(source: T): T
export function clone(source: any) {
  if (!source || typeof source !== 'object') return source
  if (Array.isArray(source)) return source.map(clone)
  if (is('Date', source)) return new Date(source.valueOf())
  if (is('RegExp', source)) return new RegExp(source.source, source.flags)
  if (is('String', source)) return Object.assign(source.valueOf(), valueStringMap(source as any, clone))
  if (source.valueOf) return Object.assign(source.valueOf(), valueMap(source, clone))
  return valueMap(source, clone)
}
