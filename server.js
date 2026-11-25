import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { exec } from 'node:child_process'
import { initDatabase, dbService } from './electron/database.js'

const PORT = process.env.PORT || 3888
const DIST_DIR = path.resolve(process.cwd(), 'dist')

// Khởi tạo Database SQLite
initDatabase()

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const server = http.createServer(async (req, res) => {
  // 1. API Route: /api/db
  if (req.url === '/api/db' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const { method, args = [] } = JSON.parse(body || '{}')
        if (typeof dbService[method] !== 'function') {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `Method ${method} không tồn tại` }))
          return
        }
        const result = await dbService[method](...args)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ data: result, error: null }))
      } catch (err) {
        console.error('[Server DB Error]', err)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ data: null, error: err.message || 'Lỗi cơ sở dữ liệu' }))
      }
    })
    return
  }

  // 2. Static File Serving từ dist/
  const urlPath = req.url.split('?')[0]
  let filePath = path.join(DIST_DIR, urlPath === '/' ? 'index.html' : urlPath)

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html')
  }

  const ext = path.extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500)
      res.end('Server Error')
    } else {
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      })
      res.end(content)
    }
  })
})

server.listen(PORT, '0.0.0.0', () => {
  const url = `http://localhost:${PORT}`
  console.log(`====================================================`)
  console.log(`  FUHA CAFE POS (BẢN OFFLINE HOÀN TOÀN)`)
  console.log(`  Máy chủ đang chạy tại: ${url}`)
  console.log(`  SQLite Database: data/fuha-pos.db (WAL Mode)`)
  console.log(`  Không cần kết nối Internet`)
  console.log(`====================================================`)

  // Tự động mở trình duyệt hoặc app mode nếu được yêu cầu
  if (process.env.OPEN_BROWSER !== 'false') {
    const startCmd = process.platform === 'win32'
      ? `start "" msedge --app=${url} 2>nul || start "" "${url}"`
      : `open "${url}"`
    exec(startCmd, () => {})
  }
})
