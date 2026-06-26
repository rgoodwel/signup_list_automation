import React, { useState, useEffect } from 'react'
import {
  addSignupToWeek,
  getCurrentWeekKey,
  getWeek,
  removePlayerFromHole,
  movePlayerBetweenHoles,
  weekKeyToLabel,
  isInSignupWindow,
  getNextWindowOpenDate,
  autoOpenWeekIfNeeded,
  HOLE_COUNT,
  HOLE_CAPACITY,
} from './storage'

function formatReopenTime(date) {
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export default function SignupForm({ onSignedUp }) {
  const [name, setName]   = useState('')
  const [email, setEmail] = useState('')
  const [hole, setHole] = useState('1')
  const [additionalPlayers, setAdditionalPlayers] = useState(['', '', ''])
  const [msg, setMsg]     = useState(null) // { type: 'success'|'error', text }
  const [, forceUpdate]   = useState(0)    // used to re-check window on interval

  // Auto-open the week when the window is active; re-check every minute
  useEffect(() => {
    autoOpenWeekIfNeeded()
    const id = setInterval(() => {
      autoOpenWeekIfNeeded()
      forceUpdate(n => n + 1)
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  const windowOpen = isInSignupWindow()
  const weekKey    = getCurrentWeekKey()
  const week       = weekKey ? getWeek(weekKey) : null
  const isClosed   = !windowOpen || !weekKey || (week && week.closedAt)
  const reopenDate = isClosed ? getNextWindowOpenDate() : null
  const holeKeys = Array.from({ length: HOLE_COUNT }, (_, i) => String(i + 1))
  const holes = week?.holes || Object.fromEntries(holeKeys.map(k => [k, []]))

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
    const result = addSignupToWeek({ name, email, hole, additionalPlayers })
    if (result.ok) {
      setMsg({ type: 'success', text: `Thanks, ${name.trim()}! You're signed up.` })
      setName('')
      setEmail('')
      setAdditionalPlayers(['', '', ''])
      if (onSignedUp) onSignedUp()
    } else {
      setMsg({ type: 'error', text: result.reason })
    }
  }

  function updateAdditionalPlayer(index, value) {
    setAdditionalPlayers(prev => {
      const next = [...prev]
      next[index] = value
      return next
    })
    setMsg(null)
  }

  function handleRemove(holeKey, player) {
    if (!weekKey) return
    if (!confirm(`Remove ${player.name} from Hole ${holeKey}?`)) return
    const result = removePlayerFromHole({ weekKey, hole: holeKey, playerId: player.id })
    if (result.ok) {
      setMsg({ type: 'success', text: `${player.name} was removed.` })
      if (onSignedUp) onSignedUp()
      forceUpdate(n => n + 1)
    } else {
      setMsg({ type: 'error', text: result.reason })
    }
  }

  function handleDragStart(e, holeKey, playerId) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ holeKey, playerId }))
  }

  function handleDrop(e, toHole) {
    e.preventDefault()
    if (!weekKey) return
    try {
      const raw = e.dataTransfer.getData('text/plain')
      const data = JSON.parse(raw)
      const result = movePlayerBetweenHoles({
        weekKey,
        fromHole: data.holeKey,
        toHole,
        playerId: data.playerId,
      })
      if (result.ok) {
        if (onSignedUp) onSignedUp()
        forceUpdate(n => n + 1)
      } else {
        setMsg({ type: 'error', text: result.reason })
      }
    } catch {
      setMsg({ type: 'error', text: 'Could not move player.' })
    }
  }

  return (
    <section>
      {isClosed ? (
        <div className="closed-notice">
          <p className="week-closed-notice">🔒 Signups are currently closed.</p>
          {reopenDate && (
            <p className="reopen-notice">
              Signups open <strong>{formatReopenTime(reopenDate)}</strong>
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="week-open-notice">
            Signing up for <strong>{weekKeyToLabel(weekKey)}</strong>
          </p>
          <form onSubmit={handleSubmit} className="form">
            <input
              placeholder="Name"
              value={name}
              onChange={e => { setName(e.target.value); setMsg(null) }}
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => { setEmail(e.target.value); setMsg(null) }}
              required
            />
            <select
              value={hole}
              onChange={e => { setHole(e.target.value); setMsg(null) }}
              required
            >
              {holeKeys.map(holeKey => (
                <option key={holeKey} value={holeKey}>
                  Hole {holeKey} ({holes[holeKey].length}/{HOLE_CAPACITY})
                </option>
              ))}
            </select>
            {additionalPlayers.map((playerName, i) => (
              <input
                key={i}
                placeholder={`Additional Player ${i + 1} (optional)`}
                value={playerName}
                onChange={e => updateAdditionalPlayer(i, e.target.value)}
              />
            ))}
            <button type="submit">Sign Up</button>
          </form>
          <div className="holes-grid">
            {holeKeys.map(holeKey => (
              <div
                key={holeKey}
                className={`hole-card${holes[holeKey].length >= HOLE_CAPACITY ? ' hole-card--full' : ''}`}
                onDragOver={e => e.preventDefault()}
                onDrop={e => handleDrop(e, holeKey)}
              >
                <h3>Hole {holeKey}</h3>
                <p className="hole-count">{holes[holeKey].length}/{HOLE_CAPACITY}</p>
                {holes[holeKey].length === 0 ? (
                  <p className="empty">No players.</p>
                ) : (
                  <ul className="hole-player-list">
                    {holes[holeKey].map(player => (
                      <li
                        key={player.id}
                        className="hole-player"
                        draggable
                        onDragStart={e => handleDragStart(e, holeKey, player.id)}
                      >
                        <span>{player.name}{player.isPrimary ? '' : ' (guest)'}</span>
                        <button
                          type="button"
                          className="btn-remove-player"
                          onClick={() => handleRemove(holeKey, player)}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {msg && <p className={`form-msg form-msg--${msg.type}`}>{msg.text}</p>}
    </section>
  )
}
