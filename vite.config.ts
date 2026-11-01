import { readFileSync, writeFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const TUNING_FILE = 'src/game/tuning.json'

/** In JSON gọn: mảng số/chữ nằm trên một dòng */
const formatJson = (v: unknown) =>
  JSON.stringify(v, null, 2).replace(/\[\s+([^[\]{}]*?)\s+\]/g, (_, inner: string) => `[${inner.split(/,\s+/).join(', ')}]`) + '\n'

const isLocal = (addr?: string) => addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'

/**
 * Trang cấu hình /config.html: chỉ có khi chạy dev (không vào bản build),
 * chỉ mở được từ chính máy chạy dev server (điện thoại cùng wifi bị chặn).
 */
function tuningPage(): Plugin {
  return {
    name: 'tuning-page',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        if (url !== '/config.html' && url !== '/__tuning' && !url.startsWith('/src/config/')) return next()
        if (!isLocal(req.socket.remoteAddress)) {
          res.statusCode = 403
          res.end('Trang cấu hình chỉ mở được trên máy đang chạy dev server')
          return
        }
        if (url !== '/__tuning') return next()

        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          res.end(readFileSync(TUNING_FILE))
          return
        }
        // Header riêng buộc trình duyệt kiểm tra CORS: trang web lạ không ghi được file
        if (req.method === 'POST' && req.headers['x-tuning'] === '1') {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', () => {
            try {
              const data = JSON.parse(body)
              if (!Array.isArray(data.tiers) || !data.coins || !data.day) throw new Error('Thiếu phần cấu hình')
              writeFileSync(TUNING_FILE, formatJson(data))
              res.end('ok')
            } catch (e) {
              res.statusCode = 400
              res.end(String(e))
            }
          })
          return
        }
        res.statusCode = 405
        res.end()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tuningPage()],
})
