import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { callName, type Profile } from '../game/storage'
import { today } from '../game/daily'
import { COOP, canFeedHen, coopOf, isFull, miceFor, raidPending, settleCoop } from '../game/coop'
import { gradeOf, pickCoopQuestion, type CoopQuestion } from '../game/coopQuestions'
import { levelOf } from '../game/levels'
import { rand } from '../game/random'
import { sfx, speak } from '../game/sound'
import { warn } from '../components/Warning'

interface Props {
  profile: Profile
  onFeed: (hen: number) => void
  /** Nhặt hết trứng trong ổ vào kho */
  onCollect: () => void
  /** Chuột tha mất 1 trứng trong ổ */
  onSteal: () => void
  /** Đuổi xong đợt chuột hôm nay */
  onRaidDone: () => void
  onSell: () => void
  onExit: () => void
}

const W = 360
const H = 480
const NEST = { x: 180, y: 372 }
/** Chân gà đứng ở hàng này */
const HEN_Y = 232
/** Chiều cao chuột trên khung 360 */
const MOUSE_H = 50
/** Chuột chạy đi sau khi bị đuổi / tha được trứng */
const FLEE_SPEED = 130
const STEAL_SPEED = 90
/** Giây giữa hai con chuột bò vào */
const SPAWN_EVERY = 2.5

/** care: chăm gà; intro: báo chuột đến; raid: đuổi chuột; result: tổng kết đợt chuột */
type Mode = 'care' | 'intro' | 'raid' | 'result'

interface Mouse {
  id: number
  x: number
  y: number
  /** sneak: bò về ổ; flee: bị đuổi chạy mất; steal: tha trứng chạy đi */
  state: 'sneak' | 'flee' | 'steal'
  phase: number
}

interface Pop {
  id: number
  x: number
  y: number
  text: string
  good: boolean
  age: number
}

interface Raid {
  t: number
  mice: Mouse[]
  toSpawn: number
  spawnIn: number
  /** Trứng còn trong ổ */
  eggs: number
  chased: number
  stolen: number
  /** Con chuột bé vừa chạm, đang làm bài để đuổi (game dừng lại) */
  target: Mouse | null
  question: CoopQuestion | null
  lastQ?: CoopQuestion
  over: boolean
}

let uid = 0

/** Kích thước gốc (px) của ảnh trong public/img/coop, để giữ đúng tỉ lệ */
const SIZE: Record<string, [number, number]> = {
  'coop-house': [616, 555], fence: [416, 120], 'feed-box': [219, 139], nest: [182, 110], egg: [68, 82],
  hen: [159, 181], 'hen-flap': [198, 184], 'hen-happy': [140, 179],
  'mouse-walk-1': [236, 200], 'mouse-walk-2': [211, 195], 'mouse-walk-3': [223, 181],
  'mouse-walk-4': [210, 181], 'mouse-walk-5': [220, 185], 'mouse-walk-6': [221, 192],
  'mouse-think': [214, 255], 'mouse-run': [234, 212], 'mouse-shock': [235, 226], 'mouse-cheese': [208, 222],
}
/** Ảnh vẽ sẵn quay mặt sang trái (còn lại quay sang phải) */
const FACES_LEFT = new Set(['hen', 'hen-flap'])

const img = (name: string) => `/img/coop/${name}.png`

