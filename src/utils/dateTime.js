const EASTERN_TIME_ZONE = 'America/New_York'
const EASTERN_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
  timeZoneName: 'short',
})

function parseSupabaseTimestamp(value) {
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  if (typeof value !== 'string') return new Date(NaN)

  const raw = value.trim()
  if (!raw) return new Date(NaN)

  // Supabase timestamps may arrive as "YYYY-MM-DD HH:mm:ss" without timezone.
  // Normalize to ISO UTC so conversion to Eastern Time is deterministic.
  const isoLike = raw.replace(' ', 'T')
  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(isoLike)
  const normalized = hasTimezone ? isoLike : `${isoLike}Z`
  return new Date(normalized)
}

export function formatTimestampEastern(value) {
  if (!value) return '-'

  const date = parseSupabaseTimestamp(value)
  if (Number.isNaN(date.getTime())) return '-'

  return EASTERN_TIMESTAMP_FORMATTER.format(date)
}
