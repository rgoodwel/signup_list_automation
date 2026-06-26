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

// ── Signup window schedule (Tue 3pm ET → Sun 3pm ET) ────────────────────────

/**
 * Return the current date/time broken into parts in the America/New_York
 * timezone (handles EST/EDT automatically via the browser's Intl engine).
 */
function getEasternParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
    weekday: 'narrow', // S M T W T F S
  })
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]))
  return {
    // weekday narrow: Sun→'S', Mon→'M', Tue→'T', Wed→'W', Thu→'T', Fri→'F', Sat→'S'
    // Use numeric day-of-week instead for reliability
    dayOfWeek: new Date(
      parseInt(parts.year),
      parseInt(parts.month) - 1,
      parseInt(parts.day),
    ).getDay(), // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
    hour: parseInt(parts.hour, 10) % 24, // Intl hour12:false can return '24'
    minute: parseInt(parts.minute, 10),
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
  }
}

/**
 * Returns true when signups should be OPEN:
 *   Tuesday 15:00 ET (inclusive) → Sunday 15:00 ET (exclusive)
 * Returns false during the locked window:
 *   Sunday 15:00 ET → Tuesday 15:00 ET
 */
export function isInSignupWindow(now = new Date()) {
  const { dayOfWeek, hour } = getEasternParts(now)
  // LOCKED: Sun after 3pm, all day Mon, Tue before 3pm
  const locked =
    (dayOfWeek === 0 && hour >= 15) ||   // Sunday ≥ 3pm ET
    (dayOfWeek === 1) ||                  // Monday (all day)
    (dayOfWeek === 2 && hour < 15)        // Tuesday < 3pm ET
  return !locked
}

/**
 * Returns a Date representing the next time signups will open (Tue 3pm ET).
 * Useful for the "check back" message shown to players during the locked window.
 */
export function getNextWindowOpenDate(now = new Date()) {
  const p = getEasternParts(now)
  // Calculate how many days until the next Tuesday
  // dayOfWeek: 0=Sun,1=Mon,2=Tue,...
  // If today is Sun after 3pm → 2 days to next Tue
  // If today is Mon → 1 day to next Tue
  // If today is Tue before 3pm → 0 days (today)
  let daysUntilTue
  if (p.dayOfWeek === 0) daysUntilTue = 2        // Sun → +2
  else if (p.dayOfWeek === 1) daysUntilTue = 1   // Mon → +1
  else daysUntilTue = 0                           // Tue before 3pm → today

  // Build a UTC timestamp for that Tuesday at 15:00 Eastern.
  // We do this by creating a local-midnight Date in ET, then offsetting.
  // Simplest portable approach: use the Intl offset trick.
  const targetDate = new Date(now)
  targetDate.setDate(targetDate.getDate() + daysUntilTue)

  // Format the target date as YYYY-MM-DD in ET and append T15:00 ET
  const etFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const [y, m, d] = etFmt.format(targetDate).split('-').map(Number)

  // Create a Date that represents that day at 15:00 ET using the offset approach:
  // Get the UTC offset for ET on that date by formatting a known UTC midnight.
  const midnight = new Date(Date.UTC(y, m - 1, d, 0, 0, 0))
  const etMidnightStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(midnight)
  const etHour = parseInt(etMidnightStr.find(p => p.type === 'hour').value, 10) % 24
  const utcOffsetHours = etHour === 0 ? 0 : (24 - etHour) // hours behind UTC (4 or 5)
  const targetUTC = Date.UTC(y, m - 1, d, 15 + utcOffsetHours, 0, 0)
  return new Date(targetUTC)
}

/**
 * Return the ISO week key for the Sunday that ends the current signup window.
 * When the window is open (Tue–Sun), the closing Sunday is within the same
 * ISO week as Tuesday for most of the year.
 */
function windowWeekKey(now = new Date()) {
  const p = getEasternParts(now)
  // Days until Sunday: 0=Sun→0, 1=Mon→6 (shouldn't be called when locked)
  // 2=Tue→4 days ahead, 3=Wed→3, 4=Thu→2, 5=Fri→1, 6=Sat→0 (same week Sun already passed — use next Sun)
  // Actually: Sun=0→already Sunday; Tue=2→+4; Wed=3→+3; Thu=4→+2; Fri=5→+1; Sat=6→+1 (next Sun)
  const daysMap = [0, 6, 4, 3, 2, 1, 1]
  const daysToSunday = daysMap[p.dayOfWeek]
  const sunday = new Date(now)
  sunday.setDate(sunday.getDate() + daysToSunday)
  return weekKeyFromDate(sunday)
}

/**
 * If the signup window is currently open and no week is active (or the stored
 * week was closed), automatically open a week for this window period.
 * Returns the active weekKey (existing or newly opened).
 */
export function autoOpenWeekIfNeeded() {
  if (!isInSignupWindow()) return null
  const current = getCurrentWeekKey()
  const weeks = getWeeks()
  // If a week is already open, use it
  if (current && weeks[current] && !weeks[current].closedAt) return current
  // Open the week keyed to the Sunday that ends this window
  const key = windowWeekKey()
  return openWeek(key)
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

