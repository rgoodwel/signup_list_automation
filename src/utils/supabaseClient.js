import { createClient } from '@supabase/supabase-js'

const supabaseUrl = __SUPABASE_URL__
const supabaseAnonKey = __SUPABASE_ANON_KEY__

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables not configured. Check .env.development.local')
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')
