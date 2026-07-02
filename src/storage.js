// ---------------------------------------------------------------------------
// storage.js — Supabase-based storage for signup_list_automation
// All operations now use Supabase as the single source of truth
// ---------------------------------------------------------------------------

import { supabase } from './utils/supabaseClient'

export const HOLE_COUNT = 9
export const HOLE_CAPACITY = 4
export const B_GROUP_THRESHOLD = 24

// ── Helper functions ────────────────────────────────────────────────────────

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function normalizeName(n) {
  return (n || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function isFullName(name) {
  return (name || '').trim().split(/\s+/).filter(Boolean).length >= 2
}

function normalizeHole(value) {
  const s = String(value || '').trim().toUpperCase()
  if (s.endsWith('B')) {
    const n = parseInt(s.slice(0, -1), 10)
    if (Number.isNaN(n) || n < 1 || n > HOLE_COUNT) return null
    return `${n}B`
  }
  const n = parseInt(s, 10)
  if (Number.isNaN(n)) return null
  if (n < 1 || n > HOLE_COUNT) return null
  return String(n)
}

// ── ISO week key helpers ────────────────────────────────────────────────────

function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return { year: d.getUTCFullYear(), week }
}

export function weekKeyFromDate(date = new Date()) {
  const { year, week } = isoWeek(date)
  return `${year}-W${String(week).padStart(2, '0')}`
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

// ── Supabase operations ─────────────────────────────────────────────────────

export async function initializeStorage() {
  try {
    const { error } = await supabase.from('admin_settings').select('key').limit(1)
    if (error) throw error
    console.log('✓ Supabase storage initialized')
  } catch (err) {
    console.error('✗ Failed to initialize storage:', err)
    throw err
  }
}

export async function refreshFromBackend() {
  // Supabase queries always fetch fresh data
}

export async function getCurrentWeekKey() {
  try {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'current_week_key')
      .single()
    
    if (error && error.code !== 'PGRST116') throw error
    return data?.value || null
  } catch (err) {
    console.error('Error getting current week key:', err)
    return null
  }
}

export async function getWeeks() {
  try {
    const { data, error } = await supabase
      .from('weeks')
      .select('*')
      .order('opened_at', { ascending: false })
    
    if (error) throw error
    
    const weeks = {}
    for (const week of (data || [])) {
      weeks[week.week_key] = week
    }
    return weeks
  } catch (err) {
    console.error('Error getting weeks:', err)
    return {}
  }
}

export async function getWeek(weekKey) {
  try {
    const { data, error } = await supabase
      .from('weeks')
      .select('*')
      .eq('week_key', weekKey)
      .single()
    
    if (error && error.code !== 'PGRST116') throw error
    return data || null
  } catch (err) {
    console.error('Error getting week:', err)
    return null
  }
}

export async function openWeek(weekKey) {
  try {
    const { data: currentWeekData } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'current_week_key')
      .single()
    
    if (currentWeekData?.value) {
      await supabase
        .from('weeks')
        .update({ closed_at: new Date().toISOString() })
        .eq('week_key', currentWeekData.value)
    }

    await supabase
      .from('weeks')
      .upsert({
        week_key: weekKey,
        opened_at: new Date().toISOString(),
        closed_at: null,
        b_groups_unlocked: false,
      }, { onConflict: 'week_key' })
    
    await supabase
      .from('admin_settings')
      .upsert({ key: 'current_week_key', value: weekKey }, { onConflict: 'key' })

    return weekKey
  } catch (err) {
    console.error('Error opening week:', err)
    throw err
  }
}

export async function closeCurrentWeek() {
  try {
    const weekKey = await getCurrentWeekKey()
    if (!weekKey) return

    await supabase
      .from('weeks')
      .update({ closed_at: new Date().toISOString() })
      .eq('week_key', weekKey)

    await supabase
      .from('admin_settings')
      .upsert({ key: 'current_week_key', value: '' }, { onConflict: 'key' })
  } catch (err) {
    console.error('Error closing week:', err)
    throw err
  }
}

