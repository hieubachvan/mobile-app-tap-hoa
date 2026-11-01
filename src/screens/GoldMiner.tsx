import { useEffect, useRef, useState } from 'react'
import { callName, type Profile } from '../game/storage'
import { REWARD_RUNS_PER_DAY } from '../game/daily'
import { OPS, tierFor, type Op } from '../game/levels'
import { exprToSpeech, genDrill, type Drill } from '../game/questions'
import { distractors, rand, shuffle } from '../game/random'
import { sfx, speak } from '../game/sound'

interface Props {
  profile: Profile
  /** Luyện riêng một phép tính */
  practice: Op | null
  /** Số lượt còn được nhận xu hôm nay */
  rewardLeft: number
  onFinish: (correct: number, coins: number) => void
  onExit: () => void
}

const W = 360
const H = 560
const GROUND = 110
const PIVOT = { x: W / 2, y: GROUND - 6 }
const ROPE_MIN = 26
const GAME_TIME = 60
const COINS_PER_CORRECT = 3

type NuggetKind = 'gold' | 'rock' | 'diamond'

interface Nugget {
  id: number
  x: number
  y: number
  r: number
  value: number
  kind: NuggetKind
}

interface Pop {
  id: number
  x: number
  y: number
  text: string
  good: boolean
  age: number
}

interface GameState {
  phase: 'swing' | 'shoot' | 'pull'
  t: number
  angle: number
  len: number
  caught: Nugget | null
  nuggets: Nugget[]
  drill: Drill
  correct: number
  tries: number
  timeLeft: number
  over: boolean
  /** Lượt này có được nhận xu không (chốt lúc bắt đầu lượt) */
  rewarded: boolean
  pops: Pop[]
}

let uid = 0

function makeField(drill: Drill): Nugget[] {
  const values = shuffle([drill.answer, ...distractors(drill.answer, 5)])
  const out: Nugget[] = []
  for (const value of values) {
    const roll = Math.random()
    const kind: NuggetKind = roll < 0.12 ? 'diamond' : roll < 0.3 ? 'rock' : 'gold'
    const r = kind === 'diamond' ? 19 : rand(21, 31)
    for (let tries = 0; tries < 200; tries++) {
      const x = rand(r + 8, W - r - 8)
      const y = rand(GROUND + 90, H - r - 12)
      if (out.every((n) => Math.hypot(n.x - x, n.y - y) > n.r + r + 12)) {
        out.push({ id: uid++, x, y, r, value, kind })
        break
      }
    }
  }
  // Luôn phải có đáp án đúng trên sân
  if (!out.some((n) => n.value === drill.answer)) return makeField(drill)
  return out
}

function pullSpeed(n: Nugget | null) {
  if (!n) return 560
  if (n.kind === 'diamond') return 520
  if (n.kind === 'rock') return 150
  return Math.max(190, 460 * Math.pow(21 / n.r, 1.4))
}

function tip(g: GameState) {
  return { x: PIVOT.x + Math.sin(g.angle) * g.len, y: PIVOT.y + Math.cos(g.angle) * g.len }
}

function newGame(tierId: number, rewarded: boolean, op?: Op): GameState {
  const drill = genDrill(tierId, op)
  return {
    phase: 'swing', t: 0, angle: 0, len: ROPE_MIN, caught: null,
    nuggets: makeField(drill), drill, correct: 0, tries: 0, timeLeft: GAME_TIME, over: false, rewarded, pops: [],
  }
}

