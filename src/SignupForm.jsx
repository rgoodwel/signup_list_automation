import React, { useState } from 'react'
import { NUM_HOLES, SLOTS_PER_HOLE } from './constants'

export default function SignupForm({ holes, dispatch }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [holeNum, setHoleNum] = useState('none')
  const [notice, setNotice] = useState('')

  function isHoleFull(h) {
    return holes[h] && holes[h].filter(s => s !== null).length === SLOTS_PER_HOLE
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return

    const player = { id: Date.now(), name: name.trim(), email: email.trim() }
    const chosen = holeNum !== 'none' ? Number(holeNum) : null

    if (chosen && isHoleFull(chosen)) {
      setNotice(`Hole ${chosen} is full — added to unassigned instead.`)
    } else if (chosen) {
      setNotice(`Added to Hole ${chosen}.`)
    } else {
      setNotice('Added to unassigned list.')
    }

    dispatch({ type: 'ADD_PLAYER', player, holeNum: chosen })
    setName('')
    setEmail('')
    setHoleNum('none')
    setTimeout(() => setNotice(''), 3500)
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      <input
        placeholder="Name"
        value={name}
        onChange={e => setName(e.target.value)}
        required
      />
      <input
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
      />
      <select value={holeNum} onChange={e => setHoleNum(e.target.value)}>
        <option value="none">No preference</option>
        {Array.from({ length: NUM_HOLES }, (_, i) => i + 1).map(h => {
          const full = isHoleFull(h)
          return (
            <option key={h} value={h} disabled={full}>
              Hole {h}{full ? ' (FULL)' : ''}
            </option>
          )
        })}
      </select>
      <button type="submit">Add Player</button>
      {notice && <span className="form-notice">{notice}</span>}
    </form>
  )
}
