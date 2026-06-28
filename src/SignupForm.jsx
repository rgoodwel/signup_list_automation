// src/SignupForm.jsx
import React, { useState, useEffect, useRef } from 'react'
import {
  addSignupToWeek,
  getCurrentWeekKey,
  getWeek,
  removePlayerFromHole,
  movePlayerBetweenHoles,
  weekKeyToLabel,
  weekKeyToRoundDateLabel,
  ensureCurrentWeekOpen, // <-- NEW
  isFullName,
  HOLE_COUNT,
  HOLE_CAPACITY,
  B_GROUP_THRESHOLD,
  areBGroupsUnlocked,
} from './storage'

// ...keep your existing PlayerAutocomplete and other helper components unchanged...

export default function SignupForm({ players, onSignedUp }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [hole, setHole] = useState('1')
  const [additionalPlayers, setAdditionalPlayers] = useState([])
  const [additionalCount, setAdditionalCount] = useState(0)
  const [msg, setMsg] = useState(null)
  const [popup, setPopup] = useState(null)
  const [, forceUpdate] = useState(0)
  const initializedRef = useRef(false)

  // NEW: guarantee a usable week exists so page is never "blank/non-actionable"
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    ensureCurrentWeekOpen()
    forceUpdate(n => n + 1)
  }, [])

  const playerSuggestions = Object.values(players || {})
    .map(p => ({ name: p.name, email: p.email }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const weekKey = getCurrentWeekKey()
  const week = weekKey ? getWeek(weekKey) : null

  // IMPORTANT: preserve admin lock semantics if closedAt is set
  const isClosed = !weekKey || (week && week.closedAt)
  const roundDateLabel = weekKey ? weekKeyToRoundDateLabel(weekKey) : null

  const holeKeys = Array.from({ length: HOLE_COUNT }, (_, i) => String(i + 1))
  const bHoleKeys = Array.from({ length: HOLE_COUNT }, (_, i) => `${i + 1}B`)
  const holes = week?.holes || Object.fromEntries(holeKeys.map(k => [k, []]))

  function showError(title, message, hint = '') {
    setPopup({ title, message, hint })
  }

  function closePopup() {
    setPopup(null)
  }

  // keep your existing submit/move/remove handlers; no behavioral change needed
  async function handleSubmit(e) {
    e.preventDefault()
    setMsg(null)

    try {
      if (!isFullName(name)) {
        throw new Error('Primary player must include first and last name.')
      }

      addSignupToWeek(
        weekKey,
        { name: name.trim(), email: email.trim() },
        hole
      )

      for (const p of additionalPlayers) {
        if (p?.name?.trim()) {
          addSignupToWeek(
            weekKey,
            { name: p.name.trim(), email: (p.email || '').trim() },
            hole
          )
        }
      }

      setName('')
      setEmail('')
      setAdditionalPlayers([])
      setAdditionalCount(0)
      setMsg({ type: 'success', text: 'Signup successful.' })
      onSignedUp?.()
      forceUpdate(n => n + 1)
    } catch (err) {
      const reason = err?.message || 'Unable to submit signup.'
      let title = 'Signup Failed'
      let hint = ''
      if (reason.toLowerCase().includes('first and last')) {
        title = 'Name Required'
        hint = 'Enter both first and last names for every player (e.g., "Jane Smith").'
      } else if (reason.includes('closed') || reason.includes('not found')) {
        title = 'Signups Unavailable'
        hint = 'Signups are currently locked by an administrator. Please check back later.'
      }
      showError(title, reason, hint)
    }
  }

  return (
    <div className="card">
      <h2>Player Signup</h2>

      {isClosed ? (
        <div className="closed-notice">
          <p className="week-closed-notice">🔒 Signups are currently closed.</p>
          <p className="reopen-notice">
            An administrator must unlock signups before players can register.
          </p>
        </div>
      ) : (
        <>
          <p className="week-open-notice">
            Signing up for <strong>{weekKeyToLabel(weekKey)}</strong>
            {roundDateLabel ? <> ({roundDateLabel})</> : null}
          </p>

          <form onSubmit={handleSubmit} className="signup-form">
            {/* Keep your existing form fields/autocomplete/additional player UI */}
            {/* Ensure submit button remains visible in your existing markup */}
          </form>
        </>
      )}

      {msg?.type === 'success' ? <p className="ok">{msg.text}</p> : null}

      {popup ? (
        <div className="modal-backdrop" onClick={closePopup}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{popup.title}</h3>
            <p>{popup.message}</p>
            {popup.hint ? <p className="hint">{popup.hint}</p> : null}
            <button className="btn btn-primary" onClick={closePopup}>OK</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}