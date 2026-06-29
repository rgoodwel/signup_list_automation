import { Redis } from '@upstash/redis'

const STORAGE_KEY = 'sla:state:v1'

const redis = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
  ? new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    })
  : null

function normalizeState(state) {
  if (!state || typeof state !== 'object') {
    return { players: {}, weeks: {}, currentWeekKey: null, adminPin: null }
  }
  return {
    players: state.players && typeof state.players === 'object' ? state.players : {},
    weeks: state.weeks && typeof state.weeks === 'object' ? state.weeks : {},
    currentWeekKey: typeof state.currentWeekKey === 'string' ? state.currentWeekKey : null,
    adminPin: typeof state.adminPin === 'string' ? state.adminPin : null,
  }
}

export default async function handler(req, res) {
  if (!redis) {
    return res.status(503).json({
      error: 'Backend storage is not configured. Add KV_REST_API_URL and KV_REST_API_TOKEN.',
    })
  }

  try {
    if (req.method === 'GET') {
      const state = normalizeState(await redis.get(STORAGE_KEY))
      return res.status(200).json({ state })
    }

    if (req.method === 'POST') {
      const payload = req.body?.state ?? req.body
      const state = normalizeState(payload)
      await redis.set(STORAGE_KEY, state)
      return res.status(200).json({ ok: true, state })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    return res.status(500).json({
      error: 'Backend storage request failed.',
      details: error?.message || 'Unknown error',
    })
  }
}
