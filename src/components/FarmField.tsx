import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { canFeed, cropImage, cropOf, fieldOf, isRipe, stageOf, tileKeys, type Farm, type Plot, type TileAction, type TileFx } from '../game/farm'

/** Ruộng vẽ bằng HTML: dùng khi máy không dựng được cảnh PixiJS */
export interface FarmFieldProps {
  farm: Farm
  /** Số lượt chơi đã xong, để biết cây nào bón được */
  runs: number
  onStrokeStart: () => void
  /** Dùng công cụ đang chọn lên ô; null = ô này không làm gì được */
  onTile: (key: string) => TileFx | null
  onStrokeEnd: () => void
  /** Câu cô chú nông dân nói khi rảnh; null = im lặng */
  chatter: () => string | null
}

interface Farmer {
  id: string
  image: string
  /** Vị trí chân, % theo ruộng */
  x: number
  y: number
  face: 1 | -1
  phase: 'idle' | 'walk' | 'work'
  /** Thời gian đi tới chỗ mới (ms) */
  dur: number
  /** Hết phase hiện tại lúc này (ms) */
  until: number
  /** Đồ nghề đang dùng, vd 💧 */
  tool?: string
  /** Đồ nghề sẽ dùng khi đi tới nơi */
  then?: string
  say?: string
  sayUntil?: number
}

export const FARMERS: Pick<Farmer, 'id' | 'image'>[] = [
  { id: 'chu', image: '/img/cust-nong-dan.webp' },
  { id: 'co', image: '/img/cust-co-tap-de.webp' },
]

const IDLE_TOOLS = ['💧', '💧', '🌾', '🪱']
const SMALL_TALK = ['Trời đẹp quá!', 'Cây lớn nhanh ghê!', 'Ruộng mình đẹp ghê!']
const TICK_MS = 250
/** Ms để đi hết 1% bề ngang ruộng */
const WALK_MS_PER_PCT = 28
const FX_MS = 900

/** Máy bật giảm chuyển động: cô chú đứng yên, chỉ đi khi bé nhờ */
const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]

/** Chỗ đứng trong ô: chân ở phần dưới ô */
function spotOf(farm: Farm, key: string) {
  const { rows, cols } = fieldOf(farm)
  const [r, c] = key.split('-').map(Number)
  return { x: ((c + 0.5) / cols) * 100, y: ((r + 0.85) / rows) * 100 }
}

function walkTo(f: Farmer, to: { x: number; y: number }, now: number, then?: string): Farmer {
  const dur = Math.max(400, Math.hypot(to.x - f.x, to.y - f.y) * WALK_MS_PER_PCT)
  const face = Math.abs(to.x - f.x) < 1 ? f.face : to.x < f.x ? -1 : 1
  return { ...f, ...to, face, phase: 'walk', dur, until: now + dur, tool: undefined, then }
}

/** Hình cây theo giai đoạn, lớn nhẹ dần theo số lần đã bón */
function cropLook(p: Plot) {
  const c = cropOf(p.crop)
  return { emoji: c.emoji, image: cropImage(c.id, stageOf(p)), grow: isRipe(p) ? 1 : 0.85 + (0.15 * p.fed) / c.feeds }
}

