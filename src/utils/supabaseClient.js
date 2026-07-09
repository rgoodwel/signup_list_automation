import { createClient } from '@supabase/supabase-js'

const supabaseUrl = __SUPABASE_URL__
const supabaseAnonKey = __SUPABASE_ANON_KEY__

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase environment variables not configured:')
  console.error('   VITE_SUPABASE_URL:', supabaseUrl ? '✓ set' : '✗ MISSING')
  console.error('   VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✓ set' : '✗ MISSING')
  console.error('   Check .env.development.local file')
} else {
  console.log('✓ Supabase configured:', supabaseUrl.substring(0, 30) + '...')
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')
