import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { initDatabase, dbService } from './electron/database.js'

function localDatabasePlugin() {
  return {
    name: 'local-sqlite-database-middleware',
    configureServer(server) {
      initDatabase()
      server.middlewares.use('/api/db', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', async () => {
          try {
            const { method, args = [] } = JSON.parse(body || '{}')
            if (typeof dbService[method] !== 'function') {
              res.statusCode = 400
              res.end(JSON.stringify({ error: `Method ${method} not found` }))
              return
            }
            const result = await dbService[method](...args)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ data: result, error: null }))
          } catch (err) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ data: null, error: err.message || 'Database error' }))
          }
        })
      })
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    localDatabasePlugin(),
  ],
  server: {
    port: 5174,
    watch: {
      ignored: ['**/data/**', '**/release/**', '**/dist_app/**']
    }
  },
  base: './', // Để Electron load file relative assets chuẩn xác
  build: {
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
