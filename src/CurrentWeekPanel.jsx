import React, { useState, useEffect } from 'react'
import { useLeague } from './contexts/LeagueContext'
import {
  getCurrentWeekKey,
  getWeek,
  openWeek,
  unlockWeek,
  lockCurrentWeek,
  finalizeCurrentWeek,
  getNextWeekKey,
  weekKeyToLabel,
  compareWeekKeys,
  getLeagueSignupConfig,
  parseBHoleUnlockSequence,
} from './storage'
import { supabase } from './utils/supabaseClient'

export default function CurrentWeekPanel({ onRefresh }) {
  const league = useLeague()
  const [weeklyPlayers, setWeeklyPlayers] = useState([])
  const [loadingSupabase, setLoadingSupabase] = useState(false)
  const [weekKey, setWeekKey] = useState(null)
  const [week, setWeek] = useState(null)
  const [lastWeekKey, setLastWeekKey] = useState(null) // most recent week (for computing next)
  const [bHoleUnlockSequenceInput, setBHoleUnlockSequenceInput] = useState('')
  const [savingSequence, setSavingSequence] = useState(false)
  const [sequenceMsg, setSequenceMsg] = useState('')

  useEffect(() => {
    setBHoleUnlockSequenceInput(league?.b_hole_unlock_sequence || '')
  }, [league?.b_hole_unlock_sequence])

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
          setLastWeekKey(key)

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
          // No active week — find the most recently finalized one so we know what "next" is
          if (league?.id) {
            const { data: recentWeeks } = await supabase
              .from('weeks')
              .select('week_key')
              .eq('league_id', league.id)
              .order('opened_at', { ascending: false })
              .limit(1)
            setLastWeekKey(recentWeeks?.[0]?.week_key || null)
          }
        }
      } catch (err) {
        console.error('Error loading week data:', err)
      } finally {
        setLoadingSupabase(false)
      }
    }

    loadWeekData()
  }, [onRefresh, league?.id])

  const isOpen  = weekKey && week && !week.closed_at

  async function handleLockToggle() {
    try {
      if (isOpen) {
        await lockCurrentWeek()
      } else {
        // Reopen the existing locked week — don't create a new one
        await unlockWeek(weekKey)
      }
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
    try {
      // Compute the week to open: next after last known week, or current ISO week if no history
      const nextWeek = getNextWeekKey(lastWeekKey)
      if (!nextWeek) {
        console.error('Could not determine next week')
        return
      }
      if (!confirm(`Open ${weekKeyToLabel(nextWeek)}?`)) return

      await openWeek(nextWeek)
      const newWeekKey = await getCurrentWeekKey()
      if (newWeekKey) {
        const updated = await getWeek(newWeekKey)
        setWeek(updated)
        setWeekKey(newWeekKey)
        setLastWeekKey(newWeekKey)
      }
      if (onRefresh) await onRefresh()
    } catch (err) {
      alert(err.message || 'Error opening next week')
      console.error('Error opening next week:', err)
    }
  }

  async function handleSaveBHoleSequence() {
    if (!league?.id) return
    const { openHoleCount } = getLeagueSignupConfig(league)
    const normalizedSequence = parseBHoleUnlockSequence(bHoleUnlockSequenceInput, openHoleCount)
    const normalizedValue = normalizedSequence.join(',')

    try {
      setSavingSequence(true)
      setSequenceMsg('')
      const { error } = await supabase
        .from('leagues')
        .update({ b_hole_unlock_sequence: normalizedValue })
        .eq('id', league.id)

      if (error) throw error

      setBHoleUnlockSequenceInput(normalizedValue)
      setSequenceMsg(`Saved. Effective unlock order: ${normalizedValue}`)
      window.dispatchEvent(new CustomEvent('league-settings-updated'))
    } catch (err) {
      console.error('Error saving B-hole unlock sequence:', err)
      setSequenceMsg('Could not save B-hole unlock order. Please try again.')
    } finally {
      setSavingSequence(false)
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Current Week</h2>
        <div className="panel-actions" style={{display: 'flex', gap: '8px'}}>
          {weekKey ? (
            <>
              {isOpen ? (
                <button className="btn btn-danger" onClick={handleLockToggle}>Lock Signups</button>
              ) : (
                <button className="btn btn-primary" onClick={handleLockToggle}>Unlock Signups</button>
              )}
              <button className="btn btn-secondary" onClick={handleCloseWeek}>Close &amp; Finalize Week</button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={handleOpenNextWeek}>
              Open {weekKeyToLabel(getNextWeekKey(lastWeekKey))}
            </button>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '12px' }}>
        <h3 style={{ marginTop: 0 }}>B-Hole Unlock Order</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Enter comma-separated B hole numbers in unlock order (example: 5,1,3,2,4,6,7,8,9).
        </p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={bHoleUnlockSequenceInput}
            onChange={(e) => { setBHoleUnlockSequenceInput(e.target.value); setSequenceMsg('') }}
            placeholder="1,2,3,4,5,6,7,8,9"
            style={{ minWidth: '320px' }}
          />
          <button className="btn btn-primary" onClick={handleSaveBHoleSequence} disabled={savingSequence}>
            {savingSequence ? 'Saving...' : 'Save Order'}
          </button>
        </div>
        {sequenceMsg && <p className="muted" style={{ marginBottom: 0 }}>{sequenceMsg}</p>}
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
            <div className="table-scroll">
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
            </div>
          )}
        </>
      ) : (
        <p className="empty">
          {weekKey
            ? `${weekKeyToLabel(weekKey)} signups are locked.`
            : 'No active week. Use the button above to open the next week.'}
        </p>
      )}
    </div>
  )
}
