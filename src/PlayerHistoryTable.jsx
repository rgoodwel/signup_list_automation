import React, { useState, useMemo } from 'react'
import { weekKeyToLabel, computePlayerStats } from './storage'

const COLUMNS = [
  { key: 'name',          label: 'Name' },
  { key: 'email',         label: 'Email' },
  { key: 'firstWeekKey',  label: 'First Week' },
  { key: 'lastWeekKey',   label: 'Last Week' },
  { key: 'totalWeeks',    label: 'Total Weeks' },
  { key: 'currentStreak', label: 'Current Streak' },
]

function SortIcon({ dir }) {
  if (!dir) return <span className="sort-icon">⇅</span>
  return <span className="sort-icon">{dir === 'asc' ? '↑' : '↓'}</span>
}

export default function PlayerHistoryTable({ players, weeks }) {
  const [filter, setFilter]     = useState('')
  const [sortCol, setSortCol]   = useState('name')
  const [sortDir, setSortDir]   = useState('asc')

  const allWeekKeys = useMemo(() => Object.keys(weeks), [weeks])

  const rows = useMemo(() => {
    return Object.values(players).map(p => {
      const stats = computePlayerStats(p, allWeekKeys)
      return { ...p, ...stats }
    })
  }, [players, allWeekKeys])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)
    )
  }, [rows, filter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av = a[sortCol] ?? ''
      let bv = b[sortCol] ?? ''
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sortCol, sortDir])

  function toggleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Player History ({sorted.length}{filtered.length !== rows.length ? ` of ${rows.length}` : ''})</h2>
        <input
          className="filter-input"
          placeholder="Filter by name or email…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>

      {sorted.length === 0 ? (
        <p className="empty">No players found.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    className="sortable"
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.label}
                    <SortIcon dir={sortCol === col.key ? sortDir : null} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.email}>
                  <td>{r.name}</td>
                  <td>{r.email}</td>
                  <td>{weekKeyToLabel(r.firstWeekKey)}</td>
                  <td>{weekKeyToLabel(r.lastWeekKey)}</td>
                  <td>{r.totalWeeks}</td>
                  <td>{r.currentStreak}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