export async function getPlayers() {
  try {
    const { data, error } = await supabase
      .from('weekly_players')
      .select('player_email, player_name')
      .not('player_email', 'is', null)
      .eq('is_guest', false)
    
    if (error) throw error
    
    const players = {}
    const seen = new Set()
    for (const row of (data || [])) {
      const email = row.player_email?.trim().toLowerCase()
      if (email && !seen.has(email)) {
        players[email] = { 
          email,
          name: row.player_name || email
        }
        seen.add(email)
      }
    }
    return players
  } catch (err) {
    console.error('Error getting players:', err)
    return {}
  }
}

async function countAGroupPlayers(weekKey) {
  try {
    const { data, error } = await supabase
      .from('weekly_players')
      .select('id', { count: 'exact' })
      .eq('week_number', weekKey)
      .eq('hole_group', 'A')
      .eq('is_guest', false)
    
    if (error) throw error
    return data?.length || 0
  } catch (err) {
    console.error('Error counting A-group players:', err)
    return 0
  }
}

async function getHolePlayers(weekKey, holeNumber, holeGroup) {
  try {
    let query = supabase
      .from('weekly_players')
      .select('*')
      .eq('week_number', weekKey)
      .eq('hole_number', holeNumber)
    
    if (holeGroup) {
      query = query.eq('hole_group', holeGroup)
    }
    
    const { data, error } = await query
    if (error) throw error
    return data || []
  } catch (err) {
    console.error('Error getting hole players:', err)
    return []
  }
}

export async function addSignupToWeek({ name, email, hole, additionalPlayers = [] }) {
  const weekKey = await getCurrentWeekKey()
  if (!weekKey) {
    return { ok: false, reason: 'Signups are currently closed. Please check back later or contact an administrator.' }
  }

  if (!isFullName(name)) {
    return { ok: false, reason: 'Please enter your first and last name (e.g., "Jane Smith").' }
  }

  const emailKey = email.trim().toLowerCase()

  try {
    const { data: existing } = await supabase
      .from('weekly_players')
      .select('id')
      .eq('week_number', weekKey)
      .eq('player_email', emailKey)
      .eq('is_guest', false)
      .single()
    
    if (existing) {
      return { ok: false, reason: "You're already signed up for this week!" }
    }

    const week = await getWeek(weekKey)
    if (!week) {
      return { ok: false, reason: 'Week record not found.' }
    }

    const extras = additionalPlayers
      .map(p => p.trim())
      .filter(Boolean)
      .slice(0, 3)
    
    for (const extra of extras) {
      if (!isFullName(extra)) {
        return {
          ok: false,
          reason: `"${extra}" — additional player names must include a first and last name (e.g., "John Smith").`,
        }
      }
    }

    let holeKey = null
    const requestedHole = String(hole || '').trim().toUpperCase()
    const autoRequested = requestedHole === 'AUTO' || requestedHole === ''

    if (autoRequested) {
      // Always try A-group first (holes 1-9)
      for (let i = 1; i <= HOLE_COUNT; i++) {
        const players = await getHolePlayers(weekKey, String(i), 'A')
        if (players.length < HOLE_CAPACITY) {
          holeKey = String(i)
          break
        }
      }
      // If A-group is full and B-group is unlocked, try B-group
      if (!holeKey && week.b_groups_unlocked) {
        for (let i = 1; i <= HOLE_COUNT; i++) {
          const players = await getHolePlayers(weekKey, String(i), 'B')
          if (players.length < HOLE_CAPACITY) {
            holeKey = `${i}B`
            break
          }
        }
      }
      if (!holeKey) {
        return {
          ok: false,
          reason: 'No empty hole is available for automatic assignment. Please choose a specific hole.',
        }
      }
    } else {
      holeKey = normalizeHole(hole)
      if (!holeKey) {
        return { ok: false, reason: 'Please choose a valid hole.' }
      }

      if (holeKey.endsWith('B') && !week.b_groups_unlocked) {
        return {
          ok: false,
          reason: `Group B holes are not yet available. They unlock once ${B_GROUP_THRESHOLD} players have signed up.`,
        }
      }
    }

    const holeGroup = holeKey.endsWith('B') ? 'B' : 'A'
    const holeNumber = holeKey.replace(/B$/, '')
    
    const holePlayers = await getHolePlayers(weekKey, holeNumber, holeGroup)
    const groupSize = 1 + extras.length
    if (holePlayers.length + groupSize > HOLE_CAPACITY) {
      return {
        ok: false,
        reason: `Hole ${holeKey} does not have enough space for ${groupSize} player(s).`,
      }
    }

    const signupId = createId()

    const { error: insertError } = await supabase
      .from('weekly_players')
      .insert({
        week_number: weekKey,
        player_name: name.trim(),
        player_email: emailKey,
        hole_number: holeNumber,
        hole_group: holeGroup,
        signup_id: signupId,
        is_guest: false,
        primary_player_email: emailKey,
      })
    
    if (insertError) throw insertError

    for (const guestName of extras) {
      const { error: guestError } = await supabase
        .from('weekly_players')
        .insert({
          week_number: weekKey,
          player_name: guestName.trim(),
          player_email: null,
          hole_number: holeNumber,
          hole_group: holeGroup,
          signup_id: signupId,
          is_guest: true,
          primary_player_email: emailKey,
        })
      
      if (guestError) throw guestError
    }

    if (!week.b_groups_unlocked) {
      const aGroupCount = await countAGroupPlayers(weekKey)
      if (aGroupCount >= B_GROUP_THRESHOLD) {
        await supabase
          .from('weeks')
          .update({ b_groups_unlocked: true })
          .eq('week_key', weekKey)
      }
    }

    return { ok: true }
  } catch (err) {
    console.error('Error adding signup:', err)
    return { ok: false, reason: 'An error occurred while processing your signup. Please try again.' }
  }
}

