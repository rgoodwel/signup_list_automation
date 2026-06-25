import React, { useState, useEffect } from 'react'

const STORAGE_KEY = 'signup_list_automation.groups_v2'

// Configure admin names here (exact first + last names). Case-insensitive.
const ADMIN_NAMES = ['Admin Ross Goodwell', 'Admin Dick Jones']

function normalizeName(n) {
  return n.replace(/\s+/g, ' ').trim()
}

function canonicalName(n) {
  return normalizeName(n).toLowerCase()
}

function validateFullName(n) {
  const parts = normalizeName(n).split(' ')
  return parts.length >= 2 && parts.every(p => p.length > 0)
}

// Get a Date object representing current time in America/New_York
function nowInNewYork() {
  // Create a string in the target timezone and parse it back into a Date
  const s = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
  return new Date(s)
}

function isLockedByWeek() {
  const now = nowInNewYork()
  // Find the most recent Sunday (start of week) in NY timezone
  // getDay(): 0 = Sunday
  const day = now.getDay()
  const sunday = new Date(now)
  sunday.setHours(0, 0, 0, 0)
  sunday.setDate(now.getDate() - day) // moves to Sunday 00:00
  // Lock starts at Sunday 15:00 (3pm)
  const lockStart = new Date(sunday)
  lockStart.setHours(15, 0, 0, 0)
  const lockEnd = new Date(lockStart)
  lockEnd.setDate(lockStart.getDate() + 2) // Next Sunday 15:00

  return now >= lockStart && now < lockEnd
}

