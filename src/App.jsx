import React, { useState, useEffect, useCallback } from 'react'
import { initializeStorage, refreshFromBackend, getPlayers, getWeeks } from './storage'
import SignupForm from './SignupForm'
import AdminView from './AdminView'
import SupabaseTest from './SupabaseTest'

export default function App() {
  const [view, setView]       = useState('player') // 'player' | 'admin' | 'supabase-test'
  const [players, setPlayers] = useState({})
  const [weeks, setWeeks]     = useState({})
  const [ready, setReady]     = useState(false)

  const refresh = useCallback(async () => {
    await refreshFromBackend()
    setPlayers(getPlayers())
    setWeeks(getWeeks())
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      await initializeStorage()
      if (!active) return
      await refresh()
      if (active) setReady(true)
    })()
    return () => { active = false }
  }, [refresh])

  if (!ready) {
    return (
      <div className="container">
        <main>
          <p className="muted">Loading signup data...</p>
        </main>
      </div>
    )
  }

  return (
    <div className="container">
      <header>
        <div className="header-row">
          <div>
            <h1>Monday Night Golf League</h1>
            <p className="muted">Sign up for this week’s round below.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-ghost"
              onClick={() => setView('supabase-test')}
              style={{ fontSize: '12px', padding: '6px 10px' }}
            >
              🔌 Test DB
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setView(v => v === 'admin' ? 'player' : 'admin')}
            >
              {view === 'admin' ? '← Player View' : 'Admin ⚙'}
            </button>
          </div>
        </div>
      </header>

      <main>
        {view === 'supabase-test' ? (
          <SupabaseTest />
        ) : view === 'player' ? (
          <SignupForm players={players} onSignedUp={refresh} />
        ) : (
          <AdminView players={players} weeks={weeks} onRefresh={refresh} />
        )}
      </main>

      <footer>
        <small>Stored in backend storage (with local fallback).</small>
      </footer>
    </div>
  )
}
