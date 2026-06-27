import React, { useState } from 'react'
import { getAdminPin, setAdminPin } from './storage'
import CurrentWeekPanel from './CurrentWeekPanel'
import PlayerHistoryTable from './PlayerHistoryTable'
import TrendChart from './TrendChart'
import ExportButtons from './ExportButtons'

// ── PIN gate ──────────────────────────────────────────────────────────────────

function PinSetup({ onSet }) {
  const [pin, setPin]     = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr]     = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (pin.length < 6) { setErr('PIN must be at least 6 characters.'); return }
    if (!/[a-zA-Z]/.test(pin) || !/[0-9]/.test(pin)) {
      setErr('PIN must contain at least one letter and one number.')
      return
    }
    if (pin !== confirm) { setErr('PINs do not match.'); return }
    setAdminPin(pin)
    onSet()
  }

  return (
    <div className="pin-gate">
      <h2>Set Admin PIN</h2>
      <p className="muted">Choose a PIN to protect the admin area (min 6 characters, must include a letter and a number).</p>
      <form onSubmit={handleSubmit} className="pin-form">
        <input
          type="password"
          placeholder="New PIN"
          value={pin}
          onChange={e => { setPin(e.target.value); setErr('') }}
          autoFocus
        />
        <input
          type="password"
          placeholder="Confirm PIN"
          value={confirm}
          onChange={e => { setConfirm(e.target.value); setErr('') }}
        />
        <button type="submit" className="btn btn-primary">Set PIN</button>
      </form>
      {err && <p className="form-msg form-msg--error">{err}</p>}
    </div>
  )
}

function PinLogin({ onSuccess }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (pin === getAdminPin()) {
      onSuccess()
    } else {
      setErr('Incorrect PIN.')
      setPin('')
    }
  }

  return (
    <div className="pin-gate">
      <h2>Admin Login</h2>
      <form onSubmit={handleSubmit} className="pin-form">
        <input
          type="password"
          placeholder="Enter PIN"
          value={pin}
          onChange={e => { setPin(e.target.value); setErr('') }}
          autoFocus
        />
        <button type="submit" className="btn btn-primary">Login</button>
      </form>
      {err && <p className="form-msg form-msg--error">{err}</p>}
    </div>
  )
}

// ── Admin tabs ────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'week',    label: 'Current Week' },
  { key: 'history', label: 'Player History' },
  { key: 'trend',   label: 'Trends' },
  { key: 'export',  label: 'Export' },
]

export default function AdminView({ players, weeks, onRefresh }) {
  const savedPin = getAdminPin()
  const [authed, setAuthed]   = useState(false)
  const [tab, setTab]         = useState('week')

  if (!savedPin) {
    return <PinSetup onSet={() => setAuthed(true)} />
  }

  if (!authed) {
    return <PinLogin onSuccess={() => setAuthed(true)} />
  }

  return (
    <div>
      <div className="tab-bar">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`tab-btn${tab === t.key ? ' tab-btn--active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
        <button className="tab-btn tab-btn--logout" onClick={() => setAuthed(false)}>
          Log out
        </button>
      </div>

      {tab === 'week'    && <CurrentWeekPanel onRefresh={onRefresh} />}
      {tab === 'history' && <PlayerHistoryTable players={players} weeks={weeks} />}
      {tab === 'trend'   && <TrendChart players={players} weeks={weeks} />}
      {tab === 'export'  && <ExportButtons players={players} weeks={weeks} />}
    </div>
  )
}
