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
  isFullName,
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

/**
 * Centered modal popup used for all error/warning messages.
 * `popup` — { title, message, hint? } | null
 */
function AlertModal({ popup, onClose }) {
  if (!popup) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <p className="modal-title">⚠️ {popup.title}</p>
        <div className="modal-body">
          <p style={{ margin: 0 }}>{popup.message}</p>
          {popup.hint && <p className="modal-hint">{popup.hint}</p>}
        </div>
        <div className="modal-actions">
          <button className="modal-dismiss" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  )
}

export default function SignupForm({ onSignedUp }) {
  const [name, setName]   = useState('')
  const [email, setEmail] = useState('')
  const [hole, setHole] = useState('1')
  const [additionalPlayers, setAdditionalPlayers] = useState(['', '', ''])
  const [additionalCount, setAdditionalCount] = useState(0)
  const [msg, setMsg]     = useState(null) // { type: 'success'|'error', text } — success banner only
  const [popup, setPopup] = useState(null) // { title, message, hint? } — error modal
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

  function showError(title, message, hint) {
    setPopup({ title, message, hint: hint || null })
  }

  function handleSubmit(e) {
    e.preventDefault()

    if (!name.trim() || !email.trim()) {
      showError(
        'Missing Information',
        'Please fill in both your full name and email address before signing up.',
        'Your name must be at least a first and last name (e.g., "Jane Smith").',
      )
      return
    }

    // Client-side full-name validation
    if (!isFullName(name)) {
      showError(
        'Full Name Required',
        `"${name.trim()}" doesn't look like a full name.`,
        'Please enter both your first and last name (e.g., "Jane Smith").',
      )
      return
    }
    for (let i = 0; i < additionalCount; i++) {
      const p = additionalPlayers[i].trim()
      if (p && !isFullName(p)) {
        showError(
          'Full Name Required',
          `Additional Player ${i + 1} — "${p}" doesn't look like a full name.`,
          'Each additional player must have a first and last name (e.g., "John Smith").',
        )
        return
      }
    }

    const result = addSignupToWeek({
      name,
      email,
      hole,
      additionalPlayers: additionalPlayers.slice(0, additionalCount),
    })
    if (result.ok) {
      setMsg({ type: 'success', text: `Thanks, ${name.trim()}! You're signed up.` })
      setName('')
      setEmail('')
      setAdditionalPlayers(['', '', ''])
      setAdditionalCount(0)
      if (onSignedUp) onSignedUp()
    } else {
      // Map storage reasons to user-friendly titles and hints
      const reason = result.reason || 'Something went wrong. Please try again.'
      let title = 'Cannot Complete Signup'
      let hint = null

      if (reason.includes("already signed up")) {
        title = 'Already Signed Up'
        hint = 'You can only sign up once per week. If you need to change your hole or group, contact an administrator.'
      } else if (reason.includes("does not have enough space")) {
        title = 'Hole Full'
        hint = 'Choose a different hole with available space, or reduce the number of additional players in your group.'
      } else if (reason.includes("already signed up as a guest")) {
        title = 'Duplicate Player Detected'
        hint = 'You can use the drag-and-drop feature on the hole cards below to move or reassign players manually.'
      } else if (reason.includes("is already signed up on Hole")) {
        title = 'Duplicate Additional Player'
        hint = 'Remove that person from your additional players list — they are already signed up on another hole and need to be managed there.'
      } else if (reason.includes("first and last name")) {
        title = 'Full Name Required'
        hint = 'Enter both first and last names for every player (e.g., "Jane Smith").'
      } else if (reason.includes("closed") || reason.includes("not found")) {
        title = 'Signups Unavailable'
        hint = 'Signups are only open Tuesday 3 PM – Sunday 3 PM Eastern. Please check back during that window.'
      }

      showError(title, reason, hint)
    }
  }

  function updateAdditionalPlayer(index, value) {
    setAdditionalPlayers(prev => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  function addAdditionalPlayerField() {
    setAdditionalCount(count => Math.min(3, count + 1))
  }

  function removeAdditionalPlayerField(index) {
    setAdditionalPlayers(prev => {
      const next = [...prev]
      next[index] = ''
      return next
    })
    setAdditionalCount(count => Math.max(0, count - 1))
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
      showError('Could Not Remove Player', result.reason, 'Try refreshing the page. If the problem persists, contact an administrator.')
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
        showError(
          'Cannot Move Player',
          result.reason,
          result.reason.includes('full')
            ? 'Try moving the player to a hole that has an open spot.'
            : 'Try refreshing the page and moving again.',
        )
      }
    } catch {
      showError('Cannot Move Player', 'An unexpected error occurred while moving the player.', 'Try refreshing the page and dragging again.')
    }
  }

  return (
    <section>
      <AlertModal popup={popup} onClose={() => setPopup(null)} />
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
          <form onSubmit={handleSubmit} className="signup-form">
            <div className="form">
              <input
                placeholder="First Last (e.g., Jane Smith)"
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
            </div>

            <div className="additional-player-block">
              <div className="additional-player-header">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={addAdditionalPlayerField}
                  disabled={additionalCount >= 3}
                >
                  Add Additional Player
                </button>
                <p className="muted">Optional grouped players</p>
              </div>
              {Array.from({ length: additionalCount }, (_, i) => (
                <div key={i} className="additional-player-row">
                  <input
                    placeholder={`Additional Player ${i + 1} (First Last)`}
                    value={additionalPlayers[i]}
                    onChange={e => updateAdditionalPlayer(i, e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-remove-player"
                    onClick={() => removeAdditionalPlayerField(i)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
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
