import React, { useState, useEffect } from 'react'

const STORAGE_KEY = 'signup_list_automation.groups_v1'

function normalizeName(n) {
  return n.replace(/\s+/g, ' ').trim()
}

export default function App() {
  const [primary, setPrimary] = useState('')
  const [partners, setPartners] = useState('') // comma-separated names
  const [groups, setGroups] = useState([])

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) setGroups(JSON.parse(raw))
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups))
  }, [groups])

  function parsePartners(input) {
    if (!input) return []
    return input
      .split(',')
      .map(n => normalizeName(n))
      .filter(n => n.length > 0)
  }

  function findGroupsWithNames(namesSet) {
    return groups.filter(g => g.players.some(p => namesSet.has(p)))
  }

  function addSignup(e) {
    e && e.preventDefault()
    const primaryName = normalizeName(primary)
    if (!primaryName) return alert('Please enter a player name')

    const partnerNames = parsePartners(partners)
    if (partnerNames.length > 3) return alert('You can add up to 3 other players (groups max 4)')

    // Build the set of names for this signup
    const newNamesArr = [primaryName, ...partnerNames].filter((v, i, a) => a.indexOf(v) === i)
    if (newNamesArr.length > 4) return alert('A group cannot exceed 4 players')
    const newNamesSet = new Set(newNamesArr)

    // Check whether any of the names already exist in groups
    const existing = findGroupsWithNames(newNamesSet)

    // Helper to check if any name is already signed (in any group)
    const allSigned = newNamesArr.every(name => groups.some(g => g.players.includes(name)))

    if (newNamesArr.length === 1) {
      // Individual signup: put into first available group with space
      const name = newNamesArr[0]
      // If already signed, notify
      if (allSigned) return alert(`${name} is already signed up`)

      // find first group with less than 4 players and that doesn't already contain the name
      const idx = groups.findIndex(g => g.players.length < 4 && !g.players.includes(name))
      if (idx !== -1) {
        const updated = groups.slice()
        updated[idx] = { ...updated[idx], players: [...updated[idx].players, name] }
        setGroups(updated)
      } else {
        // create new group
        const id = Date.now()
        setGroups([{ id, players: [name] }, ...groups])
      }

      setPrimary('')
      setPartners('')
      return
    }

    // Now newNamesArr.length >= 2: group signup with 1-3 others
    // If all names already present together in same group, notify
    if (existing.length === 1) {
      const g = existing[0]
      const containsAll = newNamesArr.every(n => g.players.includes(n))
      if (containsAll) {
        setPrimary('')
        setPartners('')
        return alert('Those players are already grouped together')
      }
    }

    // If some names are in different existing groups, attempt to merge
    if (existing.length > 0) {
      // merged players are union of all players in found groups + new names
      const mergedSet = new Set()
      existing.forEach(g => g.players.forEach(p => mergedSet.add(p)))
      newNamesArr.forEach(n => mergedSet.add(n))

      if (mergedSet.size > 4) {
        return alert('Cannot merge groups: resulting group would exceed 4 players')
      }

      // Remove the old groups and create merged group
      const remaining = groups.filter(g => !existing.includes(g))
      const id = Date.now()
      setGroups([{ id, players: Array.from(mergedSet) }, ...remaining])
      setPrimary('')
      setPartners('')
      return
    }

    // No existing groups: create new group if size <=4
    if (newNamesArr.length <= 4) {
      const id = Date.now()
      setGroups([{ id, players: newNamesArr }, ...groups])
      setPrimary('')
      setPartners('')
      return
    }

    alert('Unable to create group')
  }

  function removePlayer(groupId, player) {
    const updated = groups
      .map(g => {
        if (g.id !== groupId) return g
        return { ...g, players: g.players.filter(p => p !== player) }
      })
      .filter(g => g.players.length > 0)
    setGroups(updated)
  }

  function clearAll() {
    if (!confirm('Clear all groups?')) return
    setGroups([])
  }

  return (
    <div className="container">
      <header>
        <h1>Golf League Signups</h1>
        <p>Sign up as an individual or with 1-3 other players. Groups capped at 4 players.</p>
      </header>

      <main>
        <form onSubmit={addSignup} className="form">
          <input
            placeholder="Your name (required)"
            value={primary}
            onChange={e => setPrimary(e.target.value)}
          />
          <input
            placeholder="Add other players (comma-separated, optional, up to 3)"
            value={partners}
            onChange={e => setPartners(e.target.value)}
          />
          <button type="submit">Sign up</button>
        </form>

        <section className="list">
          <div className="list-header">
            <h2>Groups ({groups.length})</h2>
            <button className="clear" onClick={clearAll}>Clear</button>
          </div>

          {groups.length === 0 ? (
            <p className="empty">No signups yet.</p>
          ) : (
            <ul>
              {groups.map((g, idx) => (
                <li key={g.id}>
                  <div className="info">
                    <strong>Group {groups.length - idx}</strong>
                    <small>{g.players.length} / 4 players</small>
                    <div style={{marginTop:8}}>
                      {g.players.map(p => (
                        <div key={p} style={{display:'flex',alignItems:'center',gap:8,marginTop:6}}>
                          <span>{p}</span>
                          <button className="remove" onClick={() => removePlayer(g.id, p)}>Remove</button>
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
        <small>Names only. Groups are created/merged automatically and saved to localStorage.</small>
      </footer>
    </div>
  )
}
