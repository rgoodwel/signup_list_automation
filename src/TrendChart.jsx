import React, { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { weekKeyToLabel, compareWeekKeys } from './storage'

export default function TrendChart({ weeks, players }) {
  const totalPlayers = Object.keys(players).length
  const totalWeeks   = Object.keys(weeks).filter(k => k !== 'legacy').length

  const chartData = useMemo(() => {
    return Object.values(weeks)
      .filter(w => w.weekKey !== 'legacy')
      .sort((a, b) => compareWeekKeys(a.weekKey, b.weekKey))
      .map(w => ({
        label: weekKeyToLabel(w.weekKey),
        signups: w.signups.length,
      }))
  }, [weeks])

  return (
    <div className="panel">
      <h2>Participation Over Time</h2>

      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-value">{totalPlayers}</span>
          <span className="stat-label">Total Players</span>
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
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="label"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                angle={-40}
                textAnchor="end"
                interval={0}
              />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#0b1220', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}
                labelStyle={{ color: '#60a5fa' }}
                itemStyle={{ color: '#e6eef8' }}
              />
              <Bar dataKey="signups" fill="#60a5fa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
