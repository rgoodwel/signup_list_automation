const WEEKS_KEY = 'sla_weeks'
const CURRENT_WEEK_KEY = 'sla_current_week'
const PLAYERS_KEY = 'sla_players'

export const HOLE_COUNT = 9
export const HOLE_CAPACITY = 4
export const B_GROUP_THRESHOLD = 37

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function weekKeyFromDate(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

export function weekKeyToLabel(key) {
  if (!key) return '—'
  const [year, w] = key.split('-W')
  return `Week ${parseInt(w, 10)}, ${year}`
}

function ordinalSuffix(n) {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return 'th'
  const mod10 = n % 10
  if (mod10 === 1) return 'st'
  if (mod10 === 2) return 'nd'
  if (mod10 === 3) return 'rd'
  return 'th'
}

// IMPORTANT: this export is used by SignupForm.jsx
export function weekKeyToRoundDateLabel(key) {
  if (!key) return null
  const [yearRaw, weekRaw] = key.split('-W')
  const year = Number(yearRaw)
  const week = Number(weekRaw)
  if (!year || !week) return null

  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1)

  const roundMonday = new Date(week1Monday)
  roundMonday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7 + 7)

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).formatToParts(roundMonday)

  const weekday = parts.find(p => p.type === 'weekday')?.value || 'Monday'
  const month = parts.find(p => p.type === 'month')?.value || 'January'
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '1', 10)
  return `${weekday} ${month} ${day}${ordinalSuffix(day)}`
}

export function compareWeekKeys(a, b) {
  const [ay, aw] = a.split('-W').map(Number)
  const [by, bw] = b.split('-W').map(Number)
  return ay !== by ? ay - by : aw - bw
}

export function getWeeks() {
  return readJson(WEEKS_KEY, {})
}
export function setWeeks(weeks) {
  writeJson(WEEKS_KEY, weeks)
}

export function getCurrentWeekKey() {
  return localStorage.getItem(CURRENT_WEEK_KEY)
}
export function setCurrentWeekKey(key) {
  if (!key) localStorage.removeItem(CURRENT_WEEK_KEY)
  else localStorage.setItem(CURRENT_WEEK_KEY, key)
}

function makeEmptyHoles() {
  const holes = {}
  for (let i = 1; i <= HOLE_COUNT; i++) holes[String(i)] = []
  return holes
}

export function openWeek(key) {
  const weeks = getWeeks()
  if (!weeks[key]) weeks[key] = { key, holes: makeEmptyHoles(), closedAt: null }
  weeks[key].closedAt = null
  if (!weeks[key].holes) weeks[key].holes = makeEmptyHoles()
  setWeeks(weeks)
  setCurrentWeekKey(key)
  return key
}

export function closeWeek(key) {
  if (!key) return
  const weeks = getWeeks()
  if (!weeks[key]) return
  weeks[key].closedAt = Date.now()
  setWeeks(weeks)
}

export function getWeek(key) {
  const weeks = getWeeks()
  return key ? weeks[key] || null : null
}

export function addSignupToWeek(weekKey, player, holeKey = '1') {
  const weeks = getWeeks()
  const week = weeks[weekKey]
  if (!week) throw new Error('Week not found')
  if (week.closedAt) throw new Error('Signups are closed')

  if (!week.holes) week.holes = makeEmptyHoles()
  const key = String(holeKey)
  if (!week.holes[key]) week.holes[key] = []
  if (week.holes[key].length >= HOLE_CAPACITY) throw new Error(`Hole ${key} is full`)

  week.holes[key].push(player)
  weeks[weekKey] = week
  setWeeks(weeks)
}

export function movePlayerBetweenHoles(weekKey, fromHole, fromIdx, toHole) {
  const weeks = getWeeks()
  const week = weeks[weekKey]
  if (!week) throw new Error('Week not found')
  if (week.closedAt) throw new Error('Signups are closed')

  const a = week.holes?.[String(fromHole)] || []
  const bKey = String(toHole)
  if (!week.holes[bKey]) week.holes[bKey] = []
  const b = week.holes[bKey]

  if (fromIdx < 0 || fromIdx >= a.length) throw new Error('Invalid index')
  if (b.length >= HOLE_CAPACITY) throw new Error(`Hole ${bKey} is full`)

  const [p] = a.splice(fromIdx, 1)
  b.push(p)
  setWeeks(weeks)
}

export function removePlayerFromHole(weekKey, hole, idx) {
  const weeks = getWeeks()
  const week = weeks[weekKey]
  if (!week) throw new Error('Week not found')
  if (week.closedAt) throw new Error('Signups are closed')

  const arr = week.holes?.[String(hole)] || []
  if (idx < 0 || idx >= arr.length) throw new Error('Invalid index')
  arr.splice(idx, 1)
  setWeeks(weeks)
}

export function areBGroupsUnlocked(week) {
  const total = Object.values(week?.holes || {}).reduce((n, a) => n + (a?.length || 0), 0)
  return total >= B_GROUP_THRESHOLD
}

export function isFullName(name) {
  return /\S+\s+\S+/.test(String(name || '').trim())
}

export function getPlayers() {
  return readJson(PLAYERS_KEY, {})
}
export function setPlayers(players) {
  writeJson(PLAYERS_KEY, players)
}