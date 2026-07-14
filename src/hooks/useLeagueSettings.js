import { useLeague } from '../contexts/LeagueContext'

/**
 * Hook to access league-specific settings
 * Returns an object with all league configuration options
 */
export function useLeagueSettings() {
  const league = useLeague()

  return {
    // League basics
    id: league?.id,
    name: league?.name,
    slug: league?.slug,
    ownerEmail: league?.owner_email,
    
    // Settings
    dayOfWeek: league?.day_of_week || 'Monday',
    description: league?.description,
    requiresPassword: league?.requires_password || false,
    password: league?.password,
    
    // Player field requirements
    requireEmail: league?.require_email !== false, // Default to true
    requirePhone: league?.require_phone !== false, // Default to true
  }
}

/**
 * Returns a label for the day of week
 */
export function getDayOfWeekLabel(dayOfWeek) {
  const days = {
    'Monday': 'Monday',
    'Tuesday': 'Tuesday',
    'Wednesday': 'Wednesday',
    'Thursday': 'Thursday',
    'Friday': 'Friday',
    'Saturday': 'Saturday',
    'Sunday': 'Sunday',
  }
  return days[dayOfWeek] || 'Monday'
}
