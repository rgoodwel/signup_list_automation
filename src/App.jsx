import React, { useState, useEffect } from 'react'
import AdminPanel from './Admin'

const STORAGE_KEY = 'signup_list_automation.groups_v3'
const PROFILES_KEY = 'signup_list_automation.profiles_v1'

// Configure admin names here (exact first + last names). Case-insensitive.
const ADMIN_NAMES = ['Alice Smith', 'Bob Jones']

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

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// Get a Date object representing current time in America/New_York
function nowInNewYork() {
  const s = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
  return new Date(s)
}

function isLockedByWeek() {
  const now = nowInNewYork()
  const day = now.getDay()
  const sunday = new Date(now)
  sunday.setHours(0, 0, 0, 0)
  sunday.setDate(now.getDate() - day)
  const lockStart = new Date(sunday)
  lockStart.setHours(15, 0, 0, 0)
  const lockEnd = new Date(lockStart)
  // lock until Tuesday 3pm (Sunday 3pm -> Tuesday 3pm)
  lockEnd.setDate(lockStart.getDate() + 2)
  return now >= lockStart && now < lockEnd
}

export default function App() {
  const [currentAdmin, setCurrentAdmin] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [showAdminPanel, setShowAdminPanel] = useState(false)

  // Signup form state: primary (name+email) and dynamic partners (array of {name,email})
  const [primaryName, setPrimaryName] = useState('')
  const [primaryEmail, setPrimaryEmail] = useState('')
  const [partners, setPartners] = useState([]) // start with no partner fields by default
  const [preferredHole, setPreferredHole] = useState('auto')

  const [groups, setGroups] = useState([])
  const [profiles, setProfiles] = useState({})
  const [locked, setLocked] = useState(isLockedByWeek())
  const [draggedPlayer, setDraggedPlayer] = useState(null)

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) setGroups(JSON.parse(raw))
    const pr = localStorage.getItem(PROFILES_KEY)
    if (pr) setProfiles(JSON.parse(pr))
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups))
  }, [groups])

  useEffect(() => {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
  }, [profiles])

  useEffect(() => {
    const t = setInterval(() => setLocked(isLockedByWeek()), 60_000)
    return () => clearInterval(t)
  }, [])

  function checkAdmin(name) {
    const c = canonicalName(name)
    return ADMIN_NAMES.some(a => canonicalName(a) === c)
  }

  function handleAdminLogin(e) {
    e && e.preventDefault()
    const name = normalizeName(currentAdmin)
    setCurrentAdmin(name)
    setIsAdmin(checkAdmin(name))
    if (!checkAdmin(name)) alert('Not an admin (client-side check)')
  }

  function addPartnerField() {
    if (partners.length >= 3) return
    setPartners(p => [...p, { name: '', email: '' }])
  }

  function removePartnerField(index) {
    setPartners(p => p.filter((_, i) => i !== index))
  }

  function updatePartner(index, field, value) {
    setPartners(p => p.map((v, i) => (i === index ? { ...v, [field]: value } : v)))
  }

  function findGroupsWithNames(namesSet) {
    return groups.filter(g => g.players.some(p => namesSet.has(canonicalName(p.name))))
  }

  function addOrUpdateProfile(name, email) {
    const cn = canonicalName(name)
    if (!cn) return
    setProfiles(prev => ({ ...prev, [cn]: { name: normalizeName(name), email } }))
  }

  function addSignup(e) {
    e && e.preventDefault()

    if (locked && !isAdmin) return alert('Signups are locked (Sunday 3pm ET → Tuesday 3pm ET). Only admins may modify groups.')

    const primary = normalizeName(primaryName)
    const primaryE = primaryEmail.trim()
    if (!validateFullName(primary)) return alert('Please enter first and last name for the primary player')
    if (!validateEmail(primaryE)) return alert('Please enter a valid email for the primary player')

    const partnerList = partners
      .map(p => ({ name: normalizeName(p.name), email: (p.email || '').trim() }))
      .filter(p => p.name.length > 0)

    if (partnerList.length > 3) return alert('You can add up to 3 additional players')

    for (const p of partnerList) {
      if (!validateFullName(p.name)) return alert('Please enter first and last name for each additional player')
      if (!validateEmail(p.email)) return alert('Please enter a valid email for each additional player')
    }

    // Build unique new players by canonical name
    const newPlayersArr = [{ name: primary, email: primaryE }, ...partnerList]
    const uniqueByCanonical = []
    const seen = new Set()
    for (const pl of newPlayersArr) {
      const cn = canonicalName(pl.name)
      if (!seen.has(cn)) {
        seen.add(cn)
        uniqueByCanonical.push(pl)
      }
    }

    if (uniqueByCanonical.length > 4) return alert('A group cannot exceed 4 players')

    const nameSet = new Set(uniqueByCanonical.map(p => canonicalName(p.name)))
    const existing = findGroupsWithNames(nameSet)

    // Determine target hole
    const holeCount = 9
    let targetHole = null
    if (preferredHole === 'auto') {
      // auto assign: find first hole with available space, or create new group
      targetHole = null
    } else {
      targetHole = parseInt(preferredHole, 10)
      if (isNaN(targetHole) || targetHole < 1 || targetHole > holeCount) {
        targetHole = null
      }
    }

    // Helper: get groups on a specific hole
    const getGroupsOnHole = (holeNum) => {
      return groups
        .map((g, i) => ({ ...g, hole: (i % holeCount) + 1, index: i }))
        .filter(g => g.hole === holeNum)
    }

    // If individual signup
    if (uniqueByCanonical.length === 1) {
      const player = uniqueByCanonical[0]
      const already = groups.some(g => g.players.some(p => canonicalName(p.name) === canonicalName(player.name)))
      if (already) return alert(`${player.name} is already signed up`)

      let placed = false
      let updatedGroups = groups.slice()

      // If preferred hole specified, try to place on that hole first
      if (targetHole !== null) {
        const groupsOnHole = getGroupsOnHole(targetHole)
        for (const g of groupsOnHole) {
          if (g.players.length < 4) {
            updatedGroups[g.index] = { ...updatedGroups[g.index], players: [...updatedGroups[g.index].players, player] }
            setGroups(updatedGroups)
            placed = true
            break
          }
        }
      }

      // If not placed (preferred hole full or auto), place on first available hole/group
      if (!placed) {
        for (let holeNum = 1; holeNum <= holeCount; holeNum++) {
          const groupsOnHole = getGroupsOnHole(holeNum)
          for (const g of groupsOnHole) {
            if (g.players.length < 4) {
              updatedGroups[g.index] = { ...updatedGroups[g.index], players: [...updatedGroups[g.index].players, player] }
              setGroups(updatedGroups)
              placed = true
              break
            }
          }
          if (placed) break
        }
      }

      // If still not placed, create new group (prefer target hole if specified)
      if (!placed) {
        const id = Date.now()
        setGroups([{ id, players: [player] }, ...groups])
      }

      addOrUpdateProfile(player.name, player.email)
      setPrimaryName('')
      setPrimaryEmail('')
      setPartners([])
      setPreferredHole('auto')
      return
    }

    // Multi-person signup
    if (existing.length === 1) {
      const g = existing[0]
      const containsAll = uniqueByCanonical.every(n => g.players.some(p => canonicalName(p.name) === canonicalName(n.name)))
      if (containsAll) {
        setPrimaryName('')
        setPrimaryEmail('')
        setPartners([])
        setPreferredHole('auto')
        return alert('Those players are already grouped together')
      }
    }

    if (existing.length > 0) {
      // Merge groups
      const mergedMap = new Map()
      existing.forEach(g => g.players.forEach(p => mergedMap.set(canonicalName(p.name), p)))
      uniqueByCanonical.forEach(p => mergedMap.set(canonicalName(p.name), p))

      if (mergedMap.size > 4) {
        return alert('Cannot merge groups: resulting group would exceed 4 players')
      }

      const mergedPlayers = Array.from(mergedMap.values())
      const remaining = groups.filter(g => !existing.includes(g))
      const id = Date.now()
      setGroups([{ id, players: mergedPlayers }, ...remaining])

      // save profiles
      mergedPlayers.forEach(p => addOrUpdateProfile(p.name, p.email))

      setPrimaryName('')
      setPrimaryEmail('')
      setPartners([])
      setPreferredHole('auto')
      return
    }

    // No existing groups: create new group
    if (uniqueByCanonical.length <= 4) {
      const id = Date.now()
      setGroups([{ id, players: uniqueByCanonical }, ...groups])
      uniqueByCanonical.forEach(p => addOrUpdateProfile(p.name, p.email))
      setPrimaryName('')
      setPrimaryEmail('')
      setPartners([])
      setPreferredHole('auto')
      return
    }

    alert('Unable to create group')
  }

  function removePlayer(groupId, player) {
    if (locked && !isAdmin) return alert('Cannot remove players while groups are locked (Sunday 3pm ET → Tuesday 3pm ET).')
    if (!confirm(`Remove ${player.name} from their group?`)) return
    const updated = groups
      .map(g => {
        if (g.id !== groupId) return g
        return { ...g, players: g.players.filter(p => canonicalName(p.name) !== canonicalName(player.name)) }
      })
      .filter(g => g.players.length > 0)
    setGroups(updated)
  }

  function clearAll() {
    if (!isAdmin) return alert('Only admins may clear all groups')
    if (!confirm('Admin: Clear all groups?')) return
    setGroups([])
  }

  // Drag and drop handlers
  function handlePlayerDragStart(e, groupId, player) {
    setDraggedPlayer({ groupId, player })
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleGroupDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleHoleDrop(e, holeNum) {
    e.preventDefault()
    if (!draggedPlayer) return

    const { groupId: sourceGroupId, player } = draggedPlayer
    const holeCount = 9

    // Get all groups on the target hole
    const groupsAssigned = groups.map((g, i) => ({ ...g, hole: (i % holeCount) + 1, index: i }))
    const groupsOnHole = groupsAssigned.filter(g => g.hole === holeNum)

    // Try to find a group on the hole with space
    let targetGroupId = null
    for (const g of groupsOnHole) {
      if (g.id !== sourceGroupId && g.players.length < 4) {
        // Check if player is already in this group
        if (!g.players.some(p => canonicalName(p.name) === canonicalName(player.name))) {
          targetGroupId = g.id
          break
        }
      }
    }

    // If no group with space, create a new group on this hole
    if (!targetGroupId) {
      const updated = groups.map(g => {
        if (g.id === sourceGroupId) {
          return { ...g, players: g.players.filter(p => canonicalName(p.name) !== canonicalName(player.name)) }
        }
        return g
      }).filter(g => g.players.length > 0)

      // Create new group with player
      const newGroupId = Date.now()
      const newGroup = { id: newGroupId, players: [player] }
      
      // Insert new group at position to target the hole
      // Groups are assigned holes by: (index % holeCount) + 1
      // To target hole holeNum, we need to find correct insertion position
      const targetIndex = ((holeNum - 1) * 1) // Simple approach: insert at beginning for new groups
      const finalGroups = [newGroup, ...updated]
      setGroups(finalGroups)
      setDraggedPlayer(null)
      return
    }

    // Move to existing group
    handleGroupDrop(e, targetGroupId)
  }

  function handleGroupDrop(e, targetGroupId) {
    e.preventDefault()
    if (!draggedPlayer) return

    const { groupId: sourceGroupId, player } = draggedPlayer

    // Can't drop on same group
    if (sourceGroupId === targetGroupId) {
      setDraggedPlayer(null)
      return
    }

    // Check if player already in target group
    const targetGroup = groups.find(g => g.id === targetGroupId)
    if (targetGroup && targetGroup.players.some(p => canonicalName(p.name) === canonicalName(player.name))) {
      alert(`${player.name} is already in that group`)
      setDraggedPlayer(null)
      return
    }

    // Check if target group is full
    if (targetGroup && targetGroup.players.length >= 4) {
      alert('Target group is full (4 players max)')
      setDraggedPlayer(null)
      return
    }

    // Move player: remove from source, add to target
    const updated = groups.map(g => {
      if (g.id === sourceGroupId) {
        return { ...g, players: g.players.filter(p => canonicalName(p.name) !== canonicalName(player.name)) }
      }
      if (g.id === targetGroupId) {
        return { ...g, players: [...g.players, player] }
      }
      return g
    }).filter(g => g.players.length > 0)

    setGroups(updated)
    setDraggedPlayer(null)
  }

  function handlePlayerDragEnd() {
    setDraggedPlayer(null)
  }

  // Hole assignment
  const holeCount = 9
  const groupsAssigned = groups.map((g, i) => ({ ...g, hole: (i % holeCount) + 1 }))
  // Map holeNumber -> array of groups
  const holeMap = {}
  for (let i = 1; i <= holeCount; i++) holeMap[i] = []
  groupsAssigned.forEach((g, idx) => holeMap[g.hole].push({ ...g, index: idx }))

  // Calculate total players
  const totalPlayers = groups.reduce((sum, g) => sum + g.players.length, 0)

  // Build profiles list for datalist
  const profileList = Object.values(profiles)

  // helper: when typing a primary name, if it matches a profile, autofill email
  function handlePrimaryNameChange(val) {
    setPrimaryName(val)
    const cn = canonicalName(val)
    if (profiles[cn]) setPrimaryEmail(profiles[cn].email || '')
  }

  // helper: prefill partner from profile when user types a name
  function handlePartnerNameChange(index, val) {
    updatePartner(index, 'name', val)
    const cn = canonicalName(val)
    if (profiles[cn]) updatePartner(index, 'email', profiles[cn].email || '')
  }

  if (showAdminPanel) {
    return <AdminPanel profiles={profiles} groups={groups} onClose={() => setShowAdminPanel(false)} onSaveGroups={setGroups} />
  }

  return (
    <div className="container se-brand">
      <header>
        <h1>Golf League Signups</h1>
        <p>Sign up with first and last name and an email. Groups capped at 4 players. Admins can manage locked weeks.</p>
      </header>

      <main>
        <div style={{marginTop:12, marginBottom:8}}>
          <strong>{locked ? 'Locked for signups (Sunday 3pm ET → Tuesday 3pm ET)' : 'Open for signups'}</strong>
        </div>

        <form onSubmit={addSignup} className="form" style={{marginTop:8}}>
          <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
            <div style={{flex:1}}>
              <div style={{display:'flex',gap:8}}>
                <div style={{flex:1}}>
                  <input
                    list="profiles"
                    placeholder="Your full name (required)"
                    value={primaryName}
                    onChange={e => handlePrimaryNameChange(e.target.value)}
                    disabled={locked && !isAdmin}
                  />
                  <datalist id="profiles">
                    {profileList.map(p => (
                      <option key={p.email + p.name} value={p.name}>{p.email}</option>
                    ))}
                  </datalist>
                </div>

                <div style={{flex:1}}>
                  <input
                    placeholder="Your email (required)"
                    value={primaryEmail}
                    onChange={e => setPrimaryEmail(e.target.value)}
                    disabled={locked && !isAdmin}
                  />
                </div>
              </div>

              {/* Partner fields (appear only when added) */}
              <div style={{display:'flex', flexDirection:'column', gap:6, marginTop:8}}>
                {partners.map((p, idx) => (
                  <div key={idx} style={{display:'flex', gap:6, alignItems:'center'}}>
                    <div style={{flex:1}}>
                      <input
                        list="profiles"
                        placeholder={`Additional player ${idx + 1} (first & last)`}
                        value={p.name}
                        onChange={e => handlePartnerNameChange(idx, e.target.value)}
                        disabled={locked && !isAdmin}
                      />
                    </div>
                    <div style={{flex:1}}>
                      <input
                        placeholder="email"
                        value={p.email}
                        onChange={e => updatePartner(idx, 'email', e.target.value)}
                        disabled={locked && !isAdmin}
                      />
                    </div>
                    <button type="button" onClick={() => removePartnerField(idx)} disabled={locked && !isAdmin} aria-label="Remove partner">−</button>
                  </div>
                ))}

                {/* Add player option placed after partner fields so it moves down */}
                <div>
                  <button type="button" onClick={addPartnerField} disabled={partners.length >= 3 || (locked && !isAdmin)}>＋ Add player</button>
                </div>

              </div>

              {/* Hole selection */}
              <div style={{marginTop:8}}>
                <label style={{fontSize:12,color:'var(--muted)'}}>Preferred hole (optional): </label>
                <select value={preferredHole} onChange={e => setPreferredHole(e.target.value)} disabled={locked && !isAdmin}>
                  <option value="auto">Auto assign</option>
                  {Array.from({ length: 9 }, (_, i) => i + 1).map(n => (
                    <option key={n} value={String(n)}>{`Hole ${n}`}</option>
                  ))}
                </select>
              </div>

            </div>

            {/* Sign Up button to the right of the player(s) */}
            <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end'}}>
              <button type="submit" style={{height:40}} disabled={locked && !isAdmin}>Sign up</button>
            </div>
          </div>
        </form>

        <section className="list" style={{marginTop:16}}>
          <div className="list-header">
            <h2>Holes / Groups ({totalPlayers} players)</h2>
            <div>
              {isAdmin ? (
                <button className="clear" onClick={clearAll}>Admin: Clear</button>
              ) : null}
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginTop:12}}>
            {Array.from({ length: holeCount }, (_, i) => i + 1).map(holeNum => (
              <div 
                key={holeNum} 
                style={{padding:12,borderRadius:8,background:'var(--hole-bg)',minHeight:'300px'}}
                onDragOver={handleGroupDragOver}
                onDrop={e => handleHoleDrop(e, holeNum)}
              >
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <strong>Hole {holeNum}</strong>
                  <small style={{color:'var(--muted)'}}>{holeMap[holeNum].length} group(s)</small>
                </div>

                {holeMap[holeNum].length === 0 ? (
                  <p className="empty" style={{marginTop:8,padding:'40px 0',textAlign:'center',borderRadius:6,border:'2px dashed rgba(0,0,0,0.1)'}}>Drop players here or add new signup</p>
                ) : (
                  holeMap[holeNum].map((g, idx) => (
                    <div 
                      key={g.id} 
                      style={{marginTop:8,padding:8,borderRadius:6,background:'var(--card)',minHeight:'100px'}}
                      onDragOver={handleGroupDragOver}
                      onDrop={e => handleGroupDrop(e, g.id)}
                    >
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <div>
                          <strong>{String.fromCharCode(65 + idx)}</strong>
                          <div style={{fontSize:12,color:'var(--muted)'}}>Group — {g.players.length} / 4</div>
                        </div>
                        <div>
                          <small style={{color:'var(--muted)'}}>Group #{groups.length - g.index}</small>
                        </div>
                      </div>

                      <div style={{marginTop:8}}>
                        {g.players.map(p => (
                          <div 
                            key={p.name} 
                            style={{display:'flex',alignItems:'center',gap:8,marginTop:6,cursor:'grab',padding:4,borderRadius:4,backgroundColor:'rgba(0,0,0,0.02)'}}
                            draggable
                            onDragStart={e => handlePlayerDragStart(e, g.id, p)}
                            onDragEnd={handlePlayerDragEnd}
                          >
                            <div style={{flex:1}}>
                              <div>{p.name}</div>
                            </div>
                            <button className="remove" onClick={() => removePlayer(g.id, p)} disabled={locked && !isAdmin}>Remove</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>

          {groups.length > holeCount && (
            <div style={{marginTop:12}}>
              <small style={{color:'var(--muted)'}}>More than {holeCount} groups — groups are assigned A/B (or more) on holes in round-robin order.</small>
            </div>
          )}
        </section>
      </main>

      <footer style={{marginTop:18}}>
        <div style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between'}}>
          <form onSubmit={handleAdminLogin} style={{display:'flex',gap:8,alignItems:'center'}}>
            <input placeholder="Admin full name (login)" value={currentAdmin} onChange={e => setCurrentAdmin(e.target.value)} />
            <button type="submit">Admin Login</button>
          </form>

          <div style={{display:'flex',alignItems:'center',gap:12}}>
            {currentAdmin && <small>Admin signed in as <strong>{currentAdmin}</strong>{isAdmin ? ' (admin)' : ' (not admin)'}</small>}
            {isAdmin && (
              <button onClick={() => setShowAdminPanel(true)}>Open Admin Panel</button>
            )}
          </div>
        </div>

        <div style={{marginTop:8}}>
          <small>Names + emails are saved locally for faster signups. Admin login is a client-side convenience — not secure. Drag players between groups or holes to reorganize.</small>
        </div>
      </footer>
    </div>
  )
}
