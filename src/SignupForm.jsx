import React, { useState, useEffect } from 'react'
import {
  addSignupToWeek,
  getCurrentWeekKey,
  getWeek,
  weekKeyToLabel,
  isInSignupWindow,
  getNextWindowOpenDate,
  autoOpenWeekIfNeeded,
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

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
    const result = addSignupToWeek({ name, email })
    if (result.ok) {
      setMsg({ type: 'success', text: `Thanks, ${name.trim()}! You're signed up.` })
      setName('')
      setEmail('')
      if (onSignedUp) onSignedUp()
    } else {
      setMsg({ type: 'error', text: result.reason })
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
            <button type="submit">Sign Up</button>
          </form>
        </>
      )}
      {msg && <p className={`form-msg form-msg--${msg.type}`}>{msg.text}</p>}
    </section>
  )
}

