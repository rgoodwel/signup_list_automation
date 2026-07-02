import React, { useState, useEffect } from 'react'
import { supabase } from './utils/supabaseClient'

export default function SupabaseTest() {
  const [status, setStatus] = useState('Testing...')
  const [tables, setTables] = useState([])
  const [weeklyPlayers, setWeeklyPlayers] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    async function runTests() {
      try {
        // Test 1: Check connection
        setStatus('1. Testing Supabase connection...')
        const url = __SUPABASE_URL__
        const key = __SUPABASE_ANON_KEY__

        if (!url || !key) {
          throw new Error('Missing Supabase environment variables (SUPABASE_URL or SUPABASE_ANON_KEY)')
        }

        // Test 2: List available tables
        setStatus('2. Fetching table information...')
        let tablesData = null
        try {
          const { data } = await supabase
            .from('information_schema.tables')
            .select('table_name')
            .eq('table_schema', 'public')
          tablesData = data
        } catch (e) {
          console.log('Note: Could not fetch table schema (this is normal if RLS prevents it)')
        }

        // Test 3: Try to query weekly_players table
        setStatus('3. Querying weekly_players table...')
        let { data: playersData, error: playersError } = await supabase
          .from('weekly_players')
          .select('id, player_name, player_email, hole_number, hole_group, week_number')
          .limit(10)

        if (playersError) {
          setError(`Error fetching weekly-players: ${playersError.message} (code: ${playersError.code})`)
          if (playersError.message.includes('permission') || playersError.message.includes('RLS')) {
            setError(prev => prev + '\n\n💡 This looks like a Row Level Security (RLS) issue. Try:\n1. Disable RLS on the weekly-players table in Supabase\n2. Or create a policy allowing SELECT for anon role')
          }
        } else {
          setWeeklyPlayers(playersData || [])
          setStatus('✅ Connection successful!')
        }

        // Display what we found
        if (tablesData) {
          setTables(tablesData.map(t => t.table_name))
        }

      } catch (err) {
        setError(err.message)
        setStatus('❌ Test failed')
      }
    }

    runTests()
  }, [])

  return (
    <div style={{ padding: '20px', background: '#f5f5f5', borderRadius: '8px', margin: '20px 0', fontFamily: 'monospace' }}>
      <h3>Supabase Connection Test</h3>
      
      <div style={{ marginBottom: '15px' }}>
        <strong>Status:</strong> <code>{status}</code>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <strong>Environment Variables:</strong>
        <div style={{ background: '#fff', padding: '10px', borderRadius: '4px', marginTop: '5px' }}>
          <div>SUPABASE_URL: <code>{__SUPABASE_URL__ || '❌ NOT SET'}</code></div>
          <div>SUPABASE_ANON_KEY: <code>{__SUPABASE_ANON_KEY__ ? '✅ SET' : '❌ NOT SET'}</code></div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee', padding: '10px', borderRadius: '4px', marginBottom: '15px', color: '#c00', whiteSpace: 'pre-wrap' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {tables.length > 0 && (
        <div style={{ marginBottom: '15px' }}>
          <strong>Available Tables ({tables.length}):</strong>
          <ul style={{ background: '#fff', padding: '10px 30px', borderRadius: '4px', marginTop: '5px' }}>
            {tables.map(table => (
              <li key={table} style={{ color: table === 'weekly-players' ? '#080' : '#666' }}>
                {table} {table === 'weekly-players' && '✅'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {weeklyPlayers.length > 0 && (
        <div style={{ marginBottom: '15px' }}>
          <strong>Weekly Players Data ({weeklyPlayers.length} records):</strong>
          <pre style={{ background: '#fff', padding: '10px', borderRadius: '4px', marginTop: '5px', overflowX: 'auto' }}>
            {JSON.stringify(weeklyPlayers, null, 2)}
          </pre>
        </div>
      )}

      {weeklyPlayers.length === 0 && !error && status.includes('✅') && (
        <div style={{ background: '#ffe', padding: '10px', borderRadius: '4px', color: '#880', marginBottom: '15px' }}>
          ℹ️ Connection works but no records in weekly-players table yet.
          <div style={{ fontSize: '12px', marginTop: '8px' }}>
            <strong>Next steps:</strong>
            <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
              <li>Check Supabase dashboard → Tables → verify table exists</li>
              <li>Check the table name (is it <code>weekly-players</code> or <code>weekly_players</code>?)</li>
              <li>Check if data exists in the table</li>
              <li>Check Row Level Security settings</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
