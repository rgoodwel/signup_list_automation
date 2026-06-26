import React, { useState } from 'react'

export default function PlayerSlot({ player, area, holeNum, slotIndex, dispatch }) {
  const [isDragOver, setIsDragOver] = useState(false)

  const source =
    area === 'unassigned'
      ? { area: 'unassigned', index: slotIndex }
      : { area: 'hole', holeNum, slotIndex }

  const target =
    area === 'unassigned'
      ? { area: 'unassigned' }
      : { area: 'hole', holeNum, slotIndex }

  function handleDragStart(e) {
    e.dataTransfer.setData('application/json', JSON.stringify(source))
    e.dataTransfer.effectAllowed = 'move'
  }

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
      const src = JSON.parse(e.dataTransfer.getData('application/json'))
      dispatch({ type: 'MOVE_PLAYER', source: src, target })
    } catch {}
  }

  if (player) {
    return (
      <div
        className="player-chip"
        draggable
        onDragStart={handleDragStart}
      >
        <div className="player-info">
          <strong>{player.name}</strong>
          <small>{player.email}</small>
        </div>
        <button
          className="remove"
          onClick={() => dispatch({ type: 'REMOVE_PLAYER', id: player.id })}
          title="Remove player"
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <div
      className={`empty-slot${isDragOver ? ' drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <span className="empty-label">Drop here</span>
    </div>
  )
}
