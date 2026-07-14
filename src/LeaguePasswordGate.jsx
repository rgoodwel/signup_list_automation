import React, { useState } from 'react'
import { useLeague } from './contexts/LeagueContext'

/**
 * Password gate for password-protected leagues
 * Players must enter the correct password before accessing the signup form
 */
export default function LeaguePasswordGate({ onUnlock }) {
  const league = useLeague()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!league?.requires_password) {
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      // Simple password comparison (in production, consider hashing)
      if (password === league.password) {
        onUnlock()
      } else {
        setError('Incorrect password. Please try again.')
        setPassword('')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="password-gate">
      <div className="password-gate-content">
        <h2>Access Required</h2>
        <p className="muted">This league requires a password to access.</p>
        <form onSubmit={handleSubmit} className="password-form">
          <input
            type="password"
            placeholder="Enter league password"
            value={password}
            onChange={e => {
              setPassword(e.target.value)
              setError('')
            }}
            autoFocus
            disabled={isSubmitting}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || !password.trim()}
          >
            {isSubmitting ? 'Verifying...' : 'Access League'}
          </button>
        </form>
        {error && <p className="form-msg form-msg--error">{error}</p>}
      </div>
    </div>
  )
}
