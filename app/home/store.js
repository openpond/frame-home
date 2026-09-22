import appStore from '../store'
import * as panelActions from '../../resources/store/actions.panel'
import link from '../../resources/link'

const root = (view = 'holdings') => ({ view, data: {} })
const sections = ['holdings', 'accounts', 'chains', 'tokens', 'dapps', 'settings']

// The shared Frame views expect windows.dash.nav. Keep that navigation local to
// Home so their nested editors and Back buttons never summon the wallet window.
export default function createHomeStore(state, transport = link) {
  let nav = [root()]
  const localDash = () => ({ showing: false, nav })
  const store = appStore({ ...state, windows: { ...state.windows, dash: localDash() } }, null, {
    stateSync: (u, updates) => {
      panelActions.stateSync(u, updates)
      u('windows.dash', localDash)
    },
    homeNavigate: (u, crumb, replace = false) => {
      if (!crumb?.view) return
      if (replace) nav = [crumb]
      else if (JSON.stringify(nav[0]) !== JSON.stringify(crumb)) nav = [crumb, ...nav]
      u('windows.dash', localDash)
    },
    homeUpdate: (u, crumb, navigate) => {
      const updated = {
        view: nav[0]?.view || crumb.view,
        data: Object.keys(crumb.data).length ? { ...nav[0]?.data, ...crumb.data } : {}
      }
      nav = navigate ? [updated, ...nav] : [updated, ...nav.slice(1)]
      u('windows.dash', localDash)
    },
    homeBack: (u, steps = 1) => {
      nav = nav.slice(Math.max(1, steps))
      if (!nav.length) nav = [root()]
      u('windows.dash', localDash)
    }
  })
  const send = transport.send.bind(transport)
  transport.send = (channel, action, ...args) => {
    if (channel === 'home:navigate' && sections.includes(action))
      return store.homeNavigate(root(action), true)
    if (channel === 'tray:action') {
      if (action === 'navDash') return store.homeNavigate(args[0])
      if (action === 'backDash') return store.homeBack(args[0])
      if (action === 'closeDash' || (action === 'setDash' && !args[0]?.showing))
        return store.homeNavigate(root(), true)
    }
    if (action === 'dash') {
      if (channel === 'nav:forward') return store.homeNavigate(args[0])
      if (channel === 'nav:back') return store.homeBack(args[0])
      if (channel === 'nav:update') return store.homeUpdate(args[0], args[1])
    }
    return send(channel, action, ...args)
  }
  return store
}