/** Ảnh cao `h`, đáy chạm (x, y); `right`: quay mặt sang phải */
function Sprite({ name, x, y, h, right = true }: { name: string; x: number; y: number; h: number; right?: boolean }) {
  const [nw, nh] = SIZE[name]
  const w = (h * nw) / nh
  const flip = FACES_LEFT.has(name) === right
  return <image href={img(name)} x={-w / 2} y={-h} width={w} height={h} transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`} />
}

const newRaid = (eggs: number): Raid => ({
  t: 0, mice: [], toSpawn: miceFor(eggs), spawnIn: 0.5, eggs, chased: 0, stolen: 0, target: null, question: null, over: false,
})

/** Chuột bò vào từ mép trái, phải hoặc dưới chuồng */
function spawnMouse(): Mouse {
  const side = rand(0, 2)
  const pos = side === 0 ? { x: -30, y: rand(300, 460) } : side === 1 ? { x: W + 30, y: rand(300, 460) } : { x: rand(30, W - 30), y: H + MOUSE_H }
  return { id: uid++, ...pos, state: 'sneak', phase: Math.random() * 6 }
}

const henX = (i: number, n: number) => (W * (i + 1)) / (n + 1)

export default function Coop({ profile, onFeed, onCollect, onSteal, onRaidDone, onSell, onExit }: Props) {
  const coop = settleCoop(coopOf(profile.farm.coop), profile.runs)
  const eggStock = profile.farm.stock.egg ?? 0
  const [grade] = useState(() => gradeOf(profile.age))
  const [tier] = useState(() => levelOf(profile))
  const [mode, setMode] = useState<Mode>(() => (raidPending(coop, today()) ? 'intro' : 'care'))
  const [msg, setMsg] = useState<string | null>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode
  const raid = useRef<Raid>(newRaid(coop.nest))
  const pops = useRef<Pop[]>([])
  const t = useRef(0)
  const svg = useRef<SVGSVGElement>(null)
  const [, setFrame] = useState(0)
  const cb = useRef({ onSteal, onRaidDone })
  cb.current = { onSteal, onRaidDone }
  const name = callName(profile.name)

  // Giữ chữ bay lên trong khung dù chuột đang ở sát mép
  const pop = (text: string, good: boolean, x = W / 2, y = 250) => {
    const half = Math.min(W / 2, text.length * 6)
    pops.current.push({ id: uid++, x: Math.max(half, Math.min(W - half, x)), y, text, good, age: 0 })
  }

  const say = (text: string, voice = true) => {
    setMsg(text)
    if (voice) speak(text)
  }

  /** Chuột tới được ổ hoặc bé trả lời sai: tha mất 1 trứng (hết trứng thì cả đàn bỏ đi) */
  const steal = (r: Raid, m: Mouse) => {
    if (r.eggs <= 0) {
      m.state = 'flee'
      return
    }
    r.eggs--
    r.stolen++
    m.state = 'steal'
    cb.current.onSteal()
    pop('🐭 tha mất 1 🥚!', false, m.x, m.y - MOUSE_H - 6)
    if (r.eggs === 0) {
      r.toSpawn = 0
      for (const o of r.mice) if (o.state === 'sneak') o.state = 'flee'
    }
  }

  useEffect(() => {
    let raf = 0
    let last = performance.now()

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      t.current += dt
      const r = raid.current

      // Đang làm bài thì cả chuồng đứng yên: bài tư duy cần thời gian nghĩ
      if (modeRef.current === 'raid' && !r.over && !r.question) {
        r.t += dt
        r.spawnIn -= dt
        if (r.spawnIn <= 0 && r.toSpawn > 0) {
          r.mice.push(spawnMouse())
          r.toSpawn--
          r.spawnIn = SPAWN_EVERY
        }
        for (const m of r.mice) {
          const dx = NEST.x - m.x
          const dy = NEST.y - m.y
          const d = Math.hypot(dx, dy) || 1
          if (m.state === 'sneak') {
            if (d < 26) {
              sfx.wrong()
              steal(r, m)
            } else {
              m.x += (dx / d) * COOP.mouseSpeed * dt
              m.y += (dy / d) * COOP.mouseSpeed * dt
            }
          } else {
            // Chạy ngược ra khỏi ổ, về phía mình vừa bò vào
            const v = m.state === 'flee' ? FLEE_SPEED : STEAL_SPEED
            m.x -= (dx / d) * v * dt
            m.y -= (dy / d) * v * dt
          }
        }
        r.mice = r.mice.filter((m) => m.x > -60 && m.x < W + 60 && m.y > -20 && m.y < H + MOUSE_H + 20)
        if (r.toSpawn === 0 && r.mice.length === 0) {
          r.over = true
          sfx.win()
          cb.current.onRaidDone()
          speak(r.stolen ? `Đuổi xong lũ chuột! Bị trộm mất ${r.stolen} quả trứng.` : `Giỏi quá ${name}! Không mất quả trứng nào!`)
          setMode('result')
        }
      }

      pops.current = pops.current.map((p) => ({ ...p, age: p.age + dt })).filter((p) => p.age < 1.8)
      setFrame((f) => f + 1)
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const startRaid = () => {
    sfx.tap()
    raid.current = newRaid(coop.nest)
    setMode('raid')
    speak('Chạm vào con chuột rồi trả lời đúng để đuổi nó đi!')
  }

  /** Chạm vào con chuột đang bò: dừng game, hiện bài */
  const tap = (e: PointerEvent<SVGSVGElement>) => {
    const r = raid.current
    const m = svg.current?.getScreenCTM()
    if (mode !== 'raid' || r.over || r.question || !m) return
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    const near = r.mice
      .filter((x) => x.state === 'sneak')
      .map((x) => ({ x, d: Math.hypot(x.x - p.x, x.y - MOUSE_H / 2 - p.y) }))
      .filter(({ d }) => d < 40)
      .sort((a, b) => a.d - b.d)[0]
    if (!near) return
    const q = pickCoopQuestion(grade, tier, r.lastQ)
    r.target = near.x
    r.question = q
    sfx.pop()
    speak(q.speech ?? q.prompt)
  }

  const answer = (i: number) => {
    const r = raid.current
    const q = r.question
    const m = r.target
    if (!q || !m) return
    if (i === q.answer) {
      m.state = 'flee'
      r.chased++
      sfx.correct()
      pop('Đúng rồi! Chuột chạy mất 💨', true, m.x, m.y - MOUSE_H - 6)
    } else {
      sfx.wrong()
      pop(`Đáp án: ${q.choices[q.answer]}`, false, W / 2, 200)
      steal(r, m)
    }
    r.lastQ = q
    r.question = null
    r.target = null
  }

  const feed = (i: number) => {
    const h = coop.hens[i]
    if (isFull(h)) return warn('Gà no căng rồi! Chơi một lượt bán hàng, đào mỏ hay câu cá rồi quay lại nhặt trứng nhé!')
    if (!canFeedHen(h, profile.runs)) return warn('Gà vừa ăn xong. Chơi một lượt nữa rồi cho ăn tiếp nhé!')
    if (profile.coins < COOP.feedCost) return warn('Hết xu mua thức ăn rồi! Bán hàng hoặc đào mỏ để kiếm thêm xu nhé!')
    sfx.coin()
    onFeed(i)
    pop(`🌾 −🪙${COOP.feedCost}`, true, henX(i, coop.hens.length), HEN_Y - 84)
    if (h.fed + 1 >= COOP.feeds) say('Gà ăn no rồi! Chơi một lượt nữa là gà đẻ trứng.')
    else setMsg(null)
  }

  const collect = () => {
    if (!coop.nest) return warn('Ổ chưa có trứng. Cho gà ăn no rồi chơi một lượt để gà đẻ nhé!')
    sfx.win()
    say(`Nhặt được ${coop.nest} quả trứng! Đem ra sạp bán thôi!`)
    onCollect()
  }

  const r = raid.current
  const raiding = mode === 'raid' || mode === 'result'
  const nest = raiding ? r.eggs : coop.nest
  const q = mode === 'raid' ? r.question : null

  return (
    <div className="screen gold-screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onExit} aria-label="Về nông trại">
          ⬅️
        </button>
        <div className="chip">🪙 {profile.coins}</div>
        <div className="chip">Ổ: {nest} 🥚</div>
        <div className="chip">Kho: {eggStock} 🥚</div>
      </header>

      {q ? (
        <button className="drill pond-panel coop-panel" onClick={() => speak(q.speech ?? q.prompt)}>
          {q.image && <img className="coop-q-img" src={q.image} alt="" />}
          <span>{q.prompt}</span>
          <small>Lớp {grade} · đuổi con chuột này · 🔊</small>
        </button>
      ) : mode === 'raid' ? (
        <div className="drill pond-panel coop-panel">
          <span>🐭 Chạm vào chuột!</span>
          <small>
            Đã đuổi {r.chased} · còn {r.mice.filter((m) => m.state === 'sneak').length + r.toSpawn} con
          </small>
        </div>
      ) : (
        <div className="drill pond-panel coop-panel">
          <span>🐔 Chuồng gà</span>
          <small>
            {msg ?? `Mua thức ăn 🪙${COOP.feedCost}/bữa · ăn ${COOP.feeds} bữa thì no · chơi 1 lượt gà đẻ ${COOP.eggsPerLay} 🥚`}
          </small>
        </div>
      )}

      <svg ref={svg} className="mine coop" viewBox={`0 0 ${W} ${H}`} onPointerDown={tap}>
        {/* Sân cỏ, khoảng đất quanh ổ; nhà gà, hàng rào, máng thóc phía sau */}
        <rect width={W} height={H} fill="#a8d86e" />
        {[[40, 300, 60], [320, 270, 50], [60, 455, 70], [305, 455, 60], [250, 170, 70]].map(([x, y, rx], i) => (
          <ellipse key={i} cx={x} cy={y} rx={rx} ry={rx * 0.35} fill="#b9e281" />
        ))}
        <ellipse cx={NEST.x} cy={NEST.y - 4} rx={150} ry={74} fill="#e6cb8f" />
        <Sprite name="fence" x={268} y={96} h={58} />
        <Sprite name="coop-house" x={84} y={158} h={158} />
        <Sprite name="feed-box" x={300} y={150} h={44} />

        {/* Ổ trứng: hàng trứng phía sau vẽ trước */}
        <Sprite name="nest" x={NEST.x} y={NEST.y + 30} h={70} />
        {Array.from({ length: Math.min(nest, 8) }, (_, i) => ({ x: NEST.x - 30 + (i % 4) * 20 + (i >= 4 ? 10 : 0), y: NEST.y + 14 - (i >= 4 ? 10 : 0) }))
          .reverse()
          .map((e, i) => (
            <Sprite key={i} name="egg" x={e.x} y={e.y} h={24} />
          ))}
        {nest > 8 && (
          <text x={NEST.x + 66} y={NEST.y + 4} className="pop good" fontSize={18}>
            ×{nest}
          </text>
        )}
        {nest === 0 && (
          <text x={NEST.x} y={NEST.y + 50} textAnchor="middle" fontSize={13} fill="#6b3d1c" fontWeight={700}>
            Ổ trống
          </text>
        )}

        {/* Gà: đói đứng thường, no thì cười híp mắt, chuột đến thì vỗ cánh hoảng hốt */}
        {coop.hens.map((h, i) => {
          const x = henX(i, coop.hens.length)
          const hop = Math.abs(Math.sin(t.current * (raiding ? 9 : 3) + i)) * (raiding ? 6 : 2)
          const full = isFull(h)
          const hungry = canFeedHen(h, profile.runs)
          return (
            <g key={i} onClick={() => mode === 'care' && feed(i)} style={{ cursor: mode === 'care' ? 'pointer' : 'default' }}>
              <ellipse cx={x} cy={HEN_Y} rx={26} ry={6} fill="#00000022" />
              <Sprite name={raiding ? 'hen-flap' : full ? 'hen-happy' : 'hen'} x={x} y={HEN_Y - hop} h={74} right={i % 2 === 1} />
              {!raiding && (
                <>
                  <g transform={`translate(${x - 30} ${HEN_Y + 8})`}>
                    {Array.from({ length: COOP.feeds }, (_, k) => (
                      <rect key={k} x={(k * 60) / COOP.feeds} width={60 / COOP.feeds - 3} height={8} rx={3} fill={k < h.fed ? '#43a047' : '#fff'} stroke="#8b5a2b" />
                    ))}
                  </g>
                  <text x={x} y={HEN_Y + 30} fontSize={12} textAnchor="middle" fill="#3b2a1a" fontWeight={700}>
                    {full ? '😋 No · sắp đẻ' : hungry ? `🌾 Đói 🪙${COOP.feedCost}` : '✔ Đã ăn'}
                  </text>
                </>
              )}
            </g>
          )
        })}

        {/* Chuột: con ở xa vẽ trước; bò thì chạy 6 khung hình, bị chạm thì đứng suy nghĩ */}
        {mode === 'raid' &&
          [...r.mice]
            .sort((a, b) => a.y - b.y)
            .map((m) => {
              const right = m.state === 'sneak' ? m.x <= NEST.x : m.x >= NEST.x
              const target = m === r.target
              const name = target ? 'mouse-think' : m.state === 'flee' ? 'mouse-run' : `mouse-walk-${1 + (Math.floor(t.current * 10 + m.phase) % 6)}`
              return (
                <g key={m.id}>
                  <ellipse cx={m.x} cy={m.y - 2} rx={20} ry={5} fill="#00000022" />
                  {target && <circle cx={m.x} cy={m.y - MOUSE_H / 2} r={34} fill="none" stroke="#e53935" strokeWidth={3} strokeDasharray="6 4" />}
                  <Sprite name={name} x={m.x} y={m.y} h={target ? MOUSE_H * 1.15 : MOUSE_H} right={right} />
                  {m.state === 'steal' && <Sprite name="egg" x={m.x + (right ? 20 : -20)} y={m.y - 12} h={20} />}
                </g>
              )
            })}

        {pops.current.map((p) => (
          <text key={p.id} x={p.x} y={p.y - p.age * 30} textAnchor="middle" className={`pop ${p.good ? 'good' : 'bad'}`} opacity={1 - p.age / 1.8}>
            {p.text}
          </text>
        ))}
      </svg>

      <div className="pond-bottom">
        {q ? (
          <div className="choices fish-choices coop-choices">
            {q.choices.map((c, i) => (
              <button key={`${q.prompt}-${i}`} className="choice-btn" onClick={() => answer(i)}>
                {c}
              </button>
            ))}
          </div>
        ) : mode === 'raid' ? (
          <p className="mine-tip">Chuột bò về ổ trứng, chạm vào nó để đuổi 👆</p>
        ) : (
          <div className="coop-actions">
            <button className={`btn btn-gold ${coop.nest ? '' : 'locked'}`} onClick={collect}>
              🧺 Nhặt {coop.nest} trứng
            </button>
            <button
              className={`btn btn-primary ${eggStock ? '' : 'locked'}`}
              onClick={() => (eggStock ? onSell() : warn('Kho chưa có trứng. Nhặt trứng trong ổ trước rồi đem ra sạp nhé!'))}
            >
              🛒 Đem ra sạp
            </button>
          </div>
        )}
      </div>

      {mode === 'intro' && (
        <div className="overlay">
          <div className="overlay-card">
            <img className="coop-result-img" src={img('mouse-shock')} alt="" />
            <h2>Lũ chuột đến trộm trứng!</h2>
            <p className="result-text">
              Ổ đang có <b>{coop.nest}</b> quả trứng. Chạm vào từng con chuột và trả lời đúng để đuổi chúng đi. Không cần vội, lúc làm bài lũ chuột
              đứng yên!
            </p>
            <button className="btn btn-primary btn-xl" onClick={startRaid}>
              🧹 Đuổi chuột!
            </button>
          </div>
        </div>
      )}

      {mode === 'result' && (
        <div className="overlay">
          <div className="overlay-card">
            {r.stolen ? <img className="coop-result-img" src={img('mouse-cheese')} alt="" /> : <div className="result-emoji">🏆</div>}
            <h2>{r.stolen ? 'Đuổi xong lũ chuột!' : 'Không mất quả trứng nào!'}</h2>
            <p className="result-text">
              Đuổi được <b>{r.chased}</b> con chuột
              {r.stolen > 0 && (
                <>
                  {' '}
                  · bị trộm <b>{r.stolen}</b> 🥚
                </>
              )}
              <br />
              Ổ còn <b>{r.eggs}</b> quả trứng. Hôm nay lũ chuột không quay lại nữa đâu!
            </p>
            <button className="btn btn-gold btn-xl" onClick={() => setMode('care')}>
              🐔 Về chuồng gà
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
