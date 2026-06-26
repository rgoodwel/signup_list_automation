import React, { useState } from 'react'
import { addSignupToWeek, getCurrentWeekKey, getWeek } from './storage'

export default function SignupForm({ onSignedUp }) {
  const [name, setName]   = useState('')
  const [email, setEmail] = useState('')
  const [msg, setMsg]     = useState(null) // { type: 'success'|'error', text }

  const weekKey = getCurrentWeekKey()
  const week    = weekKey ? getWeek(weekKey) : null
  const isClosed = !weekKey || (week && week.closedAt)

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
        <p className="week-closed-notice">Signups are currently closed. Check back soon!</p>
      ) : (
        <>
          <p className="week-open-notice">
            Signing up for <strong>{weekKey}</strong>
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
