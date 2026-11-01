// Máy chủ trang cấu hình trên VPS (chạy trong Docker, sau Nginx, đường dẫn /config/).
// - Đăng nhập bằng mật khẩu (chỉ lưu bản băm scrypt trong biến môi trường CONFIG_PASS_HASH)
// - Lưu thông số vào /data/tuning.json rồi build lại bản web vào /out (Nginx phục vụ)
// Không dùng thư viện ngoài.
import { createServer } from 'node:http'
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { spawn } from 'node:child_process'
import { extname, join, normalize, relative, sep } from 'node:path'

const APP = process.cwd()
const DATA = process.env.TUNING_DATA ?? '/data/tuning.json'
const OUT = process.env.WEB_OUT ?? '/out'
const PORT = Number(process.env.PORT ?? 3001)
const REPO_TUNING = join(APP, 'src/game/tuning.json')
const UI_DIR = join(APP, 'dist-config')
const BUILD_DIR = join(APP, 'dist-web')

const SESSION_MS = 12 * 60 * 60 * 1000
const MAX_FAILS = 5
const LOCK_MS = 15 * 60 * 1000

// ---------- Mật khẩu ----------

const [algo, saltHex, hashHex] = (process.env.CONFIG_PASS_HASH ?? '').split('$')
if (algo !== 'scrypt' || !saltHex || !hashHex) {
  console.error('Thiếu CONFIG_PASS_HASH (dạng scrypt$<salt hex>$<hash hex>)')
  process.exit(1)
}

function passwordOk(password) {
  const hash = scryptSync(String(password), Buffer.from(saltHex, 'hex'), 32)
  return timingSafeEqual(hash, Buffer.from(hashHex, 'hex'))
}

const sessions = new Map()
/** Số lần sai theo IP: { fails, until } */
const attempts = new Map()

function sessionOf(req) {
  const m = /(?:^|;\s*)tap_hoa_cfg=([a-f0-9]{64})/.exec(req.headers.cookie ?? '')
  const exp = m && sessions.get(m[1])
  if (!exp || exp < Date.now()) return null
  return m[1]
}

const ipOf = (req) => String(req.headers['x-real-ip'] ?? req.socket.remoteAddress)

// ---------- Thông số ----------

/** In JSON gọn: mảng số/chữ nằm trên một dòng (giống trang cấu hình lúc dev) */
const formatJson = (v) =>
  JSON.stringify(v, null, 2).replace(/\[\s+([^[\]{}]*?)\s+\]/g, (_, inner) => `[${inner.split(/,\s+/).join(', ')}]`) + '\n'

/** Ghép bản trên VPS vào bản trong repo: thêm được trường mới khi code cập nhật, giữ giá trị đã chỉnh */
function merge(base, saved) {
  if (Array.isArray(base) || Array.isArray(saved)) return saved ?? base
  if (base && typeof base === 'object' && saved && typeof saved === 'object') {
    const out = { ...base }
    for (const k of Object.keys(saved)) out[k] = k in base ? merge(base[k], saved[k]) : saved[k]
    return out
  }
  return saved ?? base
}

function validTuning(t) {
  return t && typeof t === 'object' && Array.isArray(t.tiers) && t.tiers.length > 0 && t.day && t.coins && t.ages && t.quests
}

// ---------- Build bản web ----------

/** Chạy Vite bằng chính Node đang chạy (không qua npx) */
function vite(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [join(APP, 'node_modules/vite/bin/vite.js'), ...args], { cwd: APP, env: process.env })
    let log = ''
    p.stdout.on('data', (d) => (log += d))
    p.stderr.on('data', (d) => (log += d))
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve(log) : reject(new Error(log.slice(-2000)))))
  })
}

/** Liệt kê file (đường dẫn tương đối) trong thư mục */
function listFiles(dir, base = dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? listFiles(p, base) : [relative(base, p)]
  })
}

/** Chép bản build sang thư mục Nginx: file mới trước, index.html sau cùng, rồi dọn file cũ */
function publish() {
  const files = listFiles(BUILD_DIR)
  for (const f of files) if (f !== 'index.html') cpSync(join(BUILD_DIR, f), join(OUT, f))
  cpSync(join(BUILD_DIR, 'index.html'), join(OUT, 'index.html'))
  const keep = new Set(files)
  if (existsSync(OUT)) for (const f of listFiles(OUT)) if (!keep.has(f)) rmSync(join(OUT, f))
}

