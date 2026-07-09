import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import historyApiFallback from 'connect-history-api-fallback'

export default defineConfig(({ mode }) => {
  // Load environment variables from .env files (including non-VITE_ prefixed)
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [react()],
    define: {
      __SUPABASE_URL__: JSON.stringify(env.SUPABASE_URL),
      __SUPABASE_ANON_KEY__: JSON.stringify(env.SUPABASE_ANON_KEY),
    },
    server: {
      middlewares: [
        // SPA history API fallback: serve index.html for all non-asset routes
        historyApiFallback(),
      ],
    },
  }
})
