import React, { useState } from 'react'
import HoleCard from './HoleCard'
import PlayerSlot from './PlayerSlot'
import { NUM_HOLES } from './constants'

export default function HoleBoard({ holes, unassigned, dispatch }) {
  const [isDragOver, setIsDragOver] = useState(false)

  function handleDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }

  function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragOver(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setIsDragOver(false)
    try {
      const source = JSON.parse(e.dataTransfer.getData('application/json'))
      dispatch({ type: 'MOVE_PLAYER', source, target: { area: 'unassigned' } })
    } catch {}
  }

  return (
    <div className="board">
      <div
        className={`unassigned-panel${isDragOver ? ' drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <h3 className="unassigned-title">Unassigned ({unassigned.length})</h3>
        <div className="unassigned-list">
          {unassigned.length === 0 ? (
            <p className="empty">No unassigned players — drop here to unassign.</p>
          ) : (
            unassigned.map((player, index) => (
              <PlayerSlot
                key={player.id}
                player={player}
                area="unassigned"
                slotIndex={index}
                dispatch={dispatch}
              />
            ))
          )}
        </div>
      </div>

      <div className="hole-grid">
        {Array.from({ length: NUM_HOLES }, (_, i) => i + 1).map(h => (
          <HoleCard
            key={h}
            holeNum={h}
            slots={holes[h]}
            dispatch={dispatch}
          />
        ))}
      </div>
    </div>
  )
}