export default function FarmField({ farm, runs, onStrokeStart, onTile, onStrokeEnd, chatter }: FarmFieldProps) {
  const { rows, cols } = fieldOf(farm)
  const keys = tileKeys(farm)
  const [fx, setFx] = useState<{ id: number; key: string; fx: TileFx }[]>([])
  const fxId = useRef(0)
  const stroke = useRef<Set<string> | null>(null)
  const talk = useRef(chatter)
  talk.current = chatter
  const farmRef = useRef(farm)
  farmRef.current = farm

  const [farmers, setFarmers] = useState<Farmer[]>(() =>
    FARMERS.map((f, i) => ({ ...f, x: i ? 88 : 12, y: 96, face: i ? -1 : 1, phase: 'idle', dur: 0, until: performance.now() + 800 + i * 1500 })),
  )

  // Ô mới mở rộng: hiện ra có hiệu ứng
  const seen = useRef(new Set(keys))
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  useEffect(() => {
    const added = keys.filter((k) => !seen.current.has(k))
    if (!added.length) return
    added.forEach((k) => seen.current.add(k))
    setFresh(new Set(added))
    const t = window.setTimeout(() => setFresh(new Set()), 900)
    return () => window.clearTimeout(t)
  }, [farm.size])

  // Cô chú đi quanh ruộng: rảnh → đi tới một ô → làm việc → rảnh…
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now()
      setFarmers((list) => {
        let changed = false
        const next = list.map((f) => {
          let g = f
          if (g.say && now > (g.sayUntil ?? 0)) g = { ...g, say: undefined }
          if (now >= g.until) {
            if (g.phase === 'walk') {
              g = { ...g, phase: 'work', tool: g.then ?? pick(IDLE_TOOLS), then: undefined, until: now + 1400 }
            } else if (g.phase === 'work') {
              g = { ...g, phase: 'idle', tool: undefined, until: calm ? Infinity : now + rand(1500, 4000) }
              if (Math.random() < 0.35) g = { ...g, say: talk.current() ?? pick(SMALL_TALK), sayUntil: now + 3000 }
            } else {
              const f2 = farmRef.current
              const planted = Object.keys(f2.tiles)
              const key = planted.length && Math.random() < 0.6 ? pick(planted) : pick(tileKeys(f2))
              g = walkTo(g, spotOf(f2, key), now)
            }
          }
          if (g !== f) changed = true
          return g
        })
        return changed ? next : list
      })
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  /** Bé vừa làm ở ô `key`: người đứng gần nhất chạy tới phụ */
  const callFarmer = (key: string, action: TileAction) => {
    const to = spotOf(farm, key)
    const tool = action === 'plant' ? '🌱' : action === 'feed' ? '✨' : '🧺'
    setFarmers((list) => {
      const near = list.reduce((best, f, i) =>
        Math.hypot(f.x - to.x, f.y - to.y) < Math.hypot(list[best].x - to.x, list[best].y - to.y) ? i : best, 0)
      return list.map((f, i) => (i === near ? walkTo(f, to, performance.now(), tool) : f))
    })
  }

  const hit = (e: PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    const key = el?.closest<HTMLElement>('[data-tile]')?.dataset.tile
    if (!key || !stroke.current || stroke.current.has(key)) return
    stroke.current.add(key)
    const r = onTile(key)
    if (!r) return
    const id = ++fxId.current
    setFx((list) => [...list, { id, key, fx: r }])
    window.setTimeout(() => setFx((list) => list.filter((x) => x.id !== id)), FX_MS)
    callFarmer(key, r.action)
  }

  const end = () => {
    if (!stroke.current) return
    stroke.current = null
    onStrokeEnd()
  }

  return (
    <div
      className="field"
      style={{ '--rows': rows, '--cols': cols } as CSSProperties}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        stroke.current = new Set()
        onStrokeStart()
        hit(e)
      }}
      onPointerMove={(e) => stroke.current && hit(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="field-grid">
        {keys.map((key) => {
          const p = farm.tiles[key]
          const look = p && cropLook(p)
          const ripe = p && isRipe(p)
          const hungry = p && canFeed(p, runs)
          return (
            <div
              key={key}
              data-tile={key}
              className={`tile ${p ? 'planted' : ''} ${ripe ? 'ripe' : ''} ${fresh.has(key) ? 'fresh' : ''}`}
            >
              {look && (
                <span className="tile-crop" style={{ '--grow': look.grow } as CSSProperties} key={`${p.crop}-${p.fed}`}>
                  <img src={look.image} alt={look.emoji} draggable={false} />
                </span>
              )}
              {hungry && <span className="tile-need">✨</span>}
              {p && !ripe && (
                <span className="tile-dots">
                  {Array.from({ length: cropOf(p.crop).feeds }, (_, j) => (
                    <i key={j} className={j < p.fed ? 'on' : ''} />
                  ))}
                </span>
              )}
              {fx
                .filter((x) => x.key === key)
                .map((x) => (
                  <span key={x.id} className={`tile-fx ${x.fx.action}`}>
                    {x.fx.label}
                  </span>
                ))}
            </div>
          )
        })}

        {/* Nằm trong lưới để % vị trí khớp đúng các ô */}
        {farmers.map((f) => (
        <div
          key={f.id}
          className={`farmer ${f.phase} ${f.x < 25 ? 'edge-l' : f.x > 75 ? 'edge-r' : ''}`}
          style={{ left: `${f.x}%`, top: `${f.y}%`, zIndex: 10 + Math.round(f.y), '--dur': `${f.dur}ms` } as CSSProperties}
        >
          {f.say && <div className="farmer-say">{f.say}</div>}
          <img src={f.image} alt="" draggable={false} style={{ '--face': f.face } as CSSProperties} />
          {f.tool && <span className="farmer-tool">{f.tool}</span>}
        </div>
        ))}
      </div>
    </div>
  )
}
