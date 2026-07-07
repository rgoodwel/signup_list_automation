// ---------------------------------------------------------------------------
// storage.js — Supabase-based storage for signup_list_automation
// All operations now use Supabase as the single source of truth
// Multi-tenancy: each league is completely isolated
// ---------------------------------------------------------------------------

import { supabase } from './utils/supabaseClient'

export const HOLE_COUNT = 9
export const HOLE_CAPACITY = 4
export const B_GROUP_THRESHOLD = 24

// ── League context (set by App.jsx when league loads) ──────────────────────
let currentLeagueId = null

export function setCurrentLeague(leagueId) {
  currentLeagueId = leagueId
}

export function getCurrentLeagueId() {
  return currentLeagueId
}

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
    if (!currentLeagueId) return null
    // Get the most recent week for this league
    const { data, error } = await supabase
      .from('weeks')
      .select('week_key')
      .eq('league_id', currentLeagueId)
      .order('opened_at', { ascending: false })
      .limit(1)
      .single()
    
    if (error && error.code !== 'PGRST116') throw error
    return data?.week_key || null
  } catch (err) {
    console.error('Error getting current week key:', err)
    return null
  }
}

export async function getWeeks() {
  try {
    if (!currentLeagueId) return {}
    const { data, error } = await supabase
      .from('weeks')
      .select('*')
      .eq('league_id', currentLeagueId)
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
    if (!currentLeagueId) return null
    const { data, error } = await supabase
      .from('weeks')
      .select('*')
      .eq('league_id', currentLeagueId)
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
    if (!currentLeagueId) return weekKey
    
    // Close any previously open week for this league
    const { data: previousWeek } = await supabase
      .from('weeks')
      .select('week_key, id')
      .eq('league_id', currentLeagueId)
      .is('closed_at', null)
      .limit(1)
      .single()
    
    if (previousWeek?.week_key) {
      await supabase
        .from('weeks')
        .update({ closed_at: new Date().toISOString() })
        .eq('league_id', currentLeagueId)
        .eq('week_key', previousWeek.week_key)
    }

    // Check if this week already exists for this league
    const { data: existingWeek } = await supabase
      .from('weeks')
      .select('id, week_key')
      .eq('league_id', currentLeagueId)
      .eq('week_key', weekKey)
      .limit(1)
      .single()

    if (existingWeek) {
      // Week exists - update it (reopen it)
      await supabase
        .from('weeks')
        .update({
          opened_at: new Date().toISOString(),
          closed_at: null,
          b_groups_unlocked: false,
        })
        .eq('id', existingWeek.id)
    } else {
      // Week doesn't exist - create it
      await supabase
        .from('weeks')
        .insert({
          league_id: currentLeagueId,
          week_key: weekKey,
          opened_at: new Date().toISOString(),
          closed_at: null,
          b_groups_unlocked: false,
        })
    }

    return weekKey
  } catch (err) {
    console.error('Error opening week:', err)
    throw err
  }
}

export async function closeCurrentWeek() {
  try {
    if (!currentLeagueId) return
    
    const weekKey = await getCurrentWeekKey()
    if (!weekKey) return

    await supabase
      .from('weeks')
      .update({ closed_at: new Date().toISOString() })
      .eq('league_id', currentLeagueId)
      .eq('week_key', weekKey)
  } catch (err) {
    console.error('Error closing week:', err)
    throw err
  }
}

// ────────────────────────────────────────────────────────────────────────
// Audit logging helper
// ────────────────────────────────────────────────────────────────────────
async function logAuditEvent(weekKey, operation, playerName, playerEmail, holeNumber, holeGroup, details = {}) {
  try {
    if (!currentLeagueId) return
    await supabase
      .from('weekly_players_audit_log')
      .insert({
        league_id: currentLeagueId,
        week_number: weekKey,
        operation,
        player_name: playerName,
        player_email: playerEmail,
        hole_number: holeNumber,
        hole_group: holeGroup,
        details,
      })
  } catch (err) {
    console.error('Error logging audit event:', err)
    // Don't throw - logging failures shouldn't break the operation
  }
}

export async function getPlayers() {
  try {
    if (!currentLeagueId) return {}
    const { data, error } = await supabase
      .from('weekly_players')
      .select('player_email, player_name')
      .eq('league_id', currentLeagueId)
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
    if (!currentLeagueId) return 0
    // Count ALL players (primary + guests) in A-group, not just primaries
    const { data, error } = await supabase
      .from('weekly_players')
      .select('id', { count: 'exact' })
      .eq('league_id', currentLeagueId)
      .eq('week_number', weekKey)
      .eq('hole_group', 'A')
    
    if (error) throw error
    return data?.length || 0
  } catch (err) {
    console.error('Error counting A-group players:', err)
    return 0
  }
}

