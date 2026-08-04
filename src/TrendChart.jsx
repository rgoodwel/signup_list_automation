import React, { useEffect, useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { weekKeyToLabel, compareWeekKeys } from './storage'
import { supabase } from './utils/supabaseClient'
import { useLeague } from './contexts/LeagueContext'

function normalizeName(value) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export default function TrendChart({ weeks, players }) {
  const league = useLeague()
  const totalWeeks   = Object.keys(weeks).filter(k => k !== 'legacy').length
  const [kpis, setKpis] = useState({
    totalPlayers: 0,
    totalPrimaryPlayers: 0,
    totalGuests: 0,
  })
  const [signupCounts, setSignupCounts] = useState({})

  // Fetch signup counts for all weeks
  useEffect(() => {
    async function fetchSignups() {
      try {
        if (!league?.id) return
        const weekKeys = Object.keys(weeks).filter(k => k !== 'legacy')
        if (weekKeys.length === 0) {
          setSignupCounts({})
          setKpis({ totalPlayers: 0, totalPrimaryPlayers: 0, totalGuests: 0 })
          return
        }

        // Fetch all signups for these weeks (filtered by current league)
        const { data, error } = await supabase
          .from('weekly_players')
          .select('week_number, id, signup_id, player_name, player_email')
          .eq('league_id', league.id)
          .in('week_number', weekKeys)
          .order('id', { ascending: true })

        if (error) throw error

        const nameToEmails = new Map()
        for (const record of (data || [])) {
          const normalizedName = normalizeName(record.player_name)
          const email = record.player_email?.trim().toLowerCase() || null
          if (!normalizedName || !email) continue
          if (!nameToEmails.has(normalizedName)) {
            nameToEmails.set(normalizedName, new Set())
          }
          nameToEmails.get(normalizedName).add(email)
        }

        // Count primary vs guest signups by week.
        // A signup group is identified by signup_id; the first row in each group is primary,
        // remaining rows in that group are treated as guests.
        const counts = {}
        const seenSignupGroups = new Set()
        const uniquePeople = new Set()

        for (const record of (data || [])) {
          const weekKey = record.week_number
          const normalizedName = normalizeName(record.player_name)
          const email = record.player_email?.trim().toLowerCase() || null
          const emailsForName = nameToEmails.get(normalizedName)
          const canonicalEmail = !email && emailsForName && emailsForName.size === 1
            ? Array.from(emailsForName)[0]
            : null
          const resolvedEmail = email || canonicalEmail
          const identityKey = resolvedEmail || `guest:${normalizedName}`

          if (identityKey !== 'guest:') {
            uniquePeople.add(identityKey)
          }

          if (!counts[weekKey]) {
            counts[weekKey] = { primary: 0, guests: 0, total: 0 }
          }

          counts[weekKey].total += 1

          if (!record.signup_id) {
            counts[weekKey].primary += 1
            continue
          }

          const groupKey = `${weekKey}:${record.signup_id}`
          if (!seenSignupGroups.has(groupKey)) {
            seenSignupGroups.add(groupKey)
            counts[weekKey].primary += 1
          } else {
            counts[weekKey].guests += 1
          }
        }

        setSignupCounts(counts)

        const totals = Object.values(counts).reduce((acc, weekCounts) => {
          acc.totalPlayers += weekCounts.total || 0
          acc.totalPrimaryPlayers += weekCounts.primary || 0
          acc.totalGuests += weekCounts.guests || 0
          return acc
        }, { totalPlayers: 0, totalPrimaryPlayers: 0, totalGuests: 0 })

        totals.totalPlayers = uniquePeople.size

        setKpis(totals)
      } catch (err) {
        console.error('Error fetching signup counts:', err)
        setSignupCounts({})
        setKpis({ totalPlayers: 0, totalPrimaryPlayers: 0, totalGuests: 0 })
      }
    }

    fetchSignups()
  }, [weeks, league?.id])

  const chartData = useMemo(() => {
    try {
      return Object.values(weeks)
        .filter(w => w && w.week_key && w.week_key !== 'legacy')
        .sort((a, b) => compareWeekKeys(a.week_key, b.week_key))
        .map(w => ({
          label: weekKeyToLabel(w.week_key),
          primaryPlayers: signupCounts[w.week_key]?.primary || 0,
          guestPlayers: signupCounts[w.week_key]?.guests || 0,
          totalPlayers: signupCounts[w.week_key]?.total || 0,
        }))
    } catch (err) {
      console.error('Error building chart data:', err)
      return []
    }
  }, [weeks, signupCounts])

  return (
    <div className="panel">
      <h2>Participation Over Time</h2>

      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-value">{kpis.totalPlayers}</span>
          <span className="stat-label">Total Players</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{kpis.totalPrimaryPlayers}</span>
          <span className="stat-label">Total Primary Players</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{kpis.totalGuests}</span>
          <span className="stat-label">Total Guests</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{totalWeeks}</span>
          <span className="stat-label">Weeks Tracked</span>
        </div>
      </div>

      {chartData.length === 0 ? (
        <p className="empty">No week data to chart yet.</p>
      ) : (
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 12, left: -16, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,40,60,0.14)" />
              <XAxis
                dataKey="label"
                tick={{ fill: '#6a707a', fontSize: 11 }}
                angle={-40}
                textAnchor="end"
                interval={0}
              />
              <YAxis tick={{ fill: '#6a707a', fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid rgba(20,40,60,0.14)', borderRadius: 8 }}
                labelStyle={{ color: '#1f3d5c' }}
                itemStyle={{ color: '#1b2430' }}
              />
              <Legend verticalAlign="top" height={28} />
              <Bar name="Primary Players" dataKey="primaryPlayers" fill="#1f3d5c" radius={[4, 4, 0, 0]} />
              <Bar name="Guests" dataKey="guestPlayers" fill="#b2702d" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}