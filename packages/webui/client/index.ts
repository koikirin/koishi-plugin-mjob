import { Context } from '@koishijs/client'
import './icons'
import Page from './components/layout.vue'

export default (ctx: Context) => {
  ctx.page({
    name: 'Mjob Dashboard',
    path: '/mjob',
    icon: 'mjob:icon',
    component: Page,
    authority: 4,
  })
}
