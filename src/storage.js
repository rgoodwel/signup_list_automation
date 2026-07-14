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

export function weekKeyToRoundDateLabel(key, dayOfWeek = 'Monday') {
  if (!key) return '—'
  const [yearRaw, weekRaw] = key.split('-W')
  const year = parseInt(yearRaw, 10)
  const week = parseInt(weekRaw, 10)
  if (!year || !week) return '—'

  // Map day names to numbers (0=Sunday, 1=Monday, etc.)
  const dayMap = {
    'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
    'Thursday': 4, 'Friday': 5, 'Saturday': 6,
  }
  const targetDayNum = dayMap[dayOfWeek] ?? 1

  // Calculate Monday of the week
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1)

  const roundMonday = new Date(week1Monday)
  roundMonday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7 + 7)

  // Adjust to league's preferred day
  const daysToAdd = targetDayNum - 1
  const roundDay = new Date(roundMonday)
  roundDay.setUTCDate(roundMonday.getUTCDate() + daysToAdd)

  // Format and return
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric',
  }).formatToParts(roundDay)

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

export function getNextWeekKey(weekKey) {
  if (!weekKey) {
    // If no weekKey provided, use current date
    return weekKeyFromDate()
  }
  const [year, w] = weekKey.split('-W')
  const weekNum = parseInt(w, 10)
  const nextWeekNum = weekNum + 1
  
  // For 2026, weeks go from W28 to W52
  if (nextWeekNum > 52) {
    return `${parseInt(year) + 1}-W01`
  }
  
  return `${year}-W${String(nextWeekNum).padStart(2, '0')}`
}

export function isValidWeekKey(weekKey, year = 2026) {
  const match = weekKey.match(/^(\d{4})-W(\d{2})$/)
  if (!match) return false
  
  const [, yearStr, weekStr] = match
  const w = parseInt(weekStr, 10)
  const y = parseInt(yearStr, 10)
  
  // For the specified year, allow weeks W28 through W52
  if (y === year) return w >= 28 && w <= 52
  
  // For other years, allow weeks W01 through W52
  return w >= 1 && w <= 53
}

// ── Supabase operations ─────────────────────────────────────────────────────