export default function App() {
  const [currentUser, setCurrentUser] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  const [primary, setPrimary] = useState('')
  const [partners, setPartners] = useState(['']) // dynamic partner fields
  const [groups, setGroups] = useState([])
  const [locked, setLocked] = useState(isLockedByWeek())

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) setGroups(JSON.parse(raw))
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups))
  }, [groups])

  useEffect(() => {
    const t = setInterval(() => setLocked(isLockedByWeek()), 60_000) // refresh lock status every minute
    return () => clearInterval(t)
  }, [])

  function checkAdmin(name) {
    const c = canonicalName(name)
    return ADMIN_NAMES.some(a => canonicalName(a) === c)
  }

  function handleLogin(e) {
    e && e.preventDefault()
    const name = normalizeName(currentUser)
    setCurrentUser(name)
    setIsAdmin(checkAdmin(name))
  }

  function addPartnerField() {
    if (partners.length >= 3) return
    setPartners(p => [...p, ''])
  }

  function removePartnerField(index) {
    setPartners(p => p.filter((_, i) => i !== index))
  }

  function updatePartner(index, value) {
    setPartners(p => p.map((v, i) => (i === index ? value : v)))
  }

  function parsePartnersArray(arr) {
    return arr
      .map(n => normalizeName(n))
      .filter(n => n.length > 0)
  }

  function findGroupsWithNames(namesSet) {
    return groups.filter(g => g.players.some(p => namesSet.has(canonicalName(p))))
  }

  function addSignup(e) {
    e && e.preventDefault()

    if (locked && !isAdmin) return alert('Signups are locked for the week (Sunday 3pm ET). Only admins may modify groups.')

    const primaryName = normalizeName(primary)
    if (!validateFullName(primaryName)) return alert('Please enter first and last name for the primary player')

    const partnerNames = parsePartnersArray(partners)
    if (partnerNames.length > 3) return alert('You can add up to 3 additional players')

    // Validate all partner names are full names
    for (const p of partnerNames) {
      if (!validateFullName(p)) return alert('Please enter first and last name for each additional player')
    }

    const newNamesArr = [primaryName, ...partnerNames]
      .map(n => normalizeName(n))
      .filter((v, i, a) => a.findIndex(x => canonicalName(x) === canonicalName(v)) === i) // de-duplicate case-insensitively

    if (newNamesArr.length > 4) return alert('A group cannot exceed 4 players')

    const newNamesSet = new Set(newNamesArr.map(n => canonicalName(n)))

    const existing = findGroupsWithNames(newNamesSet)

    // If individual signup (no partners) place in first available group with space
    if (newNamesArr.length === 1) {
      const name = newNamesArr[0]
      // If already signed anywhere, notify
      const already = groups.some(g => g.players.some(p => canonicalName(p) === canonicalName(name)))
      if (already) return alert(`${name} is already signed up`)

      const idx = groups.findIndex(g => g.players.length < 4)
      if (idx !== -1) {
        const updated = groups.slice()
        updated[idx] = { ...updated[idx], players: [...updated[idx].players, name] }
        setGroups(updated)
      } else {
        const id = Date.now()
        setGroups([{ id, players: [name] }, ...groups])
      }

      setPrimary('')
      setPartners([''])
      return
    }

    // Multi-person signup
    if (existing.length === 1) {
      const g = existing[0]
      const containsAll = newNamesArr.every(n => g.players.some(p => canonicalName(p) === canonicalName(n)))
      if (containsAll) {
        setPrimary('')
        setPartners([''])
        return alert('Those players are already grouped together')
      }
    }

    if (existing.length > 0) {
      // Merge groups
      const mergedSet = new Set()
      existing.forEach(g => g.players.forEach(p => mergedSet.add(canonicalName(p))))
      newNamesArr.forEach(n => mergedSet.add(canonicalName(n)))

      if (mergedSet.size > 4) {
        return alert('Cannot merge groups: resulting group would exceed 4 players')
      }

      // Build players preserving original capitalization where possible
      const mergedPlayers = Array.from(mergedSet).map(cn => {
        // find original entry
        for (const g of existing) {
          const found = g.players.find(p => canonicalName(p) === cn)
          if (found) return found
        }
        // fallback to capitalized form of canonical name
        return cn.split(' ').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
      })

      const remaining = groups.filter(g => !existing.includes(g))
      const id = Date.now()
      setGroups([{ id, players: mergedPlayers }, ...remaining])
      setPrimary('')
      setPartners([''])
      return
    }

    // No existing groups: create new group
    if (newNamesArr.length <= 4) {
      const id = Date.now()
      setGroups([{ id, players: newNamesArr }, ...groups])
      setPrimary('')
      setPartners([''])
      return
    }

    alert('Unable to create group')
  }

  function removePlayer(groupId, player) {
    if (locked && !isAdmin) return alert('Cannot remove players while groups are locked (Sunday 3pm ET).')
    const updated = groups
      .map(g => {
        if (g.id !== groupId) return g
        return { ...g, players: g.players.filter(p => canonicalName(p) !== canonicalName(player)) }
      })
      .filter(g => g.players.length > 0)
    setGroups(updated)
  }

  function clearAll() {
    if (!isAdmin) return alert('Only admins may clear all groups')
    if (!confirm('Admin: Clear all groups?')) return
    setGroups([])
  }

  // Compute hole assignment for each group (1..9) in round-robin order
  const groupsWithHoles = groups.map((g, i) => ({ ...g, hole: (i % 9) + 1 }))

  return (
    <div className="container">
      <header>
        <h1>Golf League Signups</h1>
        <p>Sign up with first and last name. Groups capped at 4 players. Admins can manage locked weeks.</p>
      </header>

      <section style={{marginTop:12}}>
        <form onSubmit={handleLogin} style={{display:'flex', gap:8, alignItems:'center'}}>
          <input
            placeholder="Enter your full name to identify (optional)"
            value={currentUser}
            onChange={e => setCurrentUser(e.target.value)}
            style={{flex:1}}
          />
          <button type="submit">Set Name</button>
          <div style={{marginLeft:8}}>
            {currentUser && (
              <small>Signed in as <strong>{currentUser}</strong>{isAdmin ? ' (admin)' : ''}</small>
            )}
          </div>
        </form>
      </section>

      <main>
        <form onSubmit={addSignup} className="form" style={{marginTop:16}}>
          <input
            placeholder="Your full name (required)"
            value={primary}
            onChange={e => setPrimary(e.target.value)}
            disabled={locked && !isAdmin}
          />

          <div style={{display:'flex', flexDirection:'column', gap:6}}>
            {partners.map((p, idx) => (
              <div key={idx} style={{display:'flex', gap:6, alignItems:'center'}}>
                <input
                  placeholder={`Additional player ${idx + 1} (first & last)`}
                  value={p}
                  onChange={e => updatePartner(idx, e.target.value)}
                  disabled={locked && !isAdmin}
                />
                <button type="button" onClick={() => removePartnerField(idx)} disabled={locked && !isAdmin} aria-label="Remove partner">−</button>
              </div>
            ))}
            <div>
              <button type="button" onClick={addPartnerField} disabled={partners.length >= 3 || (locked && !isAdmin)}>＋ Add player</button>
            </div>
          </div>

          <button type="submit" style={{alignSelf:'flex-start'}} disabled={locked && !isAdmin}>Sign up</button>
        </form>

        <section className="list" style={{marginTop:16}}>
          <div className="list-header">
            <h2>Groups ({groups.length})</h2>
            <div>
              {isAdmin ? (
                <button className="clear" onClick={clearAll}>Admin: Clear</button>
              ) : null}
              <span style={{marginLeft:12}}>{locked ? 'Locked for the week (Sunday 3pm ET)' : 'Open for signups'}</span>
            </div>
          </div>

          {groupsWithHoles.length === 0 ? (
            <p className="empty">No signups yet.</p>
          ) : (
            <ul>
              {groupsWithHoles.map((g, idx) => (
                <li key={g.id}>
                  <div className="info" style={{width:'100%'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <div>
                        <strong>Group {groups.length - idx}</strong>
                        <div style={{fontSize:12,color:'var(--muted)'}}>Hole {g.hole} — {g.players.length} / 4 players</div>
                      </div>
                      <div>
                        {g.players.length > 1 ? null : <small style={{color:'var(--muted)'}}>Individual</small>}
                      </div>
                    </div>

                    <div style={{marginTop:8}}>
                      {g.players.map(p => (
                        <div key={p} style={{display:'flex',alignItems:'center',gap:8,marginTop:6}}>
                          <span>{p}</span>
                          <button className="remove" onClick={() => removePlayer(g.id, p)} disabled={locked && !isAdmin}>Remove</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer>
        <small>Names only. Groups are formed automatically and saved to localStorage. Hole assignment is balanced across 9 holes in round-robin order.</small>
      </footer>
    </div>
  )
}
