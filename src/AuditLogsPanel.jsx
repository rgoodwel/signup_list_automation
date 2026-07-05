import React, { useState, useEffect } from 'react'
import {
  getCurrentWeekKey,
  getAuditLogs,
  weekKeyToLabel,
} from './storage'

export default function AuditLogsPanel() {
  const [logs, setLogs] = useState([])
  const [weekKey, setWeekKey] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // 'all', 'CREATE', 'UPDATE', 'DELETE'

  useEffect(() => {
    async function loadLogs() {
      try {
        setLoading(true)
        const key = await getCurrentWeekKey()
        setWeekKey(key)
        
        if (key) {
          const auditLogs = await getAuditLogs(key, 200)
          setLogs(auditLogs)
        } else {
          setLogs([])
        }
      } catch (err) {
        console.error('Error loading audit logs:', err)
      } finally {
        setLoading(false)
      }
    }
    
    loadLogs()
  }, [])

  const filteredLogs = filter === 'all' ? logs : logs.filter(log => log.operation === filter)

  const operationColor = {
    CREATE: '#4CAF50', // Green
    UPDATE: '#FF9800', // Orange
    DELETE: '#F44336', // Red
  }

  const operationEmoji = {
    CREATE: '✨',
    UPDATE: '🔄',
    DELETE: '🗑️',
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Change Logs</h2>
        <p className="muted" style={{ margin: 0, fontSize: '13px' }}>
          {weekKey ? `${weekKeyToLabel(weekKey)} • ${filteredLogs.length} change${filteredLogs.length !== 1 ? 's' : ''}` : 'No active week'}
        </p>
      </div>

      {!weekKey ? (
        <p className="empty">No active week. Logs will appear after signups are opened.</p>
      ) : loading ? (
        <p className="muted">Loading logs...</p>
      ) : filteredLogs.length === 0 ? (
        <p className="empty">No changes recorded yet.</p>
      ) : (
        <>
          {/* Filter buttons */}
          <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {['all', 'CREATE', 'UPDATE', 'DELETE'].map(op => (
              <button
                key={op}
                onClick={() => setFilter(op)}
                className={`btn ${filter === op ? 'btn-primary' : 'btn-outline'}`}
                style={{ fontSize: '13px', padding: '6px 12px' }}
              >
                {op === 'all' ? 'All' : `${operationEmoji[op]} ${op}`}
              </button>
            ))}
          </div>

          {/* Logs table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '13px' }}>
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>Type</th>
                  <th>Player</th>
                  <th>Email</th>
                  <th>Hole</th>
                  <th>Details</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log, i) => (
                  <tr key={i}>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: operationColor[log.operation],
                          color: '#fff',
                          fontWeight: '600',
                          fontSize: '11px',
                        }}
                      >
                        {operationEmoji[log.operation]} {log.operation}
                      </span>
                    </td>
                    <td>{log.player_name}</td>
                    <td style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      {log.player_email || '(guest)'}
                    </td>
                    <td>
                      {log.hole_number}
                      {log.hole_group === 'B' ? 'B' : ''}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--muted)', maxWidth: '200px' }}>
                      {log.details?.action === 'player_moved' && (
                        <>
                          Moved: {log.details.fromHole} → {log.details.toHole}
                        </>
                      )}
                      {log.details?.type === 'primary' && (
                        <>Group size: {log.details.groupSize}</>
                      )}
                      {log.details?.type === 'guest' && (
                        <>Added as guest by {log.details.primaryPlayer}</>
                      )}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
