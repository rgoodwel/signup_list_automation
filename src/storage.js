// ---------------------------------------------------------------------------
// storage.js — Supabase-based storage for signup_list_automation
// All operations now use Supabase as the single source of truth
// ---------------------------------------------------------------------------

import { supabase } from './utils/supabaseClient'

export const HOLE_COUNT = 9
export const HOLE_CAPACITY = 4
export const B_GROUP_THRESHOLD = 24

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
  for (let i = 1; i <= HOLE_COUNT; i++) {
    holes[String(i)] = []
    holes[`${i}B`] = []
  }
  return holes
}

function normalizeHole(value) {
  const s = String(value || '').trim().toUpperCase()
  // B-group: e.g. "1B", "9B"
  if (s.endsWith('B')) {
    const n = parseInt(s.slice(0, -1), 10)
    if (Number.isNaN(n) || n < 1 || n > HOLE_COUNT) return null
    return `${n}B`
  }
  // A-group (or legacy plain number)
  const n = parseInt(s, 10)
  if (Number.isNaN(n)) return null
  if (n < 1 || n > HOLE_COUNT) return null
  return String(n)
}

function firstEmptyHole(week, keys) {
  for (const key of keys) {
    if ((week.holes[key] || []).length === 0) return key
  }
  return null
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
  // Ensure B-group keys exist (added in a later version)
  for (let i = 1; i <= HOLE_COUNT; i++) {
    const key = `${i}B`
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

/**
 * Returns true when Group B holes should be unlocked for a given week.
 * B groups open once the total number of players across all Group A holes
 * reaches B_GROUP_THRESHOLD (24).  Once unlocked the flag is persisted on
 * the week record so they stay open even if the A-group count later drops
 * below the threshold.
 */
export function areBGroupsUnlocked(week) {
  if (!week || !week.holes) return false
  // Sticky: once the flag is set it never goes back to false
  if (week.bGroupsUnlocked) return true
  let total = 0
  for (let i = 1; i <= HOLE_COUNT; i++) {
    total += (week.holes[String(i)] || []).length
  }
  return total >= B_GROUP_THRESHOLD
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

function ordinalSuffix(n) {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return 'th'
  const mod10 = n % 10
  if (mod10 === 1) return 'st'
  if (mod10 === 2) return 'nd'
  if (mod10 === 3) return 'rd'
  return 'th'
}

/**
 * Returns a round-date label for a week key in the format:
 *   "Monday June 29th"
 *
 * In this app, the week key represents the signup week and the round is
 * played on the following Monday.
 */
export function weekKeyToRoundDateLabel(key) {
  if (!key) return '—'
  const [yearRaw, weekRaw] = key.split('-W')
  const year = parseInt(yearRaw, 10)
  const week = parseInt(weekRaw, 10)
  if (!year || !week) return '—'

  // Monday of ISO week 1 is the Monday of the week containing Jan 4.
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7 // 1=Mon..7=Sun
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1)

  // Monday for the provided ISO week, then +7 days for round Monday.
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

function getLocalSnapshot() {
  return {
    players: read(KEYS.players, {}),
    weeks: read(KEYS.weeks, {}),
    currentWeekKey: read(KEYS.current, null),
    adminPin: read(KEYS.pin, null),
  }
}

function applySnapshot(snapshot) {
  write(KEYS.players, snapshot.players || {})
  write(KEYS.weeks, snapshot.weeks || {})
  write(KEYS.current, snapshot.currentWeekKey || null)
  write(KEYS.pin, snapshot.adminPin || null)
}

function hasMeaningfulData(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false
  return (
    Object.keys(snapshot.players || {}).length > 0 ||
    Object.keys(snapshot.weeks || {}).length > 0 ||
    Boolean(snapshot.currentWeekKey) ||
    Boolean(snapshot.adminPin)
  )
}

async function fetchBackendSnapshot() {
  const res = await fetch(BACKEND_ENDPOINT, { method: 'GET' })
  if (!res.ok) {
    const details = await res.text().catch(() => '')
    throw new Error(`GET ${BACKEND_ENDPOINT} failed with ${res.status} ${res.statusText}${details ? `: ${details}` : ''}`)
  }
  const data = await res.json()
  return data?.state || null
}

async function saveBackendSnapshot(snapshot) {
  const res = await fetch(BACKEND_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: snapshot }),
  })
  if (!res.ok) {
    const details = await res.text().catch(() => '')
    throw new Error(`POST ${BACKEND_ENDPOINT} failed with ${res.status} ${res.statusText}${details ? `: ${details}` : ''}`)
  }
}

