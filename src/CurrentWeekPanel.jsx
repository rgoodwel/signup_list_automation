import React, { useState, useEffect } from 'react'
import {
  getCurrentWeekKey,
  getWeek,
  openWeek,
  closeCurrentWeek,
  weekKeyFromDate,
  weekKeyToLabel,
} from './storage'
import { supabase } from './utils/supabaseClient'

export default function CurrentWeekPanel({ onRefresh }) {
  const [weeklyPlayers, setWeeklyPlayers] = useState([])
  const [loadingSupabase, setLoadingSupabase] = useState(false)
  const [weekKey, setWeekKey] = useState(null)
  const [week, setWeek] = useState(null)

  // Fetch current week and players from Supabase
  useEffect(() => {
    async function loadWeekData() {
      try {
        setLoadingSupabase(true)
        const key = await getCurrentWeekKey()
        setWeekKey(key)
        
        if (key) {
          const w = await getWeek(key)
          setWeek(w)
          
          // Fetch players for this week
          const { data, error } = await supabase
            .from('weekly_players')
            .select('id, player_name, player_email, hole_number, hole_group, week_number, signed_up_at')
            .eq('week_number', key)
          
          if (error) {
            console.error('Error fetching weekly players:', error)
          } else {
            setWeeklyPlayers(data || [])
          }
        } else {
          setWeek(null)
          setWeeklyPlayers([])
        }
      } catch (err) {
        console.error('Error loading week data:', err)
      } finally {
        setLoadingSupabase(false)
      }
    }
    
    loadWeekData()
  }, [onRefresh])

  const isOpen  = weekKey && week && !week.closedAt

  async function handleOpen() {
    const key = weekKeyFromDate()
    await openWeek(key)
    if (onRefresh) await onRefresh()
  }

  async function handleClose() {
    if (!confirm('Close signups for the current week?')) return
    await closeCurrentWeek()
    if (onRefresh) await onRefresh()
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
            {weekKeyToLabel(weekKey)} &mdash; {weeklyPlayers.length} signup(s)
          </p>
          {weeklyPlayers.length === 0 ? (
            <p className="empty">No signups yet this week.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Hole</th>
                  <th>Signed Up At</th>
                </tr>
              </thead>
              <tbody>
                {weeklyPlayers.map((p, i) => (
                  <tr key={p.id}>
                    <td>{i + 1}</td>
                    <td>{p.player_name}</td>
                    <td>{p.player_email || '(guest)'}</td>
                    <td>{p.hole_number}{p.hole_group === 'B' ? 'B' : ''}</td>
                    <td>{new Date(p.signed_up_at).toLocaleString()}</td>
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

      {/* Supabase Weekly Players Section */}
      <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
        <h3 style={{ marginTop: 0 }}>Weekly Players (from Supabase)</h3>
        {loadingSupabase ? (
          <p className="muted">Loading players from Supabase...</p>
        ) : weeklyPlayers.length === 0 ? (
          <p className="muted">No players found in Supabase.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Email</th>
                <th>Group</th>
                <th>Hole</th>
              </tr>
            </thead>
            <tbody>
              {weeklyPlayers.map((player, i) => (
                <tr key={player.id || i}>
                  <td>{i + 1}</td>
                  <td>{player.player_name}</td>
                  <td>{player.player_email}</td>
                  <td>{player.hole_group}</td>
                  <td>{player.hole_number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
