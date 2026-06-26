import React from 'react'
import ExcelJS from 'exceljs'
import { weekKeyToLabel, compareWeekKeys, computePlayerStats } from './storage'

function today() {
  return new Date().toISOString().slice(0, 10)
}

async function downloadWorkbook(wb, filename) {
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function exportPlayerSummary(players, weeks) {
  const allWeekKeys = Object.keys(weeks)
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Player Summary')

  ws.columns = [
    { header: 'Name',           key: 'name',          width: 24 },
    { header: 'Email',          key: 'email',         width: 30 },
    { header: 'First Week',     key: 'firstWeek',     width: 18 },
    { header: 'Last Week',      key: 'lastWeek',      width: 18 },
    { header: 'Total Weeks',    key: 'totalWeeks',    width: 14 },
    { header: 'Current Streak', key: 'currentStreak', width: 16 },
  ]

  // Bold header row
  ws.getRow(1).font = { bold: true }

  const sorted = Object.values(players).sort((a, b) =>
    a.name.localeCompare(b.name)
  )

  for (const p of sorted) {
    const stats = computePlayerStats(p, allWeekKeys)
    ws.addRow({
      name:          p.name,
      email:         p.email,
      firstWeek:     weekKeyToLabel(stats.firstWeekKey),
      lastWeek:      weekKeyToLabel(stats.lastWeekKey),
      totalWeeks:    stats.totalWeeks,
      currentStreak: stats.currentStreak,
    })
  }

  await downloadWorkbook(wb, `player-summary-${today()}.xlsx`)
}

async function exportFullHistory(weeks) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Full History')

  ws.columns = [
    { header: 'Week',       key: 'week',      width: 18 },
    { header: 'Name',       key: 'name',      width: 24 },
    { header: 'Email',      key: 'email',     width: 30 },
    { header: 'Signed Up At', key: 'signedAt', width: 22 },
  ]

  ws.getRow(1).font = { bold: true }

  const sortedWeeks = Object.values(weeks).sort((a, b) => {
    if (a.weekKey === 'legacy') return -1
    if (b.weekKey === 'legacy') return 1
    return compareWeekKeys(a.weekKey, b.weekKey)
  })

  for (const w of sortedWeeks) {
    for (const s of w.signups) {
      ws.addRow({
        week:     weekKeyToLabel(w.weekKey),
        name:     s.name,
        email:    s.email,
        signedAt: new Date(s.signedUpAt).toLocaleString(),
      })
    }
  }

  await downloadWorkbook(wb, `full-history-${today()}.xlsx`)
}

export default function ExportButtons({ players, weeks }) {
  return (
    <div className="panel">
      <h2>Export</h2>
      <div className="export-row">
        <button
          className="btn btn-primary"
          onClick={() => exportPlayerSummary(players, weeks)}
        >
          ⬇ Player Summary (.xlsx)
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => exportFullHistory(weeks)}
        >
          ⬇ Full History (.xlsx)
        </button>
      </div>
    </div>
  )
}
