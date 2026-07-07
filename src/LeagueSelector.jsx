import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './utils/supabaseClient'

export default function LeagueSelector() {
  const [leagues, setLeagues] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    async function loadLeagues() {
      try {
        const { data, error } = await supabase
          .from('leagues')
          .select('id, slug, name')
          .order('name')
        
        if (error) throw error
        setLeagues(data || [])
      } catch (err) {
        console.error('Error loading leagues:', err)
      } finally {
        setLoading(false)
      }
    }
    loadLeagues()
  }, [])

  if (loading) {
    return (
      <div className="container">
        <main><p className="muted">Loading leagues...</p></main>
      </div>
    )
  }

  if (leagues.length === 0) {
    return (
      <div className="container">
        <main>
          <h2>No Leagues Available</h2>
          <p className="muted">Please contact an administrator.</p>
        </main>
      </div>
    )
  }

  // If only one league, redirect directly
  if (leagues.length === 1) {
    navigate(`/leagues/${leagues[0].slug}`, { replace: true })
    return null
  }

  return (
    <div className="container">
      <header>
        <h1>Golf Leagues</h1>
        <p className="muted">Select a league to continue.</p>
      </header>
      <main style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '24px' }}>
        {leagues.map(league => (
          <button
            key={league.id}
            onClick={() => navigate(`/leagues/${league.slug}`)}
            style={{
              padding: '24px',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              background: '#fff',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--accent)',
              transition: 'all .15s'
            }}
            onMouseEnter={e => {
              e.target.style.background = 'var(--accent)'
              e.target.style.color = '#fff'
            }}
            onMouseLeave={e => {
              e.target.style.background = '#fff'
              e.target.style.color = 'var(--accent)'
            }}
          >
            {league.name}
          </button>
        ))}
      </main>
    </div>
  )
}
