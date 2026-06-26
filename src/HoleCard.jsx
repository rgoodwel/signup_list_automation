import React from 'react'
import PlayerSlot from './PlayerSlot'
import { SLOTS_PER_HOLE } from './constants'

export default function HoleCard({ holeNum, slots, dispatch }) {
  const playerCount = slots.filter(s => s !== null).length
  const isFull = playerCount === SLOTS_PER_HOLE

  return (
    <div className={`hole-card${isFull ? ' hole-card--full' : ''}`}>
      <div className="hole-header">
        <span className="hole-number">Hole {holeNum}</span>
        <span className="hole-count">{playerCount}/{SLOTS_PER_HOLE}</span>
        {isFull && <span className="full-badge">FULL</span>}
      </div>
      <div className="hole-slots">
        {slots.map((player, slotIndex) => (
          <PlayerSlot
            key={slotIndex}
            player={player}
            area="hole"
            holeNum={holeNum}
            slotIndex={slotIndex}
            dispatch={dispatch}
          />
        ))}
      </div>
    </div>
  )
}
