// src/storage.js

const WEEKS_KEY = 'signup.weeks.v2'
const CURRENT_WEEK_KEY = 'signup.currentWeek.v2'
const PROFILES_KEY = 'signup.playerProfiles.v1'

export const HOLE_COUNT = 9
export const HOLE_CAPACITY = 4
export const B_GROUP_THRESHOLD = 37 // 37th+ player enables B groups

export function weekKeyFromDate(d = new Date()) {
  // ISO week number
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
  const year = date.getUTCFullYear()
  return `${year}-W${String(weekNo).padStart(2, '0')}`
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

export function weekKeyToRoundDateLabel(key) {
  if (!key) return '—'
  const [yearRaw, weekRaw] = key.split('-W')
  const year = parseInt(yearRaw, 10)
  const week = parseInt(weekRaw, 10)
  if (!year || !week) return '—'

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

// --- NEW: safe fallback auto-open ---
// If no usable current week exists, create/open the current ISO week.
// This prevents player page from becoming non-functional after lock-flow changes.
export function ensureCurrentWeekOpen() {
  const current = getCurrentWeekKey()
  const weeks = getWeeks()

  if (current && weeks[current] && !weeks[current].closedAt) {
    return current
  }

  const key = weekKeyFromDate(new Date())
  if (!weeks[key]) {
    weeks[key] = { key, createdAt: Date.now(), closedAt: null, holes: makeEmptyHoles() }
    setWeeks(weeks)
  } else if (weeks[key].closedAt) {
    weeks[key].closedAt = null
    setWeeks(weeks)
  }

  setCurrentWeekKey(key)
  return key
}

function makeEmptyHoles() {
  const holes = {}
  for (let i = 1; i <= HOLE_COUNT; i++) holes[String(i)] = []
  return holes
}

function getJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function setJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function getWeeks() {
  return getJson(WEEKS_KEY, {})
}
export function setWeeks(weeks) {
  setJson(WEEKS_KEY, weeks)
}

export function getCurrentWeekKey() {
  return localStorage.getItem(CURRENT_WEEK_KEY)
}
export function setCurrentWeekKey(key) {
  if (!key) localStorage.removeItem(CURRENT_WEEK_KEY)
  else localStorage.setItem(CURRENT_WEEK_KEY, key)
}

export function getWeek(key) {
  const weeks = getWeeks()
  return weeks[key] || null
}

export function openWeek(key) {
  const weeks = getWeeks()
  if (!weeks[key]) {
    weeks[key] = { key, createdAt: Date.now(), closedAt: null, holes: makeEmptyHoles() }
  } else {
    weeks[key].closedAt = null
    if (!weeks[key].holes) weeks[key].holes = makeEmptyHoles()
  }
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

export function addSignupToWeek(weekKey, player, hole) {
  const weeks = getWeeks()
  const wk = weeks[weekKey]
  if (!wk) throw new Error('Week not found')
  if (wk.closedAt) throw new Error('Week is closed')

  const holeKey = String(hole || '1')
  if (!wk.holes[holeKey]) wk.holes[holeKey] = []
  if (wk.holes[holeKey].length >= HOLE_CAPACITY) throw new Error(`Hole ${holeKey} is full`)

  wk.holes[holeKey].push(player)
  weeks[weekKey] = wk
  setWeeks(weeks)
}

export function movePlayerBetweenHoles(weekKey, fromHole, fromIndex, toHole) {
  const weeks = getWeeks()
  const wk = weeks[weekKey]
  if (!wk) throw new Error('Week not found')
  if (wk.closedAt) throw new Error('Week is closed')

  const a = wk.holes[String(fromHole)] || []
  const bKey = String(toHole)
  if (!wk.holes[bKey]) wk.holes[bKey] = []
  const b = wk.holes[bKey]

  if (fromIndex < 0 || fromIndex >= a.length) throw new Error('Invalid player index')
  if (b.length >= HOLE_CAPACITY) throw new Error(`Hole ${bKey} is full`)

  const [player] = a.splice(fromIndex, 1)
  b.push(player)

  weeks[weekKey] = wk
  setWeeks(weeks)
}

export function removePlayerFromHole(weekKey, hole, index) {
  const weeks = getWeeks()
  const wk = weeks[weekKey]
  if (!wk) throw new Error('Week not found')
  if (wk.closedAt) throw new Error('Week is closed')

  const arr = wk.holes[String(hole)] || []
  if (index < 0 || index >= arr.length) throw new Error('Invalid player index')
  arr.splice(index, 1)

  weeks[weekKey] = wk
  setWeeks(weeks)
}

export function areBGroupsUnlocked(week) {
  if (!week?.holes) return false
  const totalPlayers = Object.values(week.holes).reduce((sum, arr) => sum + (arr?.length || 0), 0)
  return totalPlayers >= B_GROUP_THRESHOLD
}

export function isFullName(name) {
  return /\S+\s+\S+/.test((name || '').trim())
}

// optional profile helpers (kept as-is if used by your UI)
export function getProfiles() {
  return getJson(PROFILES_KEY, {})
}
export function setProfiles(p) {
  setJson(PROFILES_KEY, p)
}