import React, { useState, useRef, useEffect } from 'react'
import {
  addSignupToWeek,
  getCurrentWeekKey,
  getWeek,
  removePlayerFromHole,
  movePlayerBetweenHoles,
  weekKeyToLabel,
  weekKeyToRoundDateLabel,
  isFullName,
  HOLE_COUNT,
  HOLE_CAPACITY,
  B_GROUP_THRESHOLD,
} from './storage'

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

/** Returns the display label for a hole card / dropdown option. */
function holeLabel(holeKey, bGroupsUnlocked) {
  if (holeKey.endsWith('B')) return `Hole ${holeKey}`
  return bGroupsUnlocked ? `Hole ${holeKey}A` : `Hole ${holeKey}`
}

/**
 * Text input with an in-field dropdown that suggests matching players from
 * the player history table.
 *
 * Props:
 *   value        — controlled string value
 *   onChange     — (newValue: string) => void
 *   onSelect     — ({ name, email }) => void  called when user picks a suggestion
 *   suggestions  — array of { name, email } from player history
 *   placeholder  — input placeholder text
 *   inputClass   — optional extra className for the <input>
 *   required     — forwarded to <input>
 */
function PlayerAutocomplete({ value, onChange, onSelect, suggestions, placeholder, inputClass, required }) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const wrapRef = useRef(null)

  const filtered = value.trim().length > 0
    ? suggestions.filter(s =>
        (s?.name || '').toLowerCase().includes(value.trim().toLowerCase())
      )
    : []

  // Close dropdown when clicking outside
  useEffect(() => {
    function onPointerDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  function handleInputChange(e) {
    onChange(e.target.value)
    setOpen(true)
    setActiveIndex(-1)
  }

  function handleKeyDown(e) {
    if (!open || filtered.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      pick(filtered[activeIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  function pick(suggestion) {
    onSelect(suggestion)
    setOpen(false)
    setActiveIndex(-1)
  }

  return (
    <div className="ac-wrap" ref={wrapRef}>
      <input
        className={inputClass}
        placeholder={placeholder}
        value={value}
        onChange={handleInputChange}
        onFocus={() => { if (filtered.length > 0) setOpen(true) }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        required={required}
      />
      {open && filtered.length > 0 && (
        <ul className="ac-dropdown" role="listbox">
          {filtered.map((s, i) => (
            <li
              key={s.email}
              className={`ac-option${i === activeIndex ? ' ac-option--active' : ''}`}
              role="option"
              aria-selected={i === activeIndex}
              // onPointerDown + preventDefault keeps the input focused so the
              // blur event doesn't close the dropdown before the selection fires
              onPointerDown={e => { e.preventDefault(); pick(s) }}
            >
              <span className="ac-option-name">{s.name}</span>
              <span className="ac-option-email">{s.email}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function SignupForm({ players, onSignedUp }) {
  const [name, setName]   = useState('')
  const [email, setEmail] = useState('')
  const [hole, setHole] = useState('AUTO')
  const [additionalPlayers, setAdditionalPlayers] = useState(['', '', ''])
  const [additionalCount, setAdditionalCount] = useState(0)
  const [msg, setMsg]     = useState(null)
  const [popup, setPopup] = useState(null)
  const [, forceUpdate]   = useState(0)

  // Async state for current week
  const [weekKey, setWeekKey] = useState(null)
  const [week, setWeek] = useState(null)
  const [loading, setLoading] = useState(true)

  // Fetch current week on mount and periodically
  useEffect(() => {
    async function loadWeek() {
      try {
        setLoading(true)
        const key = await getCurrentWeekKey()
        setWeekKey(key)
        if (key) {
          const w = await getWeek(key)
          setWeek(w)
        } else {
          setWeek(null)
        }
      } catch (err) {
        console.error('Error loading week:', err)
        setWeekKey(null)
        setWeek(null)
      } finally {
        setLoading(false)
      }
    }
    loadWeek()
  }, [])

  // Sorted list of known players for autocomplete suggestions
  const playerSuggestions = Object.values(players || {})
    .map(p => ({ name: p?.name || p?.email || '', email: p?.email || '' }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  // Derived state from week data
  const isClosed   = !weekKey || (week && week.closedAt)
  const roundDateLabel = weekKey ? weekKeyToRoundDateLabel(weekKey) : null
  const holeKeys = Array.from({ length: HOLE_COUNT }, (_, i) => String(i + 1))
  const bHoleKeys = Array.from({ length: HOLE_COUNT }, (_, i) => `${i + 1}B`)
  const bUnlocked = false // With Supabase, b_groups_unlocked is managed separately
  // Note: holes data is now fetched from Supabase and would come via different mechanism
  const holes = Object.fromEntries(holeKeys.concat(bHoleKeys).map(k => [k, []]))
  const totalAPlayers = holeKeys.reduce((sum, k) => sum + (holes[k]?.length ?? 0), 0)
  const totalBPlayers = bHoleKeys.reduce((sum, k) => sum + (holes[k]?.length ?? 0), 0)
  const totalAllPlayers = totalAPlayers + totalBPlayers
  const bUnlockRemaining = Math.max(0, B_GROUP_THRESHOLD - totalAPlayers)

  function showError(title, message, hint) {
    setPopup({ title, message, hint: hint || null })
  }

  async function handleSubmit(e) {
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

    const activePlayers = additionalPlayers.slice(0, additionalCount).map(p => p.trim()).filter(Boolean)

    // Check for duplicate names among additional players and vs. the primary
    const primaryNorm = name.trim().toLowerCase().replace(/\s+/g, ' ')
    const seenNames = new Set([primaryNorm])
    for (let i = 0; i < activePlayers.length; i++) {
      const p = activePlayers[i]
      if (!isFullName(p)) {
        showError(
          'Full Name Required',
          `Additional Player ${i + 1} — "${p}" doesn't look like a full name.`,
          'Each additional player must have a first and last name (e.g., "John Smith").',
        )
        return
      }
      const norm = p.toLowerCase().replace(/\s+/g, ' ')
      if (seenNames.has(norm)) {
        const isDup = norm === primaryNorm
          ? `"${p}" is the same as the primary player name.`
          : `"${p}" appears more than once in the additional players list.`
        showError(
          'Duplicate Player Name',
          `Additional Player ${i + 1} — ${isDup}`,
          'Each player in the group must have a unique name.',
        )
        return
      }
      seenNames.add(norm)
    }

    const result = await addSignupToWeek({
      name,
      email,
      hole,
      additionalPlayers: additionalPlayers.slice(0, additionalCount),
    })
    if (result.ok) {
      setMsg({ type: 'success', text: `Thanks, ${name.trim()}! You're signed up.` })
      setName('')
      setEmail('')
      setHole('AUTO')
      setAdditionalPlayers(['', '', ''])
      setAdditionalCount(0)
      if (onSignedUp) await onSignedUp()
    } else {
      // Map storage reasons to user-friendly titles and hints
      const reason = result.reason || 'Something went wrong. Please try again.'
      let title = 'Cannot Complete Signup'
      let hint = null

      if (reason.includes("already signed up")) {
        title = 'Already Signed Up'
        hint = 'You can only sign up once per week. If you need to change your hole or group, contact an administrator.'
      } else if (reason.includes("Group B holes are not yet available")) {
        title = 'Group B Not Available'
        hint = `Group B holes unlock once ${B_GROUP_THRESHOLD} players have signed up. Please choose a Group A hole.`
      } else if (reason.includes("does not have enough space")) {
        title = 'Hole Full'
        hint = 'Choose a different hole with available space, or reduce the number of additional players in your group.'
      } else if (reason.includes("already signed up as a guest")) {
        title = 'Duplicate Player Detected'
        hint = 'You can use the drag-and-drop feature on the hole cards below to move or reassign players manually.'
      } else if (reason.includes("is already signed up on Hole")) {
        title = 'Duplicate Additional Player'
        hint = 'Remove that person from your additional players list — they are already signed up on another hole and need to be managed there.'
      } else if (reason.includes("automatic assignment")) {
        title = 'Auto Assignment Unavailable'
        hint = 'Choose a specific hole from the list and try again.'
      } else if (reason.includes("first and last name")) {
        title = 'Full Name Required'
        hint = 'Enter both first and last names for every player (e.g., "Jane Smith").'
      } else if (reason.includes("closed") || reason.includes("not found")) {
        title = 'Signups Unavailable'
        hint = 'Signups are currently locked by an administrator. Please check back later.'
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

  async function handleRemove(holeKey, player) {
    if (!weekKey) return
    if (!confirm(`Remove ${player.name} from Hole ${holeKey}?`)) return
    const result = await removePlayerFromHole({ weekKey, hole: holeKey, playerId: player.id })
    if (result.ok) {
      setMsg({ type: 'success', text: `${player.name} was removed.` })
      if (onSignedUp) await onSignedUp()
      forceUpdate(n => n + 1)
    } else {
      showError('Could Not Remove Player', result.reason, 'Try refreshing the page. If the problem persists, contact an administrator.')
    }
  }

  function handleDragStart(e, holeKey, playerId) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ holeKey, playerId }))
  }

  async function handleDrop(e, toHole) {
    e.preventDefault()
    if (!weekKey) return
    try {
      const raw = e.dataTransfer.getData('text/plain')
      const data = JSON.parse(raw)
      const result = await movePlayerBetweenHoles({
        weekKey,
        fromHole: data.holeKey,
        toHole,
        playerId: data.playerId,
      })
      if (result.ok) {
        if (onSignedUp) await onSignedUp()
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
      {loading ? (
        <div className="closed-notice">
          <p className="week-closed-notice">⏳ Loading signup information...</p>
        </div>
      ) : isClosed ? (
        <div className="closed-notice">
          <p className="week-closed-notice">🔒 Signups are currently closed.</p>
          <p className="reopen-notice">An administrator must unlock signups before players can register.</p>
        </div>
      ) : (
        <>
          <p className="week-open-notice">
            Signing up for <strong>{weekKeyToLabel(weekKey)}</strong>
            {roundDateLabel ? <> ({roundDateLabel})</> : null}
          </p>
          <form onSubmit={handleSubmit} className="signup-form">
            <div className="form">
              <PlayerAutocomplete
                placeholder="First Last (e.g., Jane Smith)"
                value={name}
                onChange={v => { setName(v); setMsg(null) }}
                onSelect={s => { setName(s.name); setEmail(s.email); setMsg(null) }}
                suggestions={playerSuggestions}
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
                <option value="AUTO">
                  Automatic Assignment
                </option>
                <optgroup label="Group A">
                  {holeKeys.map(holeKey => (
                    <option key={holeKey} value={holeKey}>
                      {holeLabel(holeKey, bUnlocked)}
                    </option>
                  ))}
                </optgroup>
                {bUnlocked && (
                  <optgroup label="Group B">
                    {bHoleKeys.map(holeKey => (
                      <option key={holeKey} value={holeKey}>
                        Hole {holeKey}
                      </option>
                    ))}
                  </optgroup>
                )}
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
                  <PlayerAutocomplete
                    placeholder={`Additional Player ${i + 1} (First Last)`}
                    value={additionalPlayers[i]}
                    onChange={v => updateAdditionalPlayer(i, v)}
                    onSelect={s => updateAdditionalPlayer(i, s.name)}
                    suggestions={playerSuggestions}
                    inputClass="ac-additional"
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
            <div className="signup-submit-row">
              <button type="submit">Sign Up</button>
              <span className="signup-player-count">{totalAllPlayers} player{totalAllPlayers !== 1 ? 's' : ''} signed up</span>
            </div>
          </form>
          <div className="holes-grid">
            {holeKeys.map(holeKey => (
              <div
                key={holeKey}
                className={`hole-card${(holes[holeKey] || []).length >= HOLE_CAPACITY ? ' hole-card--full' : ''}`}
                onDragOver={e => e.preventDefault()}
                onDrop={e => handleDrop(e, holeKey)}
              >
                <h3>{holeLabel(holeKey, bUnlocked)}</h3>
                <p className="hole-count">{(holes[holeKey] || []).length}/{HOLE_CAPACITY}</p>
                {(holes[holeKey] || []).length === 0 ? (
                  <p className="empty">No players.</p>
                ) : (
                  <ul className="hole-player-list">
                    {(holes[holeKey] || []).map(player => (
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
          {!bUnlocked && week && bUnlockRemaining > 0 && (
            <p className="b-group-notice">
              Group B holes unlock when {bUnlockRemaining} more player{bUnlockRemaining !== 1 ? 's' : ''} sign up ({totalAPlayers}/{B_GROUP_THRESHOLD}).
            </p>
          )}
          {bUnlocked && (
            <>
              <h3 className="b-group-heading">Group B</h3>
              <div className="holes-grid">
                {bHoleKeys.map(holeKey => (
                  <div
                    key={holeKey}
                    className={`hole-card hole-card--b-group${(holes[holeKey] || []).length >= HOLE_CAPACITY ? ' hole-card--full' : ''}`}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handleDrop(e, holeKey)}
                  >
                    <h3>Hole {holeKey}</h3>
                    <p className="hole-count">{(holes[holeKey] || []).length}/{HOLE_CAPACITY}</p>
                    {(holes[holeKey] || []).length === 0 ? (
                      <p className="empty">No players.</p>
                    ) : (
                      <ul className="hole-player-list">
                        {(holes[holeKey] || []).map(player => (
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
        </>
      )}
      {msg && <p className={`form-msg form-msg--${msg.type}`}>{msg.text}</p>}
    </section>
  )
}
