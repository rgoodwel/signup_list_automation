import React, { useState, useEffect, useCallback } from 'react'
import { useLeague } from './contexts/LeagueContext'
import { initializeStorage, refreshFromBackend, getPlayers, getWeeks, getCurrentWeekKey, getWeek, setCurrentLeague, ensureCurrentWeekExists } from './storage'
import SignupForm from './SignupForm'
import AdminView from './AdminView'

export default function App() {
  const league = useLeague()
  const [view, setView]       = useState('player') // 'player' | 'admin'
  const [players, setPlayers] = useState({})
  const [weeks, setWeeks]     = useState({})
  const [currentWeekKey, setCurrentWeekKey] = useState(null)
  const [currentWeek, setCurrentWeek] = useState(null)
  const [ready, setReady]     = useState(false)

  const refresh = useCallback(async () => {
    await refreshFromBackend()
    const p = await getPlayers()
    const w = await getWeeks()
    setPlayers(p)
    setWeeks(w)
    
    // Also fetch current week
    const weekKey = await getCurrentWeekKey()
    setCurrentWeekKey(weekKey)
    if (weekKey) {
      const week = await getWeek(weekKey)
      setCurrentWeek(week)
    }
  }, [])

  useEffect(() => {
    // Set current league FIRST, before any storage queries
    if (league?.id) {
      setCurrentLeague(league.id)
    }
  }, [league?.id])

  useEffect(() => {
    // Only initialize and refresh after league is set
    if (!league?.id) return
    
    let active = true
    ;(async () => {
      await initializeStorage()
      if (!active) return
      // Ensure current week exists so players can be displayed
      await ensureCurrentWeekExists()
      if (!active) return
      await refresh()
      if (active) setReady(true)
    })()
    return () => { active = false }
  }, [league?.id])

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
          <SignupForm players={players} weekKey={currentWeekKey} week={currentWeek} onSignedUp={refresh} />
        ) : (
          <AdminView players={players} weeks={weeks} onRefresh={refresh} />
        )}
      </main>

      <footer>
        
      </footer>
    </div>
  )
}