export default function GoldMiner({ profile, practice, rewardLeft, onFinish, onExit }: Props) {
  const [tierId] = useState(() => tierFor(profile.age, profile.day).id)
  const g = useRef<GameState>(newGame(tierId, rewardLeft > 0, practice ?? undefined))
  const [, setFrame] = useState(0)
  const [round, setRound] = useState(0)
  const finishRef = useRef(onFinish)
  finishRef.current = onFinish
  const nameRef = useRef(callName(profile.name))

  useEffect(() => {
    speak(exprToSpeech(g.current.drill.expr))
  }, [round])

  useEffect(() => {
    let raf = 0
    let last = performance.now()

    const resolveCatch = (s: GameState) => {
      const n = s.caught!
      s.caught = null
      s.tries++
      if (n.value === s.drill.answer) {
        s.correct++
        sfx.correct()
        s.pops.push({ id: uid++, x: PIVOT.x, y: GROUND - 40, text: `${s.drill.expr} = ${n.value} ✓`, good: true, age: 0 })
        s.drill = genDrill(tierId, practice ?? undefined)
        s.nuggets = makeField(s.drill)
        speak(`Đúng rồi! ${exprToSpeech(s.drill.expr)}`)
      } else {
        sfx.wrong()
        s.pops.push({ id: uid++, x: PIVOT.x, y: GROUND - 40, text: `${n.value} chưa đúng ✗`, good: false, age: 0 })
        if (s.nuggets.length < 3) s.nuggets = makeField(s.drill)
      }
    }

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const s = g.current

      if (!s.over) {
        s.timeLeft -= dt
        if (s.timeLeft <= 0) {
          s.timeLeft = 0
          s.over = true
          sfx.win()
          finishRef.current(s.correct, s.correct * COINS_PER_CORRECT)
          speak(`Hết giờ! ${nameRef.current} gắp đúng ${s.correct} lần!`)
        }

        if (s.phase === 'swing') {
          s.t += dt
          s.angle = Math.sin(s.t * 1.8) * 1.25
        } else if (s.phase === 'shoot') {
          s.len += 430 * dt
          const p = tip(s)
          const hit = s.nuggets.find((n) => Math.hypot(n.x - p.x, n.y - p.y) < n.r + 6)
          if (hit) {
            s.caught = hit
            s.nuggets = s.nuggets.filter((n) => n !== hit)
            s.phase = 'pull'
          } else if (p.x < 0 || p.x > W || p.y > H) {
            s.phase = 'pull'
          }
        } else {
          s.len -= pullSpeed(s.caught) * dt
          if (s.caught) {
            const p = tip(s)
            s.caught.x = p.x
            s.caught.y = p.y + s.caught.r * 0.6
          }
          if (s.len <= ROPE_MIN) {
            s.len = ROPE_MIN
            s.phase = 'swing'
            if (s.caught) {
              const before = s.drill
              resolveCatch(s)
              if (s.drill !== before) setRound((r) => r + 1)
            }
          }
        }
      }

      s.pops = s.pops.map((p) => ({ ...p, age: p.age + dt })).filter((p) => p.age < 1.6)
      setFrame((f) => f + 1)
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [tierId, practice])

  const shoot = () => {
    const s = g.current
    if (s.over || s.phase !== 'swing') return
    s.phase = 'shoot'
    sfx.shoot()
  }

  const restart = () => {
    g.current = newGame(tierId, rewardLeft > 0, practice ?? undefined)
    setRound((r) => r + 1)
  }

  const s = g.current
  const p = tip(s)
  const deg = (-s.angle * 180) / Math.PI

  return (
    <div className="screen gold-screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onExit} aria-label="Về tiệm">
          ⬅️
        </button>
        <div className="chip">⏱️ {Math.ceil(s.timeLeft)}s</div>
        <div className="chip">✅ {s.correct}</div>
        <div className="chip">🏆 {Math.max(profile.goldBest, s.correct)}</div>
        <div className={`chip ${s.rewarded ? '' : 'muted'}`} title="Lượt nhận xu hôm nay">
          🪙 {s.rewarded ? `${rewardLeft}/${REWARD_RUNS_PER_DAY}` : 'hết'}
        </div>
      </header>

      <button className="drill" onClick={() => speak(exprToSpeech(s.drill.expr))}>
        <span>{s.drill.expr} = ?</span>
        <small>
          {practice && `${OPS.find((o) => o.op === practice)!.sign} Luyện phép ${OPS.find((o) => o.op === practice)!.name.toLowerCase()} · `}
          Gắp cục vàng có đáp án đúng 🔊
        </small>
      </button>

      <svg className="mine" viewBox={`0 0 ${W} ${H}`} onPointerDown={shoot}>
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8fd3ff" />
            <stop offset="1" stopColor="#d8f1ff" />
          </linearGradient>
          <linearGradient id="dirt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b5733a" />
            <stop offset="1" stopColor="#6b3d1c" />
          </linearGradient>
          <radialGradient id="gold" cx="0.35" cy="0.35">
            <stop offset="0" stopColor="#fff6b0" />
            <stop offset="0.5" stopColor="#ffcc33" />
            <stop offset="1" stopColor="#d18a00" />
          </radialGradient>
          <radialGradient id="rock" cx="0.35" cy="0.35">
            <stop offset="0" stopColor="#d6d0c8" />
            <stop offset="1" stopColor="#7d746a" />
          </radialGradient>
          <linearGradient id="diamond" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e6fbff" />
            <stop offset="1" stopColor="#49c6ff" />
          </linearGradient>
        </defs>

        <rect width={W} height={GROUND} fill="url(#sky)" />
        <rect y={GROUND} width={W} height={H - GROUND} fill="url(#dirt)" />
        <rect y={GROUND} width={W} height={8} fill="#5fae3c" />
        {[[40, 300], [300, 220], [120, 470], [260, 420], [70, 180], [200, 520]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={4} fill="#5a3216" opacity={0.5} />
        ))}

        {/* Chủ tiệm và tời kéo */}
        <text x={PIVOT.x - 52} y={GROUND - 14} fontSize="42">🧒</text>
        <rect x={PIVOT.x - 18} y={GROUND - 28} width={36} height={20} rx={4} fill="#8a5a2b" stroke="#4d2f12" strokeWidth={2} />
        <circle cx={PIVOT.x} cy={GROUND - 18} r={7} fill="#c99a5c" stroke="#4d2f12" strokeWidth={2} />

        {s.nuggets.map((n) => (
          <NuggetView key={n.id} n={n} />
        ))}

        <line x1={PIVOT.x} y1={PIVOT.y} x2={p.x} y2={p.y} stroke="#333" strokeWidth={2.5} />
        {s.caught && <NuggetView n={s.caught} />}
        <g transform={`translate(${p.x} ${p.y}) rotate(${deg})`}>
          <circle r={5} fill="#555" />
          <path d="M -4 2 Q -14 10 -8 20 M 4 2 Q 14 10 8 20" stroke="#444" strokeWidth={4} fill="none" strokeLinecap="round" />
        </g>

        {s.pops.map((pop) => (
          <text
            key={pop.id}
            x={pop.x}
            y={pop.y - pop.age * 30}
            textAnchor="middle"
            className={`pop ${pop.good ? 'good' : 'bad'}`}
            opacity={1 - pop.age / 1.6}
          >
            {pop.text}
          </text>
        ))}
      </svg>

      <p className="mine-tip">Chạm vào màn hình để thả móc 👆</p>

      {s.over && (
        <div className="overlay">
          <div className="overlay-card">
            <div className="result-emoji">{s.correct > 0 ? '🏆' : '⛏️'}</div>
            <h2>Hết giờ!</h2>
            <p className="result-text">
              Gắp đúng <b>{s.correct}</b> / {s.tries} lần
              <br />
              {s.rewarded ? (
                <>
                  Thưởng: <b>🪙 {s.correct * COINS_PER_CORRECT} xu</b>
                </>
              ) : (
                <>Hết lượt nhận xu hôm nay, mai quay lại nhé! Kỷ lục vẫn được tính.</>
              )}
            </p>
            <button className="btn btn-gold btn-xl" onClick={restart}>
              🔁 Chơi lại
            </button>
            <button className="btn btn-primary btn-xl" onClick={onExit}>
              🏪 Về tiệm
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function NuggetView({ n }: { n: Nugget }) {
  const label = (
    <text x={n.x} y={n.y + 6} textAnchor="middle" className="nugget-label" fontSize={n.r > 26 ? 20 : 17}>
      {n.value}
    </text>
  )
  if (n.kind === 'diamond') {
    const r = n.r
    return (
      <g>
        <polygon
          points={`${n.x},${n.y - r} ${n.x + r},${n.y - r * 0.2} ${n.x},${n.y + r} ${n.x - r},${n.y - r * 0.2}`}
          fill="url(#diamond)"
          stroke="#1d8fc4"
          strokeWidth={2}
        />
        {label}
      </g>
    )
  }
  // Cục vàng/đá có mép gồ ghề
  const pts = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2
    const rr = n.r * (0.88 + 0.14 * Math.sin(i * 2.3 + n.id))
    return `${n.x + Math.cos(a) * rr},${n.y + Math.sin(a) * rr}`
  }).join(' ')
  return (
    <g>
      <polygon
        points={pts}
        fill={n.kind === 'rock' ? 'url(#rock)' : 'url(#gold)'}
        stroke={n.kind === 'rock' ? '#5c544b' : '#a86a00'}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {label}
    </g>
  )
}
