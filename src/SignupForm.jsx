import React, { useState, useRef, useEffect } from 'react'
import { useLeague } from './contexts/LeagueContext'
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
import { supabase } from './utils/supabaseClient'
import moveIcon from './utils/move_icon.png'

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

/**
 * Removal confirmation modal with danger styling.
 * Shows player name and hole, with Cancel/Remove buttons.
 */
function RemovalConfirmationModal({ removal, onConfirm, onCancel }) {
  if (!removal) return null
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <p className="modal-title">🗑️ Remove Player?</p>
        <div className="modal-body">
          <p style={{ margin: 0 }}>
            Remove <strong>{removal.playerName}</strong> from <strong>{removal.holeKey}</strong>?
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
            This action cannot be undone.
          </p>
        </div>
        <div className="modal-actions" style={{ gap: '8px' }}>
          <button className="modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="modal-confirm-danger" onClick={onConfirm}>Remove</button>
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
  const league = useLeague()
  const [name, setName]   = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [hole, setHole] = useState('AUTO')
  const [additionalPlayers, setAdditionalPlayers] = useState([
    { name: '', email: '', phone: '' },
    { name: '', email: '', phone: '' },
    { name: '', email: '', phone: '' },
  ])
  const [additionalCount, setAdditionalCount] = useState(0)
  const [msg, setMsg]     = useState(null)
  const [popup, setPopup] = useState(null)
  const [removal, setRemoval] = useState(null)
  const [bulkMove, setBulkMove] = useState(null) // { sourceHole, players, selectedPlayerIds }

  // Async state for current week
  const [weekKey, setWeekKey] = useState(null)
  const [week, setWeek] = useState(null)
  const [loading, setLoading] = useState(true)
  const [holes, setHoles] = useState({})

  // Define hole keys early so they can be used in useEffect
  const holeKeys = Array.from({ length: HOLE_COUNT }, (_, i) => String(i + 1))
  const bHoleKeys = Array.from({ length: HOLE_COUNT }, (_, i) => `${i + 1}B`)

  // Fetch current week and populate holes display
  // Only run after league context is available (league?.id)
  useEffect(() => {
    // Wait for league to be loaded before fetching data
    if (!league?.id) return
    
    async function loadWeek() {
      try {
        setLoading(true)
        const key = await getCurrentWeekKey()
        setWeekKey(key)
        if (key) {
          const w = await getWeek(key)
          setWeek(w)
          
          // Fetch players and populate holes display
          const { data: weeklyPlayers, error } = await supabase
            .from('weekly_players')
            .select('id, player_name, player_email, hole_number, hole_group, is_guest')
            .eq('league_id', league.id)
            .eq('week_number', key)
          
          if (!error && weeklyPlayers) {
            const holesMap = Object.fromEntries(
              holeKeys.concat(bHoleKeys).map(k => [k, []])
            )
            // Group players by hole
            for (const row of weeklyPlayers) {
              const holeKey = row.hole_group === 'B' ? `${row.hole_number}B` : row.hole_number
              if (holesMap[holeKey]) {
                holesMap[holeKey].push({
                  id: row.id,
                  name: row.player_name,
                  email: row.player_email,
                  isPrimary: !row.is_guest,
                })
              }
            }
            setHoles(holesMap)
          }
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
  }, [league?.id, holeKeys, bHoleKeys])

  // Real-time subscription to weekly_players changes
  useEffect(() => {
    if (!weekKey || !league?.id) return
    
    const channel = supabase
      .channel(`weekly_players:${weekKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'weekly_players',
          filter: `and(week_number=eq.${weekKey},league_id=eq.${league.id})`,
        },
        async (payload) => {
          // Reload holes on any change (INSERT, UPDATE, DELETE)
          await reloadHoles()
        }
      )
      .subscribe()
    
    return () => {
      channel.unsubscribe()
    }
  }, [weekKey, league?.id])

  // Sorted list of known players for autocomplete suggestions
  const playerSuggestions = Object.values(players || {})
    .map(p => ({ name: p?.name || p?.email || '', email: p?.email || '' }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  // Derived state from week data
  const isWeekLocked   = weekKey && week && week.closed_at
  const isWeekFinalized = !weekKey  // No current week means it was finalized
  const roundDateLabel = weekKey ? weekKeyToRoundDateLabel(weekKey) : null
  const bUnlocked = week?.b_groups_unlocked || false
  const totalAPlayers = holeKeys.reduce((sum, k) => sum + (holes[k]?.length ?? 0), 0)
  const totalBPlayers = bHoleKeys.reduce((sum, k) => sum + (holes[k]?.length ?? 0), 0)
  const totalAllPlayers = totalAPlayers + totalBPlayers
  const bUnlockRemaining = Math.max(0, B_GROUP_THRESHOLD - totalAPlayers)

  // Derived values for bulk move modal — recomputed every render so checkboxes update the list instantly
  const bulkSelectedCount = bulkMove?.selectedPlayerIds.size ?? 0
  const bulkCandidateHoles = bulkMove
    ? [...holeKeys, ...(bUnlocked ? bHoleKeys : [])].filter(h => h !== bulkMove.sourceHole)
    : []
  const bulkAvailableHoles = bulkCandidateHoles.filter(
    h => (holes[h] || []).length + bulkSelectedCount <= HOLE_CAPACITY
  )
  const bulkUnavailableCount = bulkCandidateHoles.length - bulkAvailableHoles.length

  function showError(title, message, hint) {
    setPopup({ title, message, hint: hint || null })
  }

  /**
   * Get available spots in a hole (just the remaining capacity)
   */
  function getAvailableSpots(holeKey) {
    const currentPlayers = holes[holeKey]?.length ?? 0
    const capacity = HOLE_CAPACITY
    return Math.max(0, capacity - currentPlayers)
  }

  /** Check if a hole has enough space for the full group */
  function canFitGroup(holeKey) {
    const currentPlayers = holes[holeKey]?.length ?? 0
    const groupSize = 1 + additionalCount
    const capacity = HOLE_CAPACITY
    return currentPlayers + groupSize <= capacity
  }

  async function reloadHoles() {
    try {
      if (!weekKey || !league?.id) return
      const { data: weeklyPlayers, error } = await supabase
        .from('weekly_players')
        .select('id, player_name, player_email, hole_number, hole_group')
        .eq('league_id', league.id)
        .eq('week_number', weekKey)
      
      if (!error && weeklyPlayers) {
        const holesMap = Object.fromEntries(
          holeKeys.concat(bHoleKeys).map(k => [k, []])
        )
        for (const row of weeklyPlayers) {
          const holeKey = row.hole_group === 'B' ? `${row.hole_number}B` : row.hole_number
          if (holesMap[holeKey]) {
            holesMap[holeKey].push({
              id: row.id,
              name: row.player_name,
              email: row.player_email,
            })
          }
        }
        setHoles(holesMap)
      }
    } catch (err) {
      console.error('Error reloading holes:', err)
    }
  }

  // Format phone number as (XXX) XXX-XXXX as user types
  function formatPhoneNumber(value) {
    const digits = value.replace(/\D/g, '').slice(0, 10)
    if (digits.length === 0) return ''
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }

  // Validate phone number is 10 digits
  function isValidPhoneNumber(phoneStr) {
    const digits = phoneStr.replace(/\D/g, '')
    return digits.length === 10
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!name.trim() || !email.trim() || !phone.trim()) {
      showError(
        'Missing Information',
        'Please fill in your name, email address, and phone number before signing up.',
        'Your name must be at least a first and last name (e.g., "Jane Smith").',
      )
      return
    }

    // Validate phone number
    if (!isValidPhoneNumber(phone)) {
      showError(
        'Invalid Phone Number',
        'Please enter a valid 10-digit phone number.',
        'Phone number should be in the format (123) 456-7890 or 1234567890.',
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

    const activePlayers = additionalPlayers.slice(0, additionalCount).filter(p => p.name.trim())

    // Validate each additional player
    for (let i = 0; i < activePlayers.length; i++) {
      const p = activePlayers[i]
      
      if (!p.name.trim()) {
        showError(
          'Missing Information',
          `Additional Player ${i + 1} — Name is required.`,
          'Each additional player must have a name.',
        )
        return
      }
      
      if (!p.email.trim()) {
        showError(
          'Missing Information',
          `Additional Player ${i + 1} — Email is required.`,
          'Each additional player must have an email address.',
        )
        return
      }
      
      if (!p.phone.trim()) {
        showError(
          'Missing Information',
          `Additional Player ${i + 1} — Phone number is required.`,
          'Each additional player must have a phone number.',
        )
        return
      }
      
      if (!isFullName(p.name)) {
        showError(
          'Full Name Required',
          `Additional Player ${i + 1} — "${p.name}" doesn't look like a full name.`,
          'Each additional player must have a first and last name (e.g., "John Smith").',
        )
        return
      }
      
      if (!isValidPhoneNumber(p.phone)) {
        showError(
          'Invalid Phone Number',
          `Additional Player ${i + 1} — Please enter a valid 10-digit phone number.`,
          'Phone number should be in the format (123) 456-7890 or 1234567890.',
        )
        return
      }

      // Check for duplicate names among additional players and vs. the primary
      const primaryNorm = name.trim().toLowerCase().replace(/\s+/g, ' ')
      const norm = p.name.toLowerCase().replace(/\s+/g, ' ')
      
      if (norm === primaryNorm) {
        showError(
          'Duplicate Player Name',
          `Additional Player ${i + 1} — "${p.name}" is the same as the primary player name.`,
          'Each player in the group must have a unique name.',
        )
        return
      }
      
      // Check for duplicates within additional players
      const seenNamesInAdditional = new Set(activePlayers.slice(0, i).map(ap => ap.name.toLowerCase().replace(/\s+/g, ' ')))
      if (seenNamesInAdditional.has(norm)) {
        showError(
          'Duplicate Player Name',
          `Additional Player ${i + 1} — "${p.name}" appears more than once in the additional players list.`,
          'Each player in the group must have a unique name.',
        )
        return
      }
    }

    const result = await addSignupToWeek({
      name,
      email,
      phone,
      hole,
      additionalPlayers: additionalPlayers.slice(0, additionalCount),
    })
    if (result.ok) {
      const group = result.holeKey.endsWith('B') ? 'B' : 'A'
      const holeNumber = result.holeKey.replace(/B$/, '')
      const holeDisplay = `Hole ${holeNumber}${group}`
      const withFriends = result.extraCount > 0 ? ` with your friends` : ''
      setMsg({ type: 'success', text: `Thanks, ${name.trim()}! You have been added to ${holeDisplay}${withFriends}.` })
      setName('')
      setEmail('')
      setPhone('')
      setHole('AUTO')
      setAdditionalPlayers([
        { name: '', email: '', phone: '' },
        { name: '', email: '', phone: '' },
        { name: '', email: '', phone: '' },
      ])
      setAdditionalCount(0)
      await reloadHoles()
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

  function updateAdditionalPlayer(index, field, value) {
    setAdditionalPlayers(prev => {
      const next = [...prev]
      if (!next[index]) next[index] = { name: '', email: '', phone: '' }
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  function addAdditionalPlayerField() {
    setAdditionalCount(count => Math.min(3, count + 1))
  }

  function removeAdditionalPlayerField(index) {
    setAdditionalPlayers(prev => {
      const next = [...prev]
      next[index] = { name: '', email: '', phone: '' }
      return next
    })
    setAdditionalCount(count => Math.max(0, count - 1))
  }

  function handleRemove(holeKey, player) {
    if (!weekKey) return
    setRemoval({ playerName: player.name, holeKey, holeId: holeKey, playerId: player.id })
  }

  async function confirmRemove() {
    const { playerName, playerId } = removal
    const holeKey = removal.holeKey
    setRemoval(null)
    
    const result = await removePlayerFromHole({ weekKey, hole: holeKey, playerId })
    if (result.ok) {
      setMsg({ type: 'success', text: `${playerName} was removed.` })
      await reloadHoles()
      if (onSignedUp) await onSignedUp()
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
        // Get player name for success message
        const player = holes[data.holeKey]?.find(p => p.id === data.playerId)
        const playerName = player?.name || 'Player'
        const toHoleLabel = toHole.endsWith('B') ? toHole : `${toHole}A`
        setMsg({ type: 'success', text: `${playerName} was moved to Hole ${toHoleLabel}.` })
        await reloadHoles()
        if (onSignedUp) await onSignedUp()
      } else {
        showError(
          'Cannot Move Player',
          result.reason,
          result.reason.includes('full')
            ? 'Try moving the player to a hole that has an open spot.'
            : 'Try refreshing the page and moving again.',
        )
      }
    } catch (err) {
      console.error('Error moving player:', err)
      showError('Cannot Move Player', 'An unexpected error occurred while moving the player.', 'Try refreshing the page and dragging again.')
    }
  }

  function handleBulkMoveClick(sourceHole) {
    const playersInHole = holes[sourceHole] || []
    if (playersInHole.length === 0) {
      showError('No Players', `Hole ${sourceHole} has no players to move.`)
      return
    }
    // Default: all players selected
    const selectedIds = new Set(playersInHole.map(p => p.id))
    setBulkMove({ sourceHole, players: playersInHole, selectedPlayerIds: selectedIds })
  }

  function togglePlayerSelection(playerId) {
    if (!bulkMove) return
    const newSelected = new Set(bulkMove.selectedPlayerIds)
    if (newSelected.has(playerId)) {
      newSelected.delete(playerId)
    } else {
      newSelected.add(playerId)
    }
    setBulkMove({ ...bulkMove, selectedPlayerIds: newSelected })
  }

  async function handleBulkMoveToHole(destinationHole) {
    if (!bulkMove || !weekKey) return
    const { sourceHole, players, selectedPlayerIds } = bulkMove

    if (selectedPlayerIds.size === 0) {
      showError('No Players Selected', 'Please select at least one player to move.')
      return
    }

    try {
      const playersToMove = players.filter(p => selectedPlayerIds.has(p.id))
      let successCount = 0
      let failureCount = 0

      for (const player of playersToMove) {
        const result = await movePlayerBetweenHoles({
          weekKey,
          fromHole: sourceHole,
          toHole: destinationHole,
          playerId: player.id,
        })
        if (result.ok) {
          successCount++
        } else {
          failureCount++
        }
      }

      setBulkMove(null)
      await reloadHoles()
      if (onSignedUp) await onSignedUp()

      if (failureCount === 0) {
        const destLabel = destinationHole.endsWith('B') ? destinationHole : `${destinationHole}A`
        setMsg({
          type: 'success',
          text: `Moved ${successCount} player${successCount !== 1 ? 's' : ''} from Hole ${sourceHole} to Hole ${destLabel}.`,
        })
      } else {
        showError(
          'Partial Move',
          `Moved ${successCount} player(s), but ${failureCount} failed.`,
          'Some holes may be full. Try moving remaining players individually.',
        )
      }
    } catch (err) {
      console.error('Error in bulk move:', err)
      showError('Bulk Move Failed', 'An error occurred while moving players.', 'Try refreshing the page.')
    }
  }

  return (
    <section>
      <AlertModal popup={popup} onClose={() => setPopup(null)} />
      <RemovalConfirmationModal removal={removal} onConfirm={confirmRemove} onCancel={() => setRemoval(null)} />
      {bulkMove && (
        <div className="modal-overlay" onClick={() => setBulkMove(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <p className="modal-title">🔀 Move Players</p>
            <div className="modal-body">
              <p style={{ margin: '0 0 10px', fontSize: '14px' }}>
                From <strong>Hole {bulkMove.sourceHole}</strong>
              </p>
              <p style={{ margin: '0 0 6px', fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>
                Players to move:
              </p>
              <div className="bulk-move-player-list">
                {bulkMove.players.map(player => (
                  <label key={player.id} className="bulk-move-player-item">
                    <input
                      type="checkbox"
                      checked={bulkMove.selectedPlayerIds.has(player.id)}
                      onChange={() => togglePlayerSelection(player.id)}
                    />
                    <span className="player-name">{player.name}</span>
                  </label>
                ))}
              </div>
              <p style={{ margin: '6px 0 14px', fontSize: '12px', color: 'var(--muted)' }}>
                {bulkSelectedCount} of {bulkMove.players.length} selected
              </p>
              <p style={{ margin: '0 0 6px', fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>
                Move to hole:
              </p>
              <div className="bulk-move-dest-list">
                {bulkAvailableHoles.length === 0 && (
                  <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0 }}>
                    {bulkSelectedCount === 0 ? 'Select at least one player.' : 'No holes have enough space.'}
                  </p>
                )}
                {bulkAvailableHoles.map(destHole => (
                  <button
                    key={destHole}
                    className="btn btn-primary"
                    onClick={() => handleBulkMoveToHole(destHole)}
                    style={{ textAlign: 'left', padding: '8px 12px', fontSize: '13px' }}
                  >
                    Hole {destHole} &nbsp;<span style={{ opacity: .7, fontWeight: 400 }}>({HOLE_CAPACITY - (holes[destHole] || []).length} spots)</span>
                  </button>
                ))}
                {bulkUnavailableCount > 0 && (
                  <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '4px 0 0' }}>
                    {bulkUnavailableCount} hole{bulkUnavailableCount !== 1 ? 's' : ''} can't fit {bulkSelectedCount} player{bulkSelectedCount !== 1 ? 's' : ''}.
                  </p>
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setBulkMove(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {loading ? (
        <div className="closed-notice">
          <p className="week-closed-notice">⏳ Loading signup information...</p>
        </div>
      ) : (
        <>
          {isWeekFinalized ? (
            <div className="closed-notice">
              <p className="week-closed-notice">✅ Previous week signups are closed.</p>
              <p className="reopen-notice">The next week's signups are not yet open. Check back soon!</p>
            </div>
          ) : isWeekLocked ? (
            <div className="closed-notice">
              <p className="week-closed-notice">🔒 Signups are currently locked.</p>
              <p className="reopen-notice">New players cannot register, but you can still move or remove existing players below.</p>
            </div>
          ) : (
            <p className="week-open-notice">
              Signing up for <strong>{weekKeyToLabel(weekKey)}</strong>
              {roundDateLabel ? <> ({roundDateLabel})</> : null}
            </p>
          )}
          {!isWeekLocked && !isWeekFinalized && (
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
              <div className="form-row">
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setMsg(null) }}
                  required
                />
                <input
                  type="tel"
                  placeholder="Phone (10 digits)"
                  value={phone}
                  onChange={e => { setPhone(formatPhoneNumber(e.target.value)); setMsg(null) }}
                  maxLength="14"
                  required
                />
              </div>
              <select
                value={hole}
                onChange={e => { setHole(e.target.value); setMsg(null) }}
                required
              >
                <option value="AUTO">
                  Automatic Assignment
                </option>
                {/* Group A holes with available spots */}
                {holeKeys.some(k => canFitGroup(k)) && (
                  <optgroup label="Group A">
                    {holeKeys
                      .filter(k => canFitGroup(k))
                      .map(holeKey => (
                        <option key={holeKey} value={holeKey}>
                          {holeLabel(holeKey, bUnlocked)} ({getAvailableSpots(holeKey)} spots)
                        </option>
                      ))}
                  </optgroup>
                )}
                {/* Group B holes with available spots (only if unlocked) */}
                {bUnlocked && bHoleKeys.some(k => canFitGroup(k)) && (
                  <optgroup label="Group B">
                    {bHoleKeys
                      .filter(k => canFitGroup(k))
                      .map(holeKey => (
                        <option key={holeKey} value={holeKey}>
                          Hole {holeKey} ({getAvailableSpots(holeKey)} spots)
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
                <div key={i} className="additional-player-block" style={{ marginTop: '12px' }}>
                  <div className="additional-player-header" style={{ marginBottom: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '14px' }}>Additional Player {i + 1}</h4>
                    <button
                      type="button"
                      className="btn-remove-player"
                      onClick={() => removeAdditionalPlayerField(i)}
                      style={{ marginLeft: 'auto' }}
                    >
                      Remove
                    </button>
                  </div>
                  <PlayerAutocomplete
                    placeholder={`First Last (e.g., Jane Smith)`}
                    value={additionalPlayers[i].name}
                    onChange={v => updateAdditionalPlayer(i, 'name', v)}
                    onSelect={s => { 
                      updateAdditionalPlayer(i, 'name', s.name)
                      updateAdditionalPlayer(i, 'email', s.email)
                    }}
                    suggestions={playerSuggestions}
                    inputClass="ac-additional"
                  />
                  <div className="form-row">
                    <input
                      type="email"
                      placeholder="Email"
                      value={additionalPlayers[i].email}
                      onChange={e => updateAdditionalPlayer(i, 'email', e.target.value)}
                    />
                    <input
                      type="tel"
                      placeholder="Phone (10 digits)"
                      value={additionalPlayers[i].phone}
                      onChange={e => updateAdditionalPlayer(i, 'phone', formatPhoneNumber(e.target.value))}
                      maxLength="14"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="signup-submit-row">
              <button type="submit">Sign Up</button>
              <span className="signup-player-count">{totalAllPlayers} player{totalAllPlayers !== 1 ? 's' : ''} signed up</span>
            </div>
          </form>
          )}
          {msg && <p className={`form-msg form-msg--${msg.type}`}>{msg.text}</p>}
          <div className="holes-grid">
            {holeKeys.map(holeKey => (
              <div
                key={holeKey}
                className={`hole-card${(holes[holeKey] || []).length >= HOLE_CAPACITY ? ' hole-card--full' : ''}`}
                onDragOver={e => e.preventDefault()}
                onDrop={e => handleDrop(e, holeKey)}
              >
                <div className="hole-card-header">
                  <h3>{holeLabel(holeKey, bUnlocked)}</h3>
                  {(holes[holeKey] || []).length > 0 && (
                    <button
                      type="button"
                      className="btn-bulk-move"
                      onClick={() => handleBulkMoveClick(holeKey)}
                      title={`Move all ${(holes[holeKey] || []).length} player${(holes[holeKey] || []).length !== 1 ? 's' : ''}`}
                    >
                      <img src={moveIcon} alt="Move" />
                    </button>
                  )}
                </div>
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
                        <span>{player.name}</span>
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
                    <div className="hole-card-header">
                      <h3>Hole {holeKey}</h3>
                      {(holes[holeKey] || []).length > 0 && (
                        <button
                          type="button"
                          className="btn-bulk-move"
                          onClick={() => handleBulkMoveClick(holeKey)}
                          title={`Move all ${(holes[holeKey] || []).length} player${(holes[holeKey] || []).length !== 1 ? 's' : ''}`}
                        >
                          <img src={moveIcon} alt="Move" />
                        </button>
                      )}
                    </div>
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
                            <span>{player.name}</span>
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
    </section>
  )
}