export async function removePlayerFromHole({ weekKey, hole, playerId }) {
  try {
    const { error } = await supabase
      .from('weekly_players')
      .delete()
      .eq('id', playerId)
    
    if (error) throw error
    return { ok: true }
  } catch (err) {
    console.error('Error removing player:', err)
    return { ok: false, reason: 'Failed to remove player.' }
  }
}

export async function movePlayerBetweenHoles({ weekKey, fromHole, toHole, playerId }) {
  try {
    const toKey = normalizeHole(toHole)
    if (!toKey) return { ok: false, reason: 'Invalid hole.' }

    const toGroup = toKey.endsWith('B') ? 'B' : 'A'
    const toNumber = toKey.replace(/B$/, '')
    
    const toPlayers = await getHolePlayers(weekKey, toNumber, toGroup)
    if (toPlayers.length >= HOLE_CAPACITY) {
      return { ok: false, reason: `Hole ${toKey} is full.` }
    }

    const { error } = await supabase
      .from('weekly_players')
      .update({
        hole_number: toNumber,
        hole_group: toGroup,
      })
      .eq('id', playerId)
    
    if (error) throw error
    return { ok: true }
  } catch (err) {
    console.error('Error moving player:', err)
    return { ok: false, reason: 'Failed to move player.' }
  }
}

export async function getAdminPin() {
  try {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'admin_pin')
      .single()
    
    if (error && error.code !== 'PGRST116') throw error
    return data?.value || null
  } catch (err) {
    console.error('Error getting admin PIN:', err)
    return null
  }
}

export async function setAdminPin(pin) {
  try {
    const { error } = await supabase
      .from('admin_settings')
      .upsert({ key: 'admin_pin', value: pin }, { onConflict: 'key' })
    
    if (error) throw error
  } catch (err) {
    console.error('Error setting admin PIN:', err)
    throw err
  }
}

export function computePlayerStats(player, allWeekKeys) {
  return {
    firstWeekKey: null,
    lastWeekKey: null,
    totalWeeks: 0,
    currentStreak: 0,
  }
}