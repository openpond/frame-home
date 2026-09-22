import React from 'react'
import { createRoot } from 'react-dom/client'
import Restore from 'react-restore'
import App from './App'
import link from '../../resources/link'
import createHomeStore from './store'

if (process.env.NODE_ENV !== 'development') {
  window.eval = global.eval = () => {
    throw new Error('This app does not support window.eval()')
  }
}
document.addEventListener('dragover', (event) => event.preventDefault())
document.addEventListener('drop', (event) => event.preventDefault())
class HomeErrorBoundary extends React.Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? (
      <div className='homeError' role='alert'>
        <p>Unable to display holdings.</p>
        <button onClick={() => window.location.reload()}>Reload Home</button>{' '}
        <button onClick={() => link.send('home:openWallet')}>Open Extension</button>
      </div>
    ) : (
      this.props.children
    )
  }
}

link.rpc('getState', (err, state) => {
  if (err) {
    document.getElementById('home').textContent = 'Unable to connect to Frame. Close and reopen Home.'
    return
  }
  const store = createHomeStore(state)
  store.observer(() => {
    document.body.classList.remove('dark', 'light')
    document.body.classList.add(store('main.colorway'))
  })
  const Connected = Restore.connect(App, store)
  createRoot(document.getElementById('home')).render(
    <HomeErrorBoundary>
      <Connected />
    </HomeErrorBoundary>
  )
})
