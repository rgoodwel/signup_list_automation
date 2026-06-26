// ---------------------------------------------------------------------------
// storage.js — all localStorage helpers for signup_list_automation
// ---------------------------------------------------------------------------

const KEYS = {
  players: 'sla.players',       // { [email]: PlayerRecord }
  weeks:   'sla.weeks',         // { [weekKey]: WeekRecord }
  current: 'sla.currentWeekKey', // string | null
  pin:     'sla.adminPin',      // string | null
}

// ── ISO week key helpers ────────────────────────────────────────────────────

/** Return ISO year and week number for a Date object. */
function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return { year: d.getUTCFullYear(), week }
}

/** "2026-W26" from a Date. */
export function weekKeyFromDate(date = new Date()) {
  const { year, week } = isoWeek(date)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** "Week 26, 2026" from "2026-W26". */
export function weekKeyToLabel(key) {
  if (!key) return '—'
  const [year, w] = key.split('-W')
  return `Week ${parseInt(w, 10)}, ${year}`
}

/**
 * Compare two weekKeys chronologically.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareWeekKeys(a, b) {
  const [ay, aw] = a.split('-W').map(Number)
  const [by, bw] = b.split('-W').map(Number)
  return ay !== by ? ay - by : aw - bw
}

// ── Low-level read / write ──────────────────────────────────────────────────

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

// ── Migration from old flat-array schema ────────────────────────────────────

/**
 * If the old flat-array key exists, convert it to the new schema and remove it.
 */
export function migrateIfNeeded() {
  const OLD_KEY = 'signup_list_automation.signups'
  const raw = localStorage.getItem(OLD_KEY)
  if (!raw) return

  let oldSignups = []
  try { oldSignups = JSON.parse(raw) } catch { /* ignore */ }

  const players = read(KEYS.players, {})
  const weeks   = read(KEYS.weeks, {})

  // Put all old signups into a synthetic week "legacy"
  const legacyKey = 'legacy'
  if (!weeks[legacyKey]) {
    weeks[legacyKey] = { weekKey: legacyKey, label: 'Legacy (migrated)', signups: [], openedAt: null, closedAt: null }
  }

  for (const s of oldSignups) {
    const email = (s.email || '').trim().toLowerCase()
    if (!email) continue
    if (!players[email]) {
      players[email] = { id: s.id || Date.now(), name: s.name || email, email, weeksPlayed: [] }
    }
    if (!players[email].weeksPlayed.includes(legacyKey)) {
      players[email].weeksPlayed.push(legacyKey)
      weeks[legacyKey].signups.push({ email, name: s.name || email, signedUpAt: s.id || Date.now() })
    }
  }

  write(KEYS.players, players)
  write(KEYS.weeks, weeks)
  localStorage.removeItem(OLD_KEY)
}

// ── Players ─────────────────────────────────────────────────────────────────

export function getPlayers() {
  return read(KEYS.players, {})
}

/** Upsert a player. Updates name if already present. */
export function upsertPlayer({ name, email }) {
  const players = getPlayers()
  const key = email.trim().toLowerCase()
  if (!players[key]) {
    players[key] = { id: Date.now(), name: name.trim(), email: key, weeksPlayed: [] }
  } else {
    players[key].name = name.trim()
  }
  write(KEYS.players, players)
  return players[key]
}

// ── Weeks ───────────────────────────────────────────────────────────────────

export function getWeeks() {
  return read(KEYS.weeks, {})
}

export function getWeek(weekKey) {
  const weeks = getWeeks()
  return weeks[weekKey] || null
}

/** Open a new week; returns the new weekKey. Closes any previously open week. */
export function openWeek(weekKey) {
  const weeks = getWeeks()
  // Close any open week
  for (const k of Object.keys(weeks)) {
    if (!weeks[k].closedAt) weeks[k].closedAt = Date.now()
  }
  if (!weeks[weekKey]) {
    weeks[weekKey] = { weekKey, signups: [], openedAt: Date.now(), closedAt: null }
  } else {
    weeks[weekKey].closedAt = null   // re-open
    weeks[weekKey].openedAt = weeks[weekKey].openedAt || Date.now()
  }
  write(KEYS.weeks, weeks)
  write(KEYS.current, weekKey)
  return weekKey
}

/** Close the current week without opening a new one. */
export function closeCurrentWeek() {
  const key = getCurrentWeekKey()
  if (!key) return
  const weeks = getWeeks()
  if (weeks[key]) weeks[key].closedAt = Date.now()
  write(KEYS.weeks, weeks)
  write(KEYS.current, null)
}

// ── Current week ─────────────────────────────────────────────────────────────

export function getCurrentWeekKey() {
  return read(KEYS.current, null)
}

/**
 * Add a signup to the current week.
 * Returns { ok: true } or { ok: false, reason: string }.
 */
export function addSignupToWeek({ name, email }) {
  const weekKey = getCurrentWeekKey()
  if (!weekKey) return { ok: false, reason: 'Signups are currently closed. Please check back later or contact an administrator.' }

  const weeks = getWeeks()
  if (!weeks[weekKey]) return { ok: false, reason: 'Week record not found.' }

  const emailKey = email.trim().toLowerCase()
  const already = weeks[weekKey].signups.some(s => s.email === emailKey)
  if (already) return { ok: false, reason: "You're already signed up for this week!" }

  // Upsert player
  upsertPlayer({ name, email: emailKey })

  // Add to week
  weeks[weekKey].signups.push({ email: emailKey, name: name.trim(), signedUpAt: Date.now() })
  write(KEYS.weeks, weeks)

  // Track week in player record
  const players = getPlayers()
  if (players[emailKey] && !players[emailKey].weeksPlayed.includes(weekKey)) {
    players[emailKey].weeksPlayed.push(weekKey)
    write(KEYS.players, players)
  }

  return { ok: true }
}

// ── Admin PIN ────────────────────────────────────────────────────────────────

export function getAdminPin() {
  return read(KEYS.pin, null)
}

export function setAdminPin(pin) {
  write(KEYS.pin, pin)
}

// ── Computed stats ───────────────────────────────────────────────────────────

/**
 * For a player, compute:
 *   firstWeekKey, lastWeekKey, totalWeeks, currentStreak
 */
export function computePlayerStats(player, allWeekKeys) {
  const played = (player.weeksPlayed || []).filter(k => k !== 'legacy')
  if (played.length === 0) {
    const hasLegacy = (player.weeksPlayed || []).includes('legacy')
    return {
      firstWeekKey: hasLegacy ? 'legacy' : null,
      lastWeekKey:  hasLegacy ? 'legacy' : null,
      totalWeeks:   hasLegacy ? 1 : 0,
      currentStreak: 0,
    }
  }

  const sorted = [...played].sort(compareWeekKeys)
  const firstWeekKey = sorted[0]
  const lastWeekKey  = sorted[sorted.length - 1]
  const totalWeeks   = sorted.length

  // Streak: walk backwards through all known weeks and count consecutive played
  const sortedAll = [...allWeekKeys].filter(k => k !== 'legacy').sort(compareWeekKeys)
  const playedSet = new Set(played)
  let streak = 0
  for (let i = sortedAll.length - 1; i >= 0; i--) {
    if (playedSet.has(sortedAll[i])) streak++
    else break
  }

  return { firstWeekKey, lastWeekKey, totalWeeks, currentStreak: streak }
}