export async function initializeStorage() {
  try {
    // Test connection by querying leagues table
    const { error } = await supabase.from('leagues').select('id').limit(1)
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
    // Get the most recent non-finalized week for this league
    const { data, error } = await supabase
      .from('weeks')
      .select('week_key')
      .eq('league_id', currentLeagueId)
      .is('finalized_at', null)  // Only get weeks that haven't been finalized/closed
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

export async function ensureCurrentWeekExists() {
  try {
    if (!currentLeagueId) return null

    // If there is already any non-finalized week open, don't auto-create a new one.
    // Admins advance weeks manually via "Open Next Week".
    const activeWeekKey = await getCurrentWeekKey()
    if (activeWeekKey) {
      return activeWeekKey
    }

    // No open week at all — create one for the current ISO week so the app is usable.
    const weekKey = weekKeyFromDate()
    let existing = await getWeek(weekKey)

    if (existing) {
      return weekKey
    }

    // Week doesn't exist - create it
    const { error: insertError } = await supabase
      .from('weeks')
      .insert({
        league_id: currentLeagueId,
        week_key: weekKey,
        opened_at: new Date().toISOString(),
        closed_at: null,
        b_groups_unlocked: false,
      })

    if (insertError) throw insertError

    // CRITICAL: Verify the insert succeeded before returning
    // This ensures the row is replicated and queryable before we continue
    let verified = await getWeek(weekKey)
    if (!verified) {
      // Retry once after brief delay - might be replication delay
      await new Promise(r => setTimeout(r, 50))
      verified = await getWeek(weekKey)
    }

    if (!verified) {
      console.error('Week created but verification failed - replication delay')
      // Return weekKey anyway; refresh() will retry if needed
    }

    return weekKey
  } catch (err) {
    console.error('Error ensuring current week exists:', err)
    return null
  }
}

export async function openWeek(weekKey) {
  try {
    if (!currentLeagueId) return weekKey

    // Enforce: only one non-finalized week allowed at a time.
    // The next week cannot be opened until the current one is closed/finalized.
    const activeWeekKey = await getCurrentWeekKey()
    if (activeWeekKey && activeWeekKey !== weekKey) {
      throw new Error(
        `Cannot open ${weekKey}: week ${activeWeekKey} must be closed/finalized first.`
      )
    }

    // Check if this week already exists for this league
    const { data: existingWeeks, error: existError } = await supabase
      .from('weeks')
      .select('id, week_key')
      .eq('league_id', currentLeagueId)
      .eq('week_key', weekKey)

    if (existError) {
      console.error('Error checking existing week:', existError)
      throw existError
    }

    if (existingWeeks && existingWeeks.length > 0) {
      // Week exists - reopen it (clear closed/finalized state)
      await supabase
        .from('weeks')
        .update({
          opened_at: new Date().toISOString(),
          closed_at: null,
          finalized_at: null,
          b_groups_unlocked: false,
        })
        .eq('id', existingWeeks[0].id)
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

/**
 * Unlock (reopen signups for) a specific week without changing anything else.
 * Only clears closed_at — does NOT create a new week or touch finalized_at.
 */
export async function unlockWeek(weekKey) {
  try {
    if (!currentLeagueId || !weekKey) return
    const { error } = await supabase
      .from('weeks')
      .update({ closed_at: null })
      .eq('league_id', currentLeagueId)
      .eq('week_key', weekKey)
    if (error) throw error
  } catch (err) {
    console.error('Error unlocking week:', err)
    throw err
  }
}

export async function lockCurrentWeek() {
  try {
    if (!currentLeagueId) return
    
    const weekKey = await getCurrentWeekKey()
    if (!weekKey) return

    // Fetch the week id first
    const { data: weeks, error: fetchError } = await supabase
      .from('weeks')
      .select('id')
      .eq('league_id', currentLeagueId)
      .eq('week_key', weekKey)

    if (fetchError) {
      console.error('Error fetching week to lock:', fetchError)
      throw fetchError
    }

    if (weeks && weeks.length > 0) {
      await supabase
        .from('weeks')
        .update({ closed_at: new Date().toISOString() })
        .eq('id', weeks[0].id)
    }
  } catch (err) {
    console.error('Error locking week:', err)
    throw err
  }
}

export async function finalizeCurrentWeek() {
  try {
    if (!currentLeagueId) return
    
    const weekKey = await getCurrentWeekKey()
    if (!weekKey) return

    // Fetch the week id first
    const { data: weeks, error: fetchError } = await supabase
      .from('weeks')
      .select('id')
      .eq('league_id', currentLeagueId)
      .eq('week_key', weekKey)

    if (fetchError) {
      console.error('Error fetching week to finalize:', fetchError)
      throw fetchError
    }

    if (weeks && weeks.length > 0) {
      await supabase
        .from('weeks')
        .update({ 
          finalized_at: new Date().toISOString(),
          closed_at: new Date().toISOString() // Also lock it when finalizing
        })
        .eq('id', weeks[0].id)
    }
  } catch (err) {
    console.error('Error finalizing week:', err)
    throw err
  }
}

export async function closeCurrentWeekAndOpenNext() {
  try {
    if (!currentLeagueId) return
    
    const currentWeekKey = await getCurrentWeekKey()
    if (!currentWeekKey) throw new Error('No current week found')
    
    const nextWeekKey = getNextWeekKey(currentWeekKey)
    
    if (!isValidWeekKey(nextWeekKey)) {
      throw new Error(`Cannot move to ${nextWeekKey} - outside allowed range (W28-W52 for 2026)`)
    }
    
    // Ensure the next week exists, then open it
    await openWeek(nextWeekKey)
  } catch (err) {
    console.error('Error closing week and opening next:', err)
    throw err
  }
}

// Deprecated - use lockCurrentWeek instead
export async function closeCurrentWeek() {
  return lockCurrentWeek()
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
      .select('player_email, player_name, player_phone')
      .eq('league_id', currentLeagueId)
      .not('player_email', 'is', null)
    
    if (error) throw error
    
    console.log('[getPlayers] Raw data from database:', data)
    
    const players = {}
    const seen = new Set()
    for (const row of (data || [])) {
      console.log('[getPlayers] Processing row:', row)
      const email = row.player_email?.trim().toLowerCase()
      if (email && !seen.has(email)) {
        const playerObj = { 
          email,
          name: row.player_name || email,
          phone: row.player_phone || ''
        }
        console.log('[getPlayers] Created player object:', playerObj)
        players[email] = playerObj
        seen.add(email)
      }
    }
    console.log('[getPlayers] Final players object:', players)
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

export async function addSignupToWeek({ name, email, phone, hole, additionalPlayers = [] }) {
  if (!currentLeagueId) {
    return { ok: false, reason: 'No league selected. Please refresh and try again.' }
  }
  
  const weekKey = await getCurrentWeekKey()
  if (!weekKey) {
    return { ok: false, reason: 'Signups are currently closed. Please check back later or contact your league manager.' }
  }

  if (!isFullName(name)) {
    return { ok: false, reason: 'Please enter your first and last name (e.g., "Jane Smith").' }
  }

  const emailKey = email.trim().toLowerCase()

  try {
    const { data: existing, error: existError } = await supabase
      .from('weekly_players')
      .select('id')
      .eq('league_id', currentLeagueId)
      .eq('week_number', weekKey)
      .eq('player_email', emailKey)
      .single()
    
    // .single() returns PGRST116 error when no rows found (expected for new signups)
    if (existError && existError.code !== 'PGRST116') {
      throw existError
    }
    
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
      .filter(p => p && p.name && p.name.trim())
      .slice(0, 3)
    
    // Validate all additional players
    for (const extra of extras) {
      if (!isFullName(extra.name)) {
        return {
          ok: false,
          reason: `"${extra.name}" — additional player names must include a first and last name (e.g., "John Smith").`,
        }
      }
      
      if (!extra.email || !extra.email.trim()) {
        return {
          ok: false,
          reason: `"${extra.name}" — email address is required for all additional players.`,
        }
      }
      
      if (!extra.phone || !extra.phone.trim()) {
        return {
          ok: false,
          reason: `"${extra.name}" — phone number is required for all additional players.`,
        }
      }
    }
    
    // Check for duplicate guest names in the same week (league-specific)
    for (const guest of extras) {
      const { data: existing, error: existError } = await supabase
        .from('weekly_players')
        .select('id')
        .eq('league_id', currentLeagueId)
        .eq('week_number', weekKey)
        .ilike('player_name', guest.name.trim())
        .single()
      
      // .single() returns PGRST116 error when no rows found (expected for new players)
      if (existError && existError.code !== 'PGRST116') {
        throw existError
      }
      
      if (existing) {
        return {
          ok: false,
          reason: `"${guest.name}" is already signed up for this week. Each player can only appear once.`,
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
        player_phone: phone ? phone.replace(/\D/g, '') : null,
        hole_number: holeNumber,
        hole_group: holeGroup,
        signup_id: signupId,
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
      const guest = extras[i]
      console.log(`DEBUG: Inserting guest ${i + 1}/${extras.length}:`, guest.name)
      
      const { error: guestError } = await supabase
        .from('weekly_players')
        .insert({
          league_id: currentLeagueId,
          week_number: weekKey,
          player_name: guest.name.trim(),
          player_email: guest.email.trim().toLowerCase(),
          player_phone: guest.phone ? guest.phone.replace(/\D/g, '') : null,
          hole_number: holeNumber,
          hole_group: holeGroup,
          signup_id: signupId,
        })
      
      if (guestError) {
        console.error(`DEBUG: Guest ${i + 1} insert failed:`, guestError)
        throw guestError
      }
      
      // Log the signup
      await logAuditEvent(weekKey, 'CREATE', guest.name.trim(), guest.email.trim().toLowerCase(), holeNumber, holeGroup, {
        type: 'player',
        groupInitiator: emailKey,
      })
      console.log(`DEBUG: Guest ${i + 1} inserted successfully`)
    }

    if (!week.b_groups_unlocked) {
      const aGroupCount = await countAGroupPlayers(weekKey)
      if (aGroupCount >= B_GROUP_THRESHOLD) {
        // Fetch week id first
        const { data: weeks, error: fetchError } = await supabase
          .from('weeks')
          .select('id')
          .eq('league_id', currentLeagueId)
          .eq('week_key', weekKey)
        
        if (fetchError) throw fetchError
        
        if (weeks && weeks.length > 0) {
          await supabase
            .from('weeks')
            .update({ b_groups_unlocked: true })
            .eq('id', weeks[0].id)
        }
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
    if (!currentLeagueId) return null
    
    const { data, error } = await supabase
      .from('league_admins')
      .select('admin_pin')
      .eq('league_id', currentLeagueId)
      .limit(1)
    
    if (error && error.code !== 'PGRST116') throw error
    return data && data.length > 0 ? data[0].admin_pin : null
  } catch (err) {
    console.error('Error getting admin PIN:', err)
    return null
  }
}

export async function setAdminPin(pin) {
  try {
    if (!currentLeagueId) throw new Error('No league context set')
    
    // Upsert: create or update the first admin entry for this league
    // Using a fixed email identifier for the league's primary admin
    const { error } = await supabase
      .from('league_admins')
      .upsert(
        {
          league_id: currentLeagueId,
          admin_email: 'admin',  // Fixed identifier for league's primary admin
          admin_pin: pin,
        },
        { onConflict: ['league_id', 'admin_email'] }
      )
    
    if (error) throw error
  } catch (err) {
    console.error('Error setting admin PIN:', err)
    throw err
  }
}

/**
 * Fetches player participation data: which weeks each player signed up for
 * Returns: { playerEmail: [weekKeys] }
 */
export async function getPlayerParticipation() {
  try {
    if (!currentLeagueId) return {}
    
    // Query weekly_players with join to weeks table for league filtering
    const { data, error } = await supabase
      .from('weekly_players')
      .select('player_email, week_number, weeks(league_id)')
      .not('player_email', 'is', null)
    
    if (error) throw error
    
    const participation = {}
    for (const row of (data || [])) {
      // Filter by current league
      if (row.weeks?.league_id !== currentLeagueId) continue
      
      const email = row.player_email?.trim().toLowerCase()
      if (email && row.week_number) {
        if (!participation[email]) {
          participation[email] = []
        }
        if (!participation[email].includes(row.week_number)) {
          participation[email].push(row.week_number)
        }
      }
    }
    
    console.log('[getPlayerParticipation] Built participation map:', participation)
    return participation
  } catch (err) {
    console.error('Error getting player participation:', err)
    return {}
  }
}

/**
 * Compute player statistics based on their participation history
 * participation: { playerEmail: [weekKeys] } map from getPlayerParticipation()
 * allWeekKeys: sorted array of all week keys
 */
export function computePlayerStats(player, allWeekKeys, participation = {}) {
  const playerWeeks = participation[player.email] || []
  
  if (playerWeeks.length === 0) {
    return {
      firstWeekKey: null,
      lastWeekKey: null,
      totalWeeks: 0,
      currentStreak: 0,
    }
  }
  
  // Sort player's weeks to get first and last
  const sortedPlayerWeeks = [...playerWeeks].sort((a, b) => compareWeekKeys(a, b))
  const firstWeekKey = sortedPlayerWeeks[0]
  const lastWeekKey = sortedPlayerWeeks[sortedPlayerWeeks.length - 1]
  const totalWeeks = playerWeeks.length
  
  // Calculate current streak (consecutive weeks from most recent)
  const sortedAllWeeks = [...allWeekKeys].sort((a, b) => compareWeekKeys(a, b))
  let currentStreak = 0
  
  // Start from most recent week and count backwards
  for (let i = sortedAllWeeks.length - 1; i >= 0; i--) {
    const weekKey = sortedAllWeeks[i]
    if (playerWeeks.includes(weekKey)) {
      currentStreak++
    } else {
      break // Stop at first week not participated
    }
  }
  
  return {
    firstWeekKey,
    lastWeekKey,
    totalWeeks,
    currentStreak,
  }
}

// ── League Settings (Read-only access to settings, write should go through Supabase UI) ──
/**
 * Fetch league settings from database
 * Used internally to validate requirements for signups
 */
export async function getLeagueSettings(leagueId) {
  try {
    const { data, error } = await supabase
      .from('leagues')
      .select('day_of_week, description, requires_password, password, require_email, require_phone')
      .eq('id', leagueId)
      .single()

    if (error) throw error

    return {
      dayOfWeek: data?.day_of_week || 'Monday',
      description: data?.description,
      requiresPassword: data?.requires_password || false,
      password: data?.password,
      requireEmail: data?.require_email !== false,
      requirePhone: data?.require_phone !== false,
    }
  } catch (err) {
    console.error('Error fetching league settings:', err)
    // Return defaults if settings cannot be fetched
    return {
      dayOfWeek: 'Monday',
      description: null,
      requiresPassword: false,
      password: null,
      requireEmail: true,
      requirePhone: true,
    }
  }
}