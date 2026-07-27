import React, { useState, useEffect, useCallback } from 'react'
import { useLeague } from './contexts/LeagueContext'
import { initializeStorage, refreshFromBackend, getPlayers, getWeeks, getCurrentWeekKey, getWeek, setCurrentLeague, ensureCurrentWeekExists } from './storage'
import SignupForm from './SignupForm'
import AdminView from './AdminView'
import LeaguePasswordGate from './LeaguePasswordGate'
import signupIntroVideo from '../Golf League Sign Up Feature Demo.mp4'

export default function App() {
  const league = useLeague()
  const [view, setView]       = useState('player') // 'player' | 'admin'
  const [players, setPlayers] = useState({})
  const [weeks, setWeeks]     = useState({})
  const [currentWeekKey, setCurrentWeekKey] = useState(null)
  const [currentWeek, setCurrentWeek] = useState(null)
  const [ready, setReady]     = useState(false)
  const [passwordVerified, setPasswordVerified] = useState(false)

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
            {league?.description && (
              <>
                <div className="league-description">
                  {league.description.split(';').map((line, i) => (
                    <p key={i} className="muted">{line.trim()}</p>
                  ))}
                </div>
                <hr className="league-divider" />
              </>
            )}
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
        <section className="intro-video-card" aria-labelledby="intro-video-heading">
          <div className="intro-video-copy">
            <h2 id="intro-video-heading">New Here? Watch a Quick Intro</h2>
            <p className="muted">
              This short walkthrough covers player signup, adding friends, hole management,
              and admin tools so new users can get started quickly.
            </p>
          </div>
          <video className="intro-video" controls preload="metadata">
            <source src={signupIntroVideo} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </section>

        {league?.requires_password && !passwordVerified ? (
          <LeaguePasswordGate onUnlock={() => setPasswordVerified(true)} />
        ) : view === 'player' ? (
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