let queue = Promise.resolve()
/** Build lần lượt, không chạy chồng */
function rebuild() {
  const job = queue.then(async () => {
    const started = Date.now()
    writeFileSync(REPO_TUNING, readFileSync(DATA))
    await vite(['build', '--outDir', BUILD_DIR, '--emptyOutDir'])
    publish()
    return (Date.now() - started) / 1000
  })
  queue = job.catch(() => {})
  return job
}

// ---------- HTTP ----------

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json',
}

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)
  res.writeHead(status, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers })
  res.end(data)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > 1_000_000) {
        reject(new Error('Dữ liệu quá lớn'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

function serveUi(res, path) {
  const rel = path === '' ? 'config.html' : normalize(path)
  const file = join(UI_DIR, rel)
  if (!file.startsWith(UI_DIR + sep) || !existsSync(file) || statSync(file).isDirectory()) return send(res, 404, 'Không tìm thấy')
  const immutable = rel.startsWith('assets' + sep) || rel.startsWith('assets/')
  send(res, 200, readFileSync(file), {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-store',
  })
}

async function handle(req, res) {
  const url = (req.url ?? '').split('?')[0]
  if (url === '/config') return send(res, 301, '', { Location: '/config/' })
  if (!url.startsWith('/config/')) return send(res, 404, 'Không tìm thấy')
  const path = url.slice('/config/'.length)

  if (path === 'api/login' && req.method === 'POST') {
    const ip = ipOf(req)
    const a = attempts.get(ip)
    if (a && a.until > Date.now()) return send(res, 429, { error: 'locked', minutes: Math.ceil((a.until - Date.now()) / 60000) })
    let password = ''
    try {
      password = JSON.parse(await readBody(req)).password ?? ''
    } catch {
      return send(res, 400, { error: 'bad request' })
    }
    if (!passwordOk(password)) {
      const fails = (a && a.until <= Date.now() && a.fails >= MAX_FAILS ? 0 : (a?.fails ?? 0)) + 1
      attempts.set(ip, { fails, until: fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0 })
      return send(res, 401, { error: 'wrong', left: Math.max(0, MAX_FAILS - fails) })
    }
    attempts.delete(ip)
    const token = randomBytes(32).toString('hex')
    sessions.set(token, Date.now() + SESSION_MS)
    return send(res, 200, { ok: true }, {
      'Set-Cookie': `tap_hoa_cfg=${token}; Path=/config; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}`,
    })
  }

  if (path === 'api/logout' && req.method === 'POST') {
    const token = sessionOf(req)
    if (token) sessions.delete(token)
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'tap_hoa_cfg=; Path=/config; HttpOnly; SameSite=Strict; Max-Age=0' })
  }

  if (path === 'api/tuning') {
    if (!sessionOf(req)) return send(res, 401, { error: 'login' })
    if (req.method === 'GET') return send(res, 200, readFileSync(DATA), { 'Content-Type': 'application/json' })
    // Header riêng buộc trình duyệt kiểm tra CORS: trang web lạ không gửi được
    if (req.method === 'POST' && req.headers['x-tuning'] === '1') {
      let data
      try {
        data = JSON.parse(await readBody(req))
      } catch {
        return send(res, 400, { error: 'JSON không hợp lệ' })
      }
      if (!validTuning(data)) return send(res, 400, { error: 'Thiếu phần cấu hình' })
      const previous = readFileSync(DATA)
      writeFileSync(DATA, formatJson(data))
      try {
        const seconds = await rebuild()
        return send(res, 200, { ok: true, seconds })
      } catch (e) {
        // Build hỏng: trả lại thông số cũ để bản web vẫn đúng với file
        writeFileSync(DATA, previous)
        return send(res, 500, { error: `Build lỗi, đã giữ thông số cũ:\n${e.message}` })
      }
    }
    return send(res, 405, { error: 'method' })
  }

  if (req.method === 'GET') return serveUi(res, path)
  return send(res, 405, 'Method not allowed')
}

// ---------- Khởi động ----------

// Ghép thông số đã chỉnh trên VPS với bản trong repo (có thể vừa thêm trường mới)
const repoTuning = JSON.parse(readFileSync(REPO_TUNING, 'utf8'))
const saved = existsSync(DATA) ? JSON.parse(readFileSync(DATA, 'utf8')) : undefined
writeFileSync(DATA, formatJson(merge(repoTuning, saved)))

createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error(e)
    if (!res.headersSent) send(res, 500, { error: 'Lỗi máy chủ' })
  })
}).listen(PORT, () => console.log(`Trang cấu hình chạy ở cổng ${PORT}`))

rebuild()
  .then((s) => console.log(`Đã build bản web với thông số hiện tại (${s}s)`))
  .catch((e) => console.error('Build lúc khởi động lỗi:', e.message))
