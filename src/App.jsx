import React, { useState, useEffect, useCallback } from 'react'
import { migrateIfNeeded, getPlayers, getWeeks } from './storage'
import SignupForm from './SignupForm'
import AdminView from './AdminView'

migrateIfNeeded()

export default function App() {
  const [view, setView]       = useState('player') // 'player' | 'admin'
  const [players, setPlayers] = useState({})
  const [weeks, setWeeks]     = useState({})

  const refresh = useCallback(() => {
    setPlayers(getPlayers())
    setWeeks(getWeeks())
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <div className="container">
      <header>
        <div className="header-row">
          <div>
            <h1>Monday Night Golf League</h1>
            <p className="muted">Sign up for this week’s round below.</p>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => setView(v => v === 'admin' ? 'player' : 'admin')}
          >
            {view === 'admin' ? '← Player View' : 'Admin ⚙'}
          </button>
        </div>
      </header>

      <main>
        {view === 'player' ? (
          <SignupForm onSignedUp={refresh} />
        ) : (
          <AdminView players={players} weeks={weeks} onRefresh={refresh} />
        )}
      </main>

      <footer>
        <small>Stored in browser localStorage. Build with Vite for production.</small>
      </footer>
    </div>
  )
}
