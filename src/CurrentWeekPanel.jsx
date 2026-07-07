import React, { useState, useEffect } from 'react'
import { useLeague } from './contexts/LeagueContext'
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
  const league = useLeague()
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
          
          // Fetch players for this week (filtered by league)
          const { data, error } = await supabase
            .from('weekly_players')
            .select('id, player_name, player_email, hole_number, hole_group, week_number, signed_up_at')
            .eq('league_id', league?.id)
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
    </div>
  )
}
