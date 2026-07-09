import React, { useState, useEffect } from 'react'
import { useLeague } from './contexts/LeagueContext'
import {
  getCurrentWeekKey,
  getWeek,
  openWeek,
  lockCurrentWeek,
  finalizeCurrentWeek,
  getNextWeekKey,
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

  const isOpen  = weekKey && week && !week.closed_at

  async function handleLockToggle() {
    try {
      if (isOpen) {
        // Lock the week
        await lockCurrentWeek()
      } else {
        // Unlock the week
        const key = weekKeyFromDate()
        await openWeek(key)
      }
      // Immediately refresh the week state
      if (weekKey) {
        const updated = await getWeek(weekKey)
        setWeek(updated)
      }
      if (onRefresh) await onRefresh()
    } catch (err) {
      console.error('Error toggling week lock:', err)
    }
  }

  async function handleCloseWeek() {
    if (!confirm(`Close ${weekKeyToLabel(weekKey)}?`)) return
    try {
      await finalizeCurrentWeek()
      // Immediately refresh the week state - should now be removed from current
      const newWeekKey = await getCurrentWeekKey()
      if (newWeekKey) {
        const updated = await getWeek(newWeekKey)
        setWeek(updated)
        setWeekKey(newWeekKey)
      } else {
        // No current week anymore
        setWeek(null)
        setWeekKey(null)
      }
      if (onRefresh) await onRefresh()
    } catch (err) {
      console.error('Error closing week:', err)
    }
  }

  async function handleOpenNextWeek() {
    const nextWeek = getNextWeekKey(weekKey)
    if (!confirm(`Open ${weekKeyToLabel(nextWeek)}?`)) return
    try {
      await openWeek(nextWeek)
      // Immediately refresh to the new week state
      const newWeekKey = await getCurrentWeekKey()
      if (newWeekKey) {
        const updated = await getWeek(newWeekKey)
        setWeek(updated)
        setWeekKey(newWeekKey)
      }
      if (onRefresh) await onRefresh()
    } catch (err) {
      console.error('Error opening next week:', err)
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Current Week</h2>
        <div className="panel-actions" style={{display: 'flex', gap: '8px'}}>
          {isOpen ? (
            <button className="btn btn-danger" onClick={handleLockToggle}>Lock Signups</button>
          ) : (
            <button className="btn btn-primary" onClick={handleLockToggle}>
              Unlock Signups
            </button>
          )}
          <button className="btn btn-secondary" onClick={handleCloseWeek}>Close Week</button>
          <button className="btn btn-warning" onClick={handleOpenNextWeek}>Open Next Week</button>
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
