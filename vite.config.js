import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import historyApiFallback from 'connect-history-api-fallback'

export default defineConfig({
  plugins: [react()],
  define: {
    __SUPABASE_URL__: JSON.stringify(process.env.SUPABASE_URL),
    __SUPABASE_ANON_KEY__: JSON.stringify(process.env.SUPABASE_ANON_KEY),
  },
  server: {
    middlewares: [
      // SPA history API fallback: serve index.html for all non-asset routes
      historyApiFallback(),
    ],
  },
})
