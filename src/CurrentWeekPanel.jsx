import React from 'react'
import {
  getCurrentWeekKey,
  getWeek,
  openWeek,
  closeCurrentWeek,
  weekKeyFromDate,
  weekKeyToLabel,
} from './storage'

export default function CurrentWeekPanel({ onRefresh }) {
  const weekKey = getCurrentWeekKey()
  const week    = weekKey ? getWeek(weekKey) : null
  const isOpen  = weekKey && week && !week.closedAt

  function handleOpen() {
    const key = weekKeyFromDate()
    openWeek(key)
    if (onRefresh) onRefresh()
  }

  function handleClose() {
    if (!confirm('Close signups for the current week?')) return
    closeCurrentWeek()
    if (onRefresh) onRefresh()
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Current Week</h2>
        <div className="panel-actions">
          {isOpen ? (
            <button className="btn btn-danger" onClick={handleClose}>Lock Signups</button>
          ) : (
            <button className="btn btn-primary" onClick={handleOpen}>
              Unlock Signups ({weekKeyFromDate()})
            </button>
          )}
        </div>
      </div>

      {isOpen ? (
        <>
          <p className="week-label">
            <span className="badge badge-green">OPEN</span>{' '}
            {weekKeyToLabel(weekKey)} &mdash; {week.signups.length} signup(s)
          </p>
          {week.signups.length === 0 ? (
            <p className="empty">No signups yet this week.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Signed Up At</th>
                </tr>
              </thead>
              <tbody>
                {week.signups.map((s, i) => (
                  <tr key={s.email}>
                    <td>{i + 1}</td>
                    <td>{s.name}</td>
                    <td>{s.email}</td>
                    <td>{new Date(s.signedUpAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <p className="empty">
          {weekKey
            ? `${weekKeyToLabel(weekKey)} signups are locked.`
            : 'Signups are locked. Use "Unlock Signups" to open the current week.'}
        </p>
      )}
    </div>
  )
}
