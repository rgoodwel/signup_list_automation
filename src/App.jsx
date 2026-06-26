import React, { useReducer, useEffect } from 'react'
import { NUM_HOLES, SLOTS_PER_HOLE, STORAGE_KEY } from './constants'
import SignupForm from './SignupForm'
import HoleBoard from './HoleBoard'

function makeEmptyState() {
  const holes = {}
  for (let i = 1; i <= NUM_HOLES; i++) {
    holes[i] = Array(SLOTS_PER_HOLE).fill(null)
  }
  return { unassigned: [], holes }
}

function reducer(state, action) {
  switch (action.type) {
    case 'ADD_PLAYER': {
      const { player, holeNum } = action
      if (holeNum) {
        const slots = state.holes[holeNum]
        const idx = slots.findIndex(s => s === null)
        if (idx !== -1) {
          return {
            ...state,
            holes: {
              ...state.holes,
              [holeNum]: slots.map((s, i) => (i === idx ? player : s)),
            },
          }
        }
        // Hole is full — fall through to unassigned
      }
      return { ...state, unassigned: [...state.unassigned, player] }
    }
    case 'REMOVE_PLAYER': {
      const { id } = action
      const newHoles = {}
      for (const h of Object.keys(state.holes)) {
        newHoles[h] = state.holes[h].map(s => (s && s.id === id ? null : s))
      }
      return {
        unassigned: state.unassigned.filter(p => p.id !== id),
        holes: newHoles,
      }
    }
    case 'MOVE_PLAYER': {
      const { source, target } = action
      let player
      let newUnassigned = [...state.unassigned]
      const newHoles = {}
      for (const h of Object.keys(state.holes)) {
        newHoles[h] = [...state.holes[h]]
      }

      // Extract player from source
      if (source.area === 'unassigned') {
        player = state.unassigned[source.index]
        if (!player) return state
        newUnassigned = newUnassigned.filter((_, i) => i !== source.index)
      } else {
        player = state.holes[source.holeNum][source.slotIndex]
        if (!player) return state
        newHoles[source.holeNum] = newHoles[source.holeNum].map((s, i) =>
          i === source.slotIndex ? null : s
        )
      }

      // Place player at target
      if (target.area === 'unassigned') {
        newUnassigned = [...newUnassigned, player]
      } else {
        const targetSlots = newHoles[target.holeNum]
        if (targetSlots[target.slotIndex] !== null) return state // occupied — reject
        newHoles[target.holeNum] = targetSlots.map((s, i) =>
          i === target.slotIndex ? player : s
        )
      }

      return { unassigned: newUnassigned, holes: newHoles }
    }
    case 'CLEAR_ALL':
      return makeEmptyState()
    default:
      return state
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.holes && Array.isArray(parsed.unassigned)) return parsed
    }
  } catch {}
  return makeEmptyState()
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, null, loadState)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  function clearAll() {
    if (!confirm('Clear all signups?')) return
    dispatch({ type: 'CLEAR_ALL' })
  }

  const totalPlayers =
    state.unassigned.length +
    Object.values(state.holes).reduce((sum, slots) => sum + slots.filter(Boolean).length, 0)

  return (
    <div className="container">
      <header>
        <h1>Signup List Automation</h1>
        <p>Sign up and choose a hole. Drag players to any open slot to reassign them.</p>
      </header>

      <main>
        <SignupForm holes={state.holes} dispatch={dispatch} />

        <div className="board-header">
          <h2>Hole Assignments ({totalPlayers} player{totalPlayers !== 1 ? 's' : ''})</h2>
          <button className="clear" onClick={clearAll}>Clear All</button>
        </div>

        <HoleBoard holes={state.holes} unassigned={state.unassigned} dispatch={dispatch} />
      </main>

      <footer>
        <small>Stored in browser localStorage. Build with Vite for production.</small>
      </footer>
    </div>
  )
}
