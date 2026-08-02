import React, { useState, useEffect, useCallback } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { supabase } from './utils/supabaseClient'
import { LeagueProvider } from './contexts/LeagueContext'
import App from './App'

export default function RouteLayout() {
  const { leagueSlug } = useParams()
  const [league, setLeague] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadLeague = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('leagues')
        .select('id, slug, name, owner_email, is_public, day_of_week, description, requires_password, password, require_email, require_phone, show_email, show_phone, require_additional_player_info, default_open_holes, allow_b_groups, b_hole_unlock_sequence')
        .eq('slug', leagueSlug)
        .single()

      if (err) throw err
      if (!data) {
        setError('League not found')
        return
      }
      setLeague(data)
      setError(null)
    } catch (err) {
      console.error('Error loading league:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [leagueSlug])

  useEffect(() => {
    loadLeague()
  }, [loadLeague])

  useEffect(() => {
    function handleLeagueSettingsUpdated() {
      loadLeague()
    }

    window.addEventListener('league-settings-updated', handleLeagueSettingsUpdated)
    return () => window.removeEventListener('league-settings-updated', handleLeagueSettingsUpdated)
  }, [loadLeague])

  if (loading) {
    return (
      <div className="container">
        <main><p className="muted">Loading league...</p></main>
      </div>
    )
  }

  if (error || !league) {
    return (
      <div className="container">
        <main>
          <h2>League Not Found</h2>
          <p className="muted">{error || 'The league you are looking for does not exist.'}</p>
        </main>
      </div>
    )
  }

  return (
    <LeagueProvider league={league}>
      <App />
    </LeagueProvider>
  )
}
