import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './utils/supabaseClient'
import signupIntroVideo from '../Golf League Sign Up Feature Demo.mp4'

export default function LeagueSelector() {
  const [leagues, setLeagues] = useState([])
  const [stats, setStats] = useState({ leagueCount: 0, playerSignupCount: 0 })
  const [showIntroVideo, setShowIntroVideo] = useState(false)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    async function loadLeagues() {
      try {
        const [publicLeaguesResult, allLeaguesResult] = await Promise.all([
          supabase
            .from('leagues')
            .select('id, slug, name, requires_password, is_public')
            .eq('is_public', true)
            .order('name'),
          supabase
            .from('leagues')
            .select('id, name')
            .neq('name', 'Test League'),
        ])

        if (publicLeaguesResult.error) throw publicLeaguesResult.error
        if (allLeaguesResult.error) throw allLeaguesResult.error

        const publicLeagues = publicLeaguesResult.data || []
        const allLeagues = allLeaguesResult.data || []

        setLeagues(publicLeagues)

        const leagueIds = allLeagues.map(league => league.id)
        let playerSignupCount = 0
        if (leagueIds.length > 0) {
          const { count, error: playerCountError } = await supabase
            .from('weekly_players')
            .select('id', { count: 'exact', head: true })
            .in('league_id', leagueIds)

          if (playerCountError) throw playerCountError
          playerSignupCount = count || 0
        }

        setStats({
          leagueCount: allLeagues.length,
          playerSignupCount,
        })
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
        <div style={{ marginTop: '14px' }}>
          <p className="muted" style={{ marginBottom: '10px' }}>
            This app helps leagues manage weekly signups, assign players to hole groups, and administer week-by-week operations from one place.
          </p>
          <button
            type="button"
            className="intro-video-link"
            onClick={() => setShowIntroVideo(true)}
          >
            Signup Demo & Features Video
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '16px' }}>
          <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px', background: '#fff' }}>
            <div className="muted" style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.04em' }}>Total Leagues</div>
            <div style={{ fontSize: '28px', fontWeight: 700, lineHeight: 1.2 }}>{stats.leagueCount}</div>
            <div className="muted" style={{ fontSize: '12px' }}>Public and Private Leagues</div>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px', background: '#fff' }}>
            <div className="muted" style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.04em' }}>Total Players Signed Up</div>
            <div style={{ fontSize: '28px', fontWeight: 700, lineHeight: 1.2 }}>{stats.playerSignupCount}</div>
            <div className="muted" style={{ fontSize: '12px' }}>All-time signups across leagues</div>
          </div>
        </div>
      </header>
      <main style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '24px' }}>
        <p className="muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
          Public Leagues
        </p>
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
            <div>{league.name}</div>
            <div style={{ fontSize: '12px', fontWeight: 400, marginTop: '8px', opacity: 0.7 }}>
              {league.requires_password ? 'Password Protected' : 'Open Signup'}
            </div>
          </button>
        ))}

        {showIntroVideo && (
          <div className="intro-video-modal-overlay" onClick={() => setShowIntroVideo(false)}>
            <div className="intro-video-modal-card" onClick={e => e.stopPropagation()}>
              <div className="intro-video-modal-header">
                <h2>Application Walkthrough</h2>
                <button
                  type="button"
                  className="intro-video-modal-close"
                  aria-label="Close video"
                  onClick={() => setShowIntroVideo(false)}
                >
                  Close
                </button>
              </div>
              <p className="muted intro-video-modal-copy">
                Learn how to sign up players, add additional golfers, and move players/holes.
              </p>
              <video className="intro-video" controls preload="metadata" autoPlay>
                <source src={signupIntroVideo} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