async function getHolePlayers(weekKey, holeNumber, holeGroup) {
  try {
    if (!currentLeagueId) return []
    let query = supabase
      .from('weekly_players')
      .select('*')
      .eq('league_id', currentLeagueId)
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
  if (!currentLeagueId) {
    return { ok: false, reason: 'No league selected. Please refresh and try again.' }
  }
  
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
      .eq('league_id', currentLeagueId)
      .eq('week_number', weekKey)
      .eq('player_email', emailKey)
      .eq('is_guest', false)
      .single()
    
    if (existing) {
      return { ok: false, reason: "You're already signed up for this week!" }
    }

    let week = await getWeek(weekKey)
    if (!week) {
      // Auto-create the week if it doesn't exist (in case admin_settings has been set but week not created yet)
      try {
        const { error: createError } = await supabase
          .from('weeks')
          .insert({
            league_id: currentLeagueId,
            week_key: weekKey,
            opened_at: new Date().toISOString(),
            closed_at: null,
            b_groups_unlocked: false,
          })
        if (createError) throw createError
        week = await getWeek(weekKey)
      } catch (err) {
        console.error('Error creating week:', err)
        return { ok: false, reason: 'Could not create week record. Please contact an administrator.' }
      }
      if (!week) {
        return { ok: false, reason: 'Week record could not be created. Please contact an administrator.' }
      }
    }

    const extras = additionalPlayers
      .map(p => p.trim())
      .filter(Boolean)
      .slice(0, 3)
    
    // Validate all additional players
    for (const extra of extras) {
      if (!isFullName(extra)) {
        return {
          ok: false,
          reason: `"${extra}" — additional player names must include a first and last name (e.g., "John Smith").`,
        }
      }
    }
    
    // Check for duplicate guest names in the same week (league-specific)
    for (const guestName of extras) {
      const { data: existing } = await supabase
        .from('weekly_players')
        .select('id')
        .eq('league_id', currentLeagueId)
        .eq('week_number', weekKey)
        .ilike('player_name', guestName.trim())
        .single()
      
      if (existing) {
        return {
          ok: false,
          reason: `"${guestName}" is already signed up for this week. Each player can only appear once.`,
        }
      }
    }

    let holeKey = null
    const requestedHole = String(hole || '').trim().toUpperCase()
    const autoRequested = requestedHole === 'AUTO' || requestedHole === ''

    if (autoRequested) {
      const groupSize = 1 + extras.length
      let bestHole = null
      let bestCapacity = -1
      
      // Always try A-group first (holes 1-9) - pick the hole with BEST FIT
      for (let i = 1; i <= HOLE_COUNT; i++) {
        const players = await getHolePlayers(weekKey, String(i), 'A')
        const available = HOLE_CAPACITY - players.length
        
        // If this hole fits the group and has less wasted space, it's better
        if (available >= groupSize && (bestCapacity === -1 || available < bestCapacity)) {
          bestHole = String(i)
          bestCapacity = available
        }
      }
      
      // If A-group has no good fit and B-group is unlocked, try B-group
      if (!bestHole && week.b_groups_unlocked) {
        for (let i = 1; i <= HOLE_COUNT; i++) {
          const players = await getHolePlayers(weekKey, String(i), 'B')
          const available = HOLE_CAPACITY - players.length
          
          if (available >= groupSize && (bestCapacity === -1 || available < bestCapacity)) {
            bestHole = `${i}B`
            bestCapacity = available
          }
        }
      }
      
      if (!bestHole) {
        return {
          ok: false,
          reason: `No hole has enough space for ${groupSize} player(s). Please choose a specific hole or reduce additional players.`,
        }
      }
      
      holeKey = bestHole
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

    console.log('DEBUG: Inserting primary player', {
      weekKey, name: name.trim(), email: emailKey, holeNumber, holeGroup, signupId
    })

    const { error: insertError } = await supabase
      .from('weekly_players')
      .insert({
        league_id: currentLeagueId,
        week_number: weekKey,
        player_name: name.trim(),
        player_email: emailKey,
        hole_number: holeNumber,
        hole_group: holeGroup,
        signup_id: signupId,
        is_guest: false,
        primary_player_email: emailKey,
      })
    
    if (insertError) {
      console.error('DEBUG: Primary player insert failed:', insertError)
      throw insertError
    }

    // Log the primary player signup
    await logAuditEvent(weekKey, 'CREATE', name.trim(), emailKey, holeNumber, holeGroup, {
      type: 'primary',
      groupSize: 1 + extras.length,
    })

    console.log('DEBUG: Primary player inserted, extras count:', extras.length)

    for (let i = 0; i < extras.length; i++) {
      const guestName = extras[i]
      console.log(`DEBUG: Inserting guest ${i + 1}/${extras.length}:`, guestName)
      
      const { error: guestError } = await supabase
        .from('weekly_players')
        .insert({
          league_id: currentLeagueId,
          week_number: weekKey,
          player_name: guestName.trim(),
          player_email: null,
          hole_number: holeNumber,
          hole_group: holeGroup,
          signup_id: signupId,
          is_guest: true,
          primary_player_email: emailKey,
        })
      
      if (guestError) {
        console.error(`DEBUG: Guest ${i + 1} insert failed:`, guestError)
        throw guestError
      }
      
      // Log the guest signup
      await logAuditEvent(weekKey, 'CREATE', guestName.trim(), null, holeNumber, holeGroup, {
        type: 'guest',
        primaryPlayer: emailKey,
      })
      console.log(`DEBUG: Guest ${i + 1} inserted successfully`)
    }

    if (!week.b_groups_unlocked) {
      const aGroupCount = await countAGroupPlayers(weekKey)
      if (aGroupCount >= B_GROUP_THRESHOLD) {
        await supabase
          .from('weeks')
          .update({ b_groups_unlocked: true })
          .eq('league_id', currentLeagueId)
          .eq('week_key', weekKey)
      }
    }

    return { ok: true, holeKey, extraCount: extras.length }
  } catch (err) {
    console.error('Error adding signup:', err?.message || err, err?.details || '')
    return { ok: false, reason: `Error: ${err?.message || 'An error occurred while processing your signup. Please try again.'}` }
  }
}

export async function removePlayerFromHole({ weekKey, hole, playerId }) {
  try {
    if (!currentLeagueId) return { ok: false, reason: 'No league selected.' }
    
    // Fetch player data before deleting for logging
    const { data: player } = await supabase
      .from('weekly_players')
      .select('player_name, player_email, hole_number, hole_group')
      .eq('league_id', currentLeagueId)
      .eq('id', playerId)
      .single()
    
    const { error } = await supabase
      .from('weekly_players')
      .delete()
      .eq('league_id', currentLeagueId)
      .eq('id', playerId)
    
    if (error) throw error
    
    // Log the removal
    if (player) {
      await logAuditEvent(weekKey, 'DELETE', player.player_name, player.player_email, player.hole_number, player.hole_group, {
        action: 'player_removed',
      })
    }
    
    return { ok: true }
  } catch (err) {
    console.error('Error removing player:', err)
    return { ok: false, reason: 'Failed to remove player.' }
  }
}

export async function movePlayerBetweenHoles({ weekKey, fromHole, toHole, playerId }) {
  try {
    if (!currentLeagueId) return { ok: false, reason: 'No league selected.' }
    
    const toKey = normalizeHole(toHole)
    if (!toKey) return { ok: false, reason: 'Invalid hole.' }

    const toGroup = toKey.endsWith('B') ? 'B' : 'A'
    const toNumber = toKey.replace(/B$/, '')
    
    const toPlayers = await getHolePlayers(weekKey, toNumber, toGroup)
    if (toPlayers.length >= HOLE_CAPACITY) {
      return { ok: false, reason: `Hole ${toKey} is full.` }
    }

    // Fetch player data before updating for logging
    const { data: player } = await supabase
      .from('weekly_players')
      .select('player_name, player_email, hole_number, hole_group')
      .eq('league_id', currentLeagueId)
      .eq('id', playerId)
      .single()

    const { error } = await supabase
      .from('weekly_players')
      .update({
        hole_number: toNumber,
        hole_group: toGroup,
      })
      .eq('league_id', currentLeagueId)
      .eq('id', playerId)
    
    if (error) throw error
    
    // Log the move
    if (player) {
      await logAuditEvent(weekKey, 'UPDATE', player.player_name, player.player_email, toNumber, toGroup, {
        action: 'player_moved',
        fromHole: `${player.hole_number}${player.hole_group}`,
        toHole: `${toNumber}${toGroup}`,
      })
    }
    
    return { ok: true }
  } catch (err) {
    console.error('Error moving player:', err)
    return { ok: false, reason: 'Failed to move player.' }
  }
}

export async function getAuditLogs(weekKey, limit = 100) {
  try {
    if (!currentLeagueId) return []
    const { data, error } = await supabase
      .from('weekly_players_audit_log')
      .select('*')
      .eq('league_id', currentLeagueId)
      .eq('week_number', weekKey)
      .order('created_at', { ascending: false })
      .limit(limit)
    
    if (error) throw error
    return data || []
  } catch (err) {
    console.error('Error fetching audit logs:', err)
    return []
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