async function persistBackendSafely() {
  if (typeof fetch !== 'function') return
  try {
    await saveBackendSnapshot(getLocalSnapshot())
  } catch (err) {
    console.warn('Unable to persist signup data to backend. Backend sync failed but local changes were saved.', err)
  }
}

export async function initializeStorage() {
  migrateIfNeeded()
  if (typeof fetch !== 'function') return

  const localSnapshot = getLocalSnapshot()
  try {
    const backendSnapshot = await fetchBackendSnapshot()
    if (hasMeaningfulData(backendSnapshot)) {
      applySnapshot(backendSnapshot)
      return
    }
    if (hasMeaningfulData(localSnapshot)) {
      await saveBackendSnapshot(localSnapshot)
    }
  } catch (err) {
    console.warn('Backend storage unavailable; continuing with local data.', err)
  }
}

export async function refreshFromBackend() {
  if (typeof fetch !== 'function') return
  try {
    const backendSnapshot = await fetchBackendSnapshot()
    if (hasMeaningfulData(backendSnapshot)) {
      applySnapshot(backendSnapshot)
    }
  } catch (err) {
    console.warn('Could not refresh from backend; using local data.', err)
  }
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
function upsertPlayerLocal({ name, email }) {
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

export async function upsertPlayer({ name, email }) {
  const key = email.trim().toLowerCase()
  upsertPlayerLocal({ name, email })
  await persistBackendSafely()
  return getPlayers()[key] || null
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
export async function openWeek(weekKey) {
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
  await persistBackendSafely()
  return weekKey
}

/** Close the current week without opening a new one. */
export async function closeCurrentWeek() {
  const key = getCurrentWeekKey()
  if (!key) return
  const weeks = getWeeks()
  if (weeks[key]) weeks[key].closedAt = Date.now()
  write(KEYS.weeks, weeks)
  write(KEYS.current, null)
  await persistBackendSafely()
}

// ── Current week ─────────────────────────────────────────────────────────────

export function getCurrentWeekKey() {
  return read(KEYS.current, null)
}

/**
 * Add a signup to the current week.
 * Returns { ok: true } or { ok: false, reason: string }.
 */
export async function addSignupToWeek({ name, email, hole, additionalPlayers = [] }) {
  const weekKey = getCurrentWeekKey()
  if (!weekKey) return { ok: false, reason: 'Signups are currently closed. Please check back later or contact an administrator.' }

  // Validate primary name
  if (!isFullName(name)) {
    return { ok: false, reason: 'Please enter your first and last name (e.g., "Jane Smith").' }
  }

  const weeks = getWeeks()
  if (!weeks[weekKey]) return { ok: false, reason: 'Week record not found.' }
  const week = weeks[weekKey]
  ensureWeekHasHoles(week)

  const emailKey = email.trim().toLowerCase()
  const already = week.signups.some(s => s.email === emailKey)
  if (already) return { ok: false, reason: "You're already signed up for this week!" }

  const rawExtras = additionalPlayers
    .map(p => p.trim())
    .filter(Boolean)
    .slice(0, 3)

  const requestedHole = String(hole || '').trim().toUpperCase()
  const autoRequested = requestedHole === 'AUTO' || requestedHole === ''
  const bUnlocked = areBGroupsUnlocked(week)
  let holeKey = null

  if (autoRequested) {
    if (bUnlocked) {
      const bKeys = Array.from({ length: HOLE_COUNT }, (_, i) => `${i + 1}B`)
      holeKey = firstEmptyHole(week, bKeys)
      if (!holeKey) {
        return {
          ok: false,
          reason: 'No empty Group B hole is available for automatic assignment. Please choose a specific hole.',
        }
      }
    } else {
      const aKeys = Array.from({ length: HOLE_COUNT }, (_, i) => String(i + 1))
      holeKey = firstEmptyHole(week, aKeys)
      if (!holeKey) {
        return {
          ok: false,
          reason: 'No empty Group A hole is available for automatic assignment. Please choose a specific hole.',
        }
      }
    }
  } else {
    holeKey = normalizeHole(hole)
    if (!holeKey) return { ok: false, reason: 'Please choose a valid hole.' }

    // B-group holes are only available once the threshold is reached
    if (holeKey.endsWith('B') && !bUnlocked) {
      return {
        ok: false,
        reason: `Group B holes are not yet available. They unlock once ${B_GROUP_THRESHOLD} players have signed up.`,
      }
    }
  }

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
  const primaryNameMatch = findPlayerNameInWeek(week, name.trim())
  if (primaryNameMatch && !primaryNameMatch.player.isPrimary) {
    if (primaryNameMatch.holeKey === holeKey) {
      // Auto-group: upgrade the guest entry to a real primary signup.
      // Remove the guest slot so the capacity check uses the updated count.
      const hPlayers = week.holes[holeKey]
      const guestIdx = hPlayers.findIndex(p => p.id === primaryNameMatch.player.id)
      if (guestIdx >= 0) hPlayers.splice(guestIdx, 1)
      // Remove from the parent signup's additionalPlayers list.
      const parentSignup = week.signups.find(s => s.id === primaryNameMatch.player.signupId)
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
    const match = findPlayerNameInWeek(week, extra)
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
  const holePlayers = week.holes[holeKey] || []
  if (holePlayers.length + groupSize > HOLE_CAPACITY) {
    return {
      ok: false,
      reason: `Hole ${holeKey} does not have enough space for ${groupSize} player(s).`,
    }
  }

  const signedUpAt = Date.now()
  const signupId = createId()

  // Upsert player
  upsertPlayerLocal({ name, email: emailKey })

  // Add to week
  week.signups.push({
    id: signupId,
    hole: holeKey,
    email: emailKey,
    name: name.trim(),
    additionalPlayers: extras,
    signedUpAt,
  })
  week.holes[holeKey].push({
    id: createId(),
    signupId,
    isPrimary: true,
    name: name.trim(),
    email: emailKey,
    signedUpAt,
  })
  for (const extra of extras) {
    week.holes[holeKey].push({
      id: createId(),
      signupId,
      isPrimary: false,
      name: extra,
      email: null,
      signedUpAt,
    })
  }

  // Persist the sticky B-group unlock flag once threshold is reached.
  // Once set to true this flag is never cleared, so Group B holes remain
  // available even if the A-group player count later drops below B_GROUP_THRESHOLD.
  if (!week.bGroupsUnlocked && areBGroupsUnlocked(week)) {
    week.bGroupsUnlocked = true
  }

  write(KEYS.weeks, weeks)

  // Track week in player record
  const players = getPlayers()
  if (players[emailKey] && !players[emailKey].weeksPlayed.includes(weekKey)) {
    players[emailKey].weeksPlayed.push(weekKey)
    write(KEYS.players, players)
  }
  await persistBackendSafely()

  return { ok: true }
}

export async function removePlayerFromHole({ weekKey, hole, playerId }) {
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
  await persistBackendSafely()
  return { ok: true }
}

export async function movePlayerBetweenHoles({ weekKey, fromHole, toHole, playerId }) {
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
  await persistBackendSafely()
  return { ok: true }
}

// ── Admin PIN ────────────────────────────────────────────────────────────────

export function getAdminPin() {
  return read(KEYS.pin, null)
}

export async function setAdminPin(pin) {
  write(KEYS.pin, pin)
  await persistBackendSafely()
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
