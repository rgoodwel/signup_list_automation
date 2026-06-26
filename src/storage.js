// ---------------------------------------------------------------------------
// storage.js — all localStorage helpers for signup_list_automation
// ---------------------------------------------------------------------------

const KEYS = {
  players: 'sla.players',       // { [email]: PlayerRecord }
  weeks:   'sla.weeks',         // { [weekKey]: WeekRecord }
  current: 'sla.currentWeekKey', // string | null
  pin:     'sla.adminPin',      // string | null
}

export const HOLE_COUNT = 9
export const HOLE_CAPACITY = 4

/** Normalize a name for comparison: lowercase, collapsed whitespace. */
function normalizeName(n) {
  return (n || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Returns true when `name` contains at least two non-empty words
 * (first name + last name).
 */
export function isFullName(name) {
  return (name || '').trim().split(/\s+/).filter(Boolean).length >= 2
}

/**
 * Search all holes in a week for a player whose name matches `name`
 * (case-insensitive, whitespace-collapsed).
 * Returns the first `{ holeKey, player }` found, or null.
 */
function findPlayerNameInWeek(week, name) {
  const target = normalizeName(name)
  for (const [holeKey, players] of Object.entries(week.holes)) {
    for (const player of players) {
      if (normalizeName(player.name) === target) return { holeKey, player }
    }
  }
  return null
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createEmptyHoles() {
  const holes = {}
  for (let i = 1; i <= HOLE_COUNT; i++) holes[String(i)] = []
  return holes
}

function normalizeHole(value) {
  const n = parseInt(value, 10)
  if (Number.isNaN(n)) return null
  if (n < 1 || n > HOLE_COUNT) return null
  return String(n)
}

function ensureWeekHasHoles(week) {
  if (!week || typeof week !== 'object') return false
  let changed = false
  if (!week.holes || typeof week.holes !== 'object') {
    week.holes = createEmptyHoles()
    changed = true
  }
  for (let i = 1; i <= HOLE_COUNT; i++) {
    const key = String(i)
    if (!Array.isArray(week.holes[key])) {
      week.holes[key] = []
      changed = true
    }
  }

  if (week.holesInitialized) return changed

  const signups = Array.isArray(week.signups) ? week.signups : []
  let slotIndex = 0
  for (const signup of signups) {
    if (!signup.id) {
      signup.id = createId()
      changed = true
    }
    const groupNames = Array.isArray(signup.additionalPlayers) ? signup.additionalPlayers : []
    const members = [
      { name: signup.name, email: signup.email, isPrimary: true },
      ...groupNames.map(n => ({ name: n, email: null, isPrimary: false })),
    ]
    for (const member of members) {
      const hole = normalizeHole(signup.hole) || String(Math.floor(slotIndex / HOLE_CAPACITY) + 1)
      const holeKey = hole || String(HOLE_COUNT)
      if (!week.holes[holeKey]) week.holes[holeKey] = []
      if (week.holes[holeKey].length < HOLE_CAPACITY) {
        week.holes[holeKey].push({
          id: createId(),
          signupId: signup.id,
          isPrimary: member.isPrimary,
          name: member.name,
          email: member.email || null,
          signedUpAt: signup.signedUpAt || Date.now(),
        })
      }
      slotIndex++
    }
  }
  week.holesInitialized = true
  changed = true
  return changed
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
 * Only call this when isInSignupWindow() returns false.
 */
export function getNextWindowOpenDate(now = new Date()) {
  const p = getEasternParts(now)
  // Days until the next Tuesday:
  // Sun(0) after 3pm → +2, Mon(1) → +1, Tue(2) before 3pm → +0
  // (Tue after 3pm is in the open window and won't reach this branch in normal use)
  let daysUntilTue
  if (p.dayOfWeek === 0) daysUntilTue = 2
  else if (p.dayOfWeek === 1) daysUntilTue = 1
  else daysUntilTue = 0 // Tue before 3pm → opens today

  // Build a UTC timestamp for that Tuesday at 15:00 Eastern.
  // We determine the ET→UTC offset by formatting a reference UTC timestamp in
  // America/New_York and comparing the two representations numerically.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })

  // Target date: now + daysUntilTue, expressed as a YYYY-MM-DD in ET
  const scratch = new Date(now)
  scratch.setDate(scratch.getDate() + daysUntilTue)
  const tParts = Object.fromEntries(fmt.formatToParts(scratch).map(pt => [pt.type, pt.value]))
  const ty = parseInt(tParts.year, 10)
  const tm = parseInt(tParts.month, 10)
  const td = parseInt(tParts.day, 10)

  // Use a reference point (noon UTC on the target day) to measure the ET offset
  const refUTC = new Date(Date.UTC(ty, tm - 1, td, 12, 0, 0))
  const refParts = Object.fromEntries(fmt.formatToParts(refUTC).map(pt => [pt.type, pt.value]))
  const refEtAsUTC = Date.UTC(
    parseInt(refParts.year, 10), parseInt(refParts.month, 10) - 1, parseInt(refParts.day, 10),
    parseInt(refParts.hour, 10) % 24, parseInt(refParts.minute, 10), parseInt(refParts.second, 10),
  )
  // offsetMs is how many ms UTC is ahead of ET (positive for ET which is behind UTC)
  const offsetMs = refUTC.getTime() - refEtAsUTC

  // Tuesday 15:00 ET = Date.UTC(ty, tm-1, td, 15) + offsetMs
  return new Date(Date.UTC(ty, tm - 1, td, 15, 0, 0) + offsetMs)
}

/**
 * Return the ISO week key for the Sunday that ends the current signup window.
 * When the window is open (Tue–Sun), the closing Sunday is within the same
 * ISO week as Tuesday for most of the year.
 */
function windowWeekKey(now = new Date()) {
  const p = getEasternParts(now)
  // Days until the Sunday that ends the active signup window.
  // Sun=0, Mon=6 (only used when window is open), Tue=4, Wed=3, Thu=2, Fri=1, Sat=1.
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
  const weeks = read(KEYS.weeks, {})
  let changed = false
  for (const week of Object.values(weeks)) {
    if (ensureWeekHasHoles(week)) changed = true
  }
  if (changed) write(KEYS.weeks, weeks)
  return weeks
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
    weeks[weekKey] = {
      weekKey,
      signups: [],
      holes: createEmptyHoles(),
      holesInitialized: true,
      openedAt: Date.now(),
      closedAt: null,
    }
  } else {
    weeks[weekKey].closedAt = null   // re-open
    weeks[weekKey].openedAt = weeks[weekKey].openedAt || Date.now()
    ensureWeekHasHoles(weeks[weekKey])
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
export function addSignupToWeek({ name, email, hole, additionalPlayers = [] }) {
  const weekKey = getCurrentWeekKey()
  if (!weekKey) return { ok: false, reason: 'Signups are currently closed. Please check back later or contact an administrator.' }

  // Validate primary name
  if (!isFullName(name)) {
    return { ok: false, reason: 'Please enter your first and last name (e.g., "Jane Smith").' }
  }

  const weeks = getWeeks()
  if (!weeks[weekKey]) return { ok: false, reason: 'Week record not found.' }
  ensureWeekHasHoles(weeks[weekKey])

  const emailKey = email.trim().toLowerCase()
  const already = weeks[weekKey].signups.some(s => s.email === emailKey)
  if (already) return { ok: false, reason: "You're already signed up for this week!" }
  const holeKey = normalizeHole(hole)
  if (!holeKey) return { ok: false, reason: 'Please choose a valid hole.' }

  const rawExtras = additionalPlayers
    .map(p => p.trim())
    .filter(Boolean)
    .slice(0, 3)

  // Validate additional player names
  for (const extra of rawExtras) {
    if (!isFullName(extra)) {
      return {
        ok: false,
        reason: `"${extra}" — additional player names must include a first and last name (e.g., "John Smith").`,
      }
    }
  }

  // ── Duplicate detection ────────────────────────────────────────────────────
  // Check if the primary player's name already exists as a guest in this week.
  const primaryNameMatch = findPlayerNameInWeek(weeks[weekKey], name.trim())
  if (primaryNameMatch && !primaryNameMatch.player.isPrimary) {
    if (primaryNameMatch.holeKey === holeKey) {
      // Auto-group: upgrade the guest entry to a real primary signup.
      // Remove the guest slot so the capacity check uses the updated count.
      const hPlayers = weeks[weekKey].holes[holeKey]
      const guestIdx = hPlayers.findIndex(p => p.id === primaryNameMatch.player.id)
      if (guestIdx >= 0) hPlayers.splice(guestIdx, 1)
      // Remove from the parent signup's additionalPlayers list.
      const parentSignup = weeks[weekKey].signups.find(s => s.id === primaryNameMatch.player.signupId)
      if (parentSignup && Array.isArray(parentSignup.additionalPlayers)) {
        parentSignup.additionalPlayers = parentSignup.additionalPlayers.filter(
          n => normalizeName(n) !== normalizeName(name.trim())
        )
      }
    } else {
      return {
        ok: false,
        reason: `${name.trim()} is already signed up as a guest on Hole ${primaryNameMatch.holeKey}. Please manage the duplicate manually.`,
      }
    }
  }

  // Check each additional player against all players already on the week.
  const extras = []
  for (const extra of rawExtras) {
    const match = findPlayerNameInWeek(weeks[weekKey], extra)
    if (match) {
      if (match.holeKey === holeKey) {
        // Already on the same hole — auto-group by skipping the duplicate add.
      } else {
        return {
          ok: false,
          reason: `${extra} is already signed up on Hole ${match.holeKey}. Please remove them from additional players or manage the duplicate manually.`,
        }
      }
    } else {
      extras.push(extra)
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  const groupSize = 1 + extras.length
  const holePlayers = weeks[weekKey].holes[holeKey] || []
  if (holePlayers.length + groupSize > HOLE_CAPACITY) {
    return {
      ok: false,
      reason: `Hole ${holeKey} does not have enough space for ${groupSize} player(s).`,
    }
  }

  const signedUpAt = Date.now()
  const signupId = createId()

  // Upsert player
  upsertPlayer({ name, email: emailKey })

  // Add to week
  weeks[weekKey].signups.push({
    id: signupId,
    hole: holeKey,
    email: emailKey,
    name: name.trim(),
    additionalPlayers: extras,
    signedUpAt,
  })
  weeks[weekKey].holes[holeKey].push({
    id: createId(),
    signupId,
    isPrimary: true,
    name: name.trim(),
    email: emailKey,
    signedUpAt,
  })
  for (const extra of extras) {
    weeks[weekKey].holes[holeKey].push({
      id: createId(),
      signupId,
      isPrimary: false,
      name: extra,
      email: null,
      signedUpAt,
    })
  }
  write(KEYS.weeks, weeks)

  // Track week in player record
  const players = getPlayers()
  if (players[emailKey] && !players[emailKey].weeksPlayed.includes(weekKey)) {
    players[emailKey].weeksPlayed.push(weekKey)
    write(KEYS.players, players)
  }

  return { ok: true }
}

export function removePlayerFromHole({ weekKey, hole, playerId }) {
  const weeks = getWeeks()
  const week = weeks[weekKey]
  if (!week) return { ok: false, reason: 'Week record not found.' }
  ensureWeekHasHoles(week)

  const holeKey = normalizeHole(hole)
  if (!holeKey) return { ok: false, reason: 'Invalid hole.' }
  const playersOnHole = week.holes[holeKey] || []
  const index = playersOnHole.findIndex(p => p.id === playerId)
  if (index < 0) return { ok: false, reason: 'Player not found on hole.' }

  const [removed] = playersOnHole.splice(index, 1)
  if (removed?.isPrimary && removed.email) {
    week.signups = week.signups.filter(s => s.email !== removed.email)
  } else if (removed?.signupId) {
    const signup = week.signups.find(s => s.id === removed.signupId)
    if (signup && Array.isArray(signup.additionalPlayers)) {
      signup.additionalPlayers = signup.additionalPlayers.filter(n => n !== removed.name)
    }
  }

  write(KEYS.weeks, weeks)
  return { ok: true }
}

export function movePlayerBetweenHoles({ weekKey, fromHole, toHole, playerId }) {
  const weeks = getWeeks()
  const week = weeks[weekKey]
  if (!week) return { ok: false, reason: 'Week record not found.' }
  ensureWeekHasHoles(week)

  const fromKey = normalizeHole(fromHole)
  const toKey = normalizeHole(toHole)
  if (!fromKey || !toKey) return { ok: false, reason: 'Invalid hole.' }
  if (fromKey === toKey) return { ok: true }

  const fromPlayers = week.holes[fromKey] || []
  const toPlayers = week.holes[toKey] || []
  if (toPlayers.length >= HOLE_CAPACITY) {
    return { ok: false, reason: `Hole ${toKey} is full.` }
  }

  const index = fromPlayers.findIndex(p => p.id === playerId)
  if (index < 0) return { ok: false, reason: 'Player not found on hole.' }

  const [moved] = fromPlayers.splice(index, 1)
  toPlayers.push(moved)

  if (moved.isPrimary && moved.signupId) {
    const signup = week.signups.find(s => s.id === moved.signupId)
    if (signup) signup.hole = toKey
  }

  write(KEYS.weeks, weeks)
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
