import React, { useState, useEffect } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { supabase } from './utils/supabaseClient'
import { LeagueProvider } from './contexts/LeagueContext'
import App from './App'

export default function RouteLayout() {
  const { leagueSlug } = useParams()
  const [league, setLeague] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadLeague() {
      try {
        const { data, error: err } = await supabase
          .from('leagues')
          .select('id, slug, name, owner_email, day_of_week, description, requires_password, password, require_email, require_phone')
          .eq('slug', leagueSlug)
          .single()

        if (err) throw err
        if (!data) {
          setError('League not found')
          return
        }
        setLeague(data)
      } catch (err) {
        console.error('Error loading league:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    loadLeague()
  }, [leagueSlug])

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
