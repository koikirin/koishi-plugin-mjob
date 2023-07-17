export function parsePlatform(channel: ChannelLike) {
  let platform: string, channelId: string
  if (typeof channel === 'string') {
    [platform, channelId] = channel.split(':')
  } else {
    const {} = { platform, channelId } = channel
  }
  return [platform, channelId]
}

export interface Channel {
  platform: string
  channelId: string
}

export type ChannelLike = string | Channel
