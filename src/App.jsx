import React, { useState, useEffect, useCallback } from 'react'
import { useLeague } from './contexts/LeagueContext'
import { initializeStorage, refreshFromBackend, getPlayers, getWeeks, setCurrentLeague } from './storage'
import SignupForm from './SignupForm'
import AdminView from './AdminView'

export default function App() {
  const league = useLeague()
  const [view, setView]       = useState('player') // 'player' | 'admin'
  const [players, setPlayers] = useState({})
  const [weeks, setWeeks]     = useState({})
  const [ready, setReady]     = useState(false)

  const refresh = useCallback(async () => {
    await refreshFromBackend()
    const p = await getPlayers()
    const w = await getWeeks()
    setPlayers(p)
    setWeeks(w)
  }, [])

  useEffect(() => {
    // Set current league whenever league changes
    if (league?.id) {
      setCurrentLeague(league.id)
    }
  }, [league?.id])

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
            <h1>{league?.name || 'Golf League'}</h1>
            <p className="muted">Sign up for this week’s round below.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
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
        {view === 'player' ? (
          <SignupForm players={players} onSignedUp={refresh} />
        ) : (
          <AdminView players={players} weeks={weeks} onRefresh={refresh} />
        )}
      </main>

      <footer>
        
      </footer>
    </div>
  )
}
