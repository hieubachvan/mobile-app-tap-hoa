import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { callName, type Profile } from '../game/storage'
import { REWARD_RUNS_PER_DAY } from '../game/daily'
import { warn } from '../components/Warning'
import { FISH_KINDS } from '../game/farm'
import { MAX_LEVEL, agePatience, levelOf } from '../game/levels'
import { exprToSpeech, genDrill, makeChoices, type Drill } from '../game/questions'
import { pick, rand } from '../game/random'
import { sfx, speak } from '../game/sound'
import { TUNING } from '../game/tuning'

interface Props {
  profile: Profile
  /** Số lượt còn được giữ cá hôm nay */
  rewardLeft: number
  /** `fish`: số cá mỗi loại trong xô lúc hết giờ (rỗng nếu lượt không có thưởng) */
  onFinish: (correct: number, fish: Record<string, number>) => void
  /** Đem cá ra sạp bán */
  onSell: () => void
  onExit: () => void
}

const W = 360
const H = 560
/** Mặt nước */
const SURFACE = 130
/** Đầu cần câu và chỗ phao nổi */
const TIP = { x: 150, y: 44 }
const BOB = { x: 176, y: SURFACE }
const GAME_TIME = TUNING.farm.pond.seconds
const BUCKET = TUNING.farm.pond.bucket
/** Sai / hết giờ bấy nhiêu lần thì cá sổng */
const MISSES = TUNING.farm.pond.misses
/** Mỗi chỗ bơi trong ao dành cho một loại cá; cá bé bơi gần mặt nước, cá lớn ở đáy */
const SLOTS = FISH_KINDS.flatMap((k, i) => Array.from({ length: k.count }, () => i))
/** Theo loại cá: cỡ thân, tốc độ bơi */
const LOOK = [
  { size: [15, 17], speed: [50, 70] },
  { size: [22, 24], speed: [36, 50] },
  { size: [32, 34], speed: [22, 30] },
]
/** Theo loại cá: các sprite ảnh được chọn ngẫu nhiên cho mỗi con (mặt cá quay sang trái) */
const SPRITE_POOL = [
  ['fish-orange-s', 'fish-purple-s', 'fish-blue-s', 'fish-yellow-s', 'fish-green-s'],
  ['fish-orange-m', 'fish-purple-m', 'fish-blue-m', 'fish-yellow-m', 'fish-green-m'],
  ['shark-1', 'shark-2', 'shark-3'],
]
/** Kích thước gốc (px) của từng ảnh cá, để giữ đúng tỉ lệ khi phóng theo `size` */
const SPRITE_SIZE: Record<string, [number, number]> = {
  'fish-orange-s': [101, 77], 'fish-purple-s': [110, 84], 'fish-blue-s': [102, 83], 'fish-yellow-s': [108, 84], 'fish-green-s': [104, 78],
  'fish-orange-m': [132, 104], 'fish-purple-m': [129, 102], 'fish-blue-m': [133, 103], 'fish-yellow-m': [123, 100], 'fish-green-m': [132, 107],
  'shark-1': [243, 141], 'shark-2': [198, 153], 'shark-3': [177, 148],
}

interface Pt {
  x: number
  y: number
}

interface Fish {
  id: number
  /** Làn bơi, cũng là chỉ số trong SLOTS */
  lane: number
  /** Chỉ số loại cá trong FISH_KINDS */
  kind: number
  /** Tâm thân cá */
  x: number
  y: number
  dir: 1 | -1
  speed: number
  size: number
  sprite: string
  phase: number
  /** Còn bấy nhiêu giây bơi vội (vừa sổng câu) */
  flee: number
}

interface Pop {
  id: number
  text: string
  good: boolean
  age: number
}

interface Splash {
  id: number
  x: number
  y: number
  age: number
}

interface GameState {
  /** idle: phao nổi chờ; cast: lưỡi câu bay tới con cá; fight: cá vùng vẫy, bé làm phép tính; reel: kéo dây về */
  phase: 'idle' | 'cast' | 'fight' | 'reel'
  t: number
  hook: Pt
  /** Cá đang cắn câu (null khi kéo dây không về vì cá sổng) */
  target: Fish | null
  fish: Fish[]
  drill: Drill | null
  choices: number[]
  /** Giây còn lại và tổng giây của phép đang làm */
  qLeft: number
  qTime: number
  /** Số phép đúng / sai với con cá đang vùng vẫy */
  pulled: number
  misses: number
  correct: number
  tries: number
  /** Cá trong xô theo loại */
  bucket: Record<string, number>
  escaped: number
  timeLeft: number
  over: boolean
  /** Lượt này có được giữ cá không (chốt lúc bắt đầu lượt) */
  rewarded: boolean
  pops: Pop[]
  splashes: Splash[]
}

let uid = 0

const laneY = (lane: number) => SURFACE + 60 + lane * ((H - SURFACE - 110) / Math.max(1, SLOTS.length - 1))

function newFish(lane: number, fromEdge: boolean): Fish {
  const kind = SLOTS[lane]
  const look = LOOK[Math.min(kind, LOOK.length - 1)]
  const dir = Math.random() < 0.5 ? 1 : -1
  return {
    id: uid++,
    lane,
    kind,
    dir,
    x: fromEdge ? (dir === 1 ? -50 : W + 50) : rand(40, W - 40),
    y: laneY(lane),
    speed: rand(look.speed[0], look.speed[1]),
    size: rand(look.size[0], look.size[1]),
    sprite: pick(SPRITE_POOL[Math.min(kind, SPRITE_POOL.length - 1)]),
    phase: Math.random() * 6,
    flee: 0,
  }
}

function newGame(rewarded: boolean): GameState {
  return {
    phase: 'idle', t: 0, hook: { ...BOB }, target: null, fish: SLOTS.map((_, lane) => newFish(lane, false)),
    drill: null, choices: [], qLeft: 0, qTime: 1, pulled: 0, misses: 0,
    correct: 0, tries: 0, bucket: {}, escaped: 0, timeLeft: GAME_TIME, over: false, rewarded, pops: [], splashes: [],
  }
}

const total = (b: Record<string, number>) => Object.values(b).reduce((a, n) => a + n, 0)

/** Miệng cá: chỗ lưỡi câu móc vào */
const mouthOf = (f: Fish): Pt => ({ x: f.x + f.dir * f.size * 0.95, y: f.y })

export default function FishPond({ profile, rewardLeft, onFinish, onSell, onExit }: Props) {
  const [tierId] = useState(() => levelOf(profile))
  /** Bé nhỏ tuổi được nghĩ lâu hơn */
  const [patience] = useState(() => agePatience(profile.age))
  const g = useRef<GameState>(newGame(rewardLeft > 0))
  const svg = useRef<SVGSVGElement>(null)
  const [, setFrame] = useState(0)
  const finishRef = useRef(onFinish)
  finishRef.current = onFinish
  const nameRef = useRef(callName(profile.name))

  const splash = (s: GameState, x: number) => s.splashes.push({ id: uid++, x, y: SURFACE, age: 0 })

  /** Phép tính kế tiếp cho con cá đang vùng vẫy: cá càng lớn phép càng khó, thời gian càng ngắn */
  const nextDrill = (s: GameState) => {
    const kind = FISH_KINDS[s.target!.kind]
    const drill = genDrill(Math.max(1, Math.min(MAX_LEVEL, tierId + kind.tierShift)))
    s.drill = drill
    s.choices = makeChoices(drill.answer, 3)
    s.qTime = kind.seconds * patience
    s.qLeft = s.qTime
    speak(exprToSpeech(drill.expr))
  }

  /** Sai hoặc hết giờ: cá giật dây xuống sâu, quá MISSES lần thì sổng */
  const miss = (s: GameState) => {
    const f = s.target!
    const kind = FISH_KINDS[f.kind]
    sfx.wrong()
    s.misses++
    s.pulled = Math.max(0, s.pulled - 1)
    splash(s, f.x)
    if (s.misses < MISSES) {
      s.pops.push({ id: uid++, text: `${s.drill!.expr} = ${s.drill!.answer} · cá giật dây!`, good: false, age: 0 })
      nextDrill(s)
      return
    }
    s.escaped++
    s.pops.push({ id: uid++, text: `${kind.emoji} ${kind.name} sổng mất rồi!`, good: false, age: 0 })
    speak(`${kind.name} sổng mất rồi!`)
    f.flee = 2
    f.dir = Math.random() < 0.5 ? 1 : -1
    s.target = null
    s.drill = null
    s.phase = 'reel'
  }

  const answer = (v: number) => {
    const s = g.current
    if (s.phase !== 'fight' || !s.drill || !s.target) return
    s.tries++
    if (v !== s.drill.answer) return miss(s)
    s.correct++
    s.pulled++
    sfx.correct()
    const kind = FISH_KINDS[s.target.kind]
    if (s.pulled >= kind.questions) {
      s.drill = null
      s.phase = 'reel'
      speak('Kéo lên nào!')
    } else {
      s.pops.push({ id: uid++, text: 'Đúng rồi! Kéo tiếp!', good: true, age: 0 })
      nextDrill(s)
    }
  }

  useEffect(() => {
    if (rewardLeft <= 0) warn('Hôm nay hết lượt giữ cá rồi. Vẫn câu được để luyện tập nhưng cá sẽ được thả lại ao, cây và gà cũng không lớn thêm nhé!')
  }, [])

  useEffect(() => {
    let raf = 0
    let last = performance.now()

    /** Cá lên bờ, vào xô; con mới bơi vào thế chỗ */
    const land = (s: GameState) => {
      const f = s.target!
      const kind = FISH_KINDS[f.kind]
      s.target = null
      s.bucket = { ...s.bucket, [kind.id]: (s.bucket[kind.id] ?? 0) + 1 }
      sfx.win()
      s.pops.push({ id: uid++, text: `+1 ${kind.emoji} ${kind.name}!`, good: true, age: 0 })
      speak(`Câu được ${kind.name.toLowerCase()} rồi!`)
      s.fish = s.fish.map((x) => (x === f ? newFish(f.lane, true) : x))
    }

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const s = g.current
      s.t += dt

      if (!s.over) {
        s.timeLeft = Math.max(0, s.timeLeft - dt)
        // Hết giờ, hoặc xô đầy thì xong lượt; con cá đang câu dở vẫn được câu nốt
        const full = total(s.bucket) >= BUCKET
        if ((s.timeLeft <= 0 || full) && s.phase === 'idle') {
          s.over = true
          sfx.win()
          finishRef.current(s.correct, s.rewarded ? s.bucket : {})
          speak(`${full ? 'Đầy xô rồi!' : 'Hết giờ!'} ${nameRef.current} câu được ${total(s.bucket)} con cá!`)
        }

        for (const f of s.fish) {
          if (f === s.target && s.phase !== 'cast') continue
          // Cá bơi ngang, ra khỏi mép này thì vào lại từ mép kia
          f.x += f.dir * f.speed * (f.flee > 0 ? 3 : 1) * dt
          f.flee = Math.max(0, f.flee - dt)
          if (f.x > W + 55) f.x = -55
          if (f.x < -55) f.x = W + 55
          const y = laneY(f.lane) + Math.sin(s.t * 2 + f.phase) * 5
          f.y += (y - f.y) * Math.min(1, dt * 3)
        }

        if (s.phase === 'cast' && s.target) {
          const to = mouthOf(s.target)
          const d = Math.hypot(to.x - s.hook.x, to.y - s.hook.y)
          const step = 900 * dt
          if (d <= step) {
            s.hook = to
            s.phase = 'fight'
            s.pulled = 0
            s.misses = 0
            sfx.pop()
            const kind = FISH_KINDS[s.target.kind]
            s.pops.push({ id: uid++, text: `${kind.emoji} ${kind.name} cắn câu!`, good: true, age: 0 })
            nextDrill(s)
          } else {
            s.hook = { x: s.hook.x + ((to.x - s.hook.x) / d) * step, y: s.hook.y + ((to.y - s.hook.y) / d) * step }
          }
        } else if (s.phase === 'fight' && s.target) {
          // Cá vùng vẫy tại chỗ; mỗi phép đúng kéo nó lên gần mặt nước hơn
          const f = s.target
          const kind = FISH_KINDS[f.kind]
          f.x = Math.max(40, Math.min(W - 40, f.x + Math.sin(s.t * 5 + f.phase) * 60 * dt))
          const top = SURFACE + f.size + 14
          const y = laneY(f.lane) + (top - laneY(f.lane)) * (s.pulled / kind.questions)
          f.y += (y - f.y) * Math.min(1, dt * 5)
          s.hook = mouthOf(f)
          s.qLeft = Math.max(0, s.qLeft - dt)
          if (s.qLeft <= 0) {
            s.tries++
            miss(s)
          }
        } else if (s.phase === 'reel') {
          const d = Math.hypot(BOB.x - s.hook.x, BOB.y - s.hook.y)
          const step = 380 * dt
          if (d <= step) {
            s.hook = { ...BOB }
            s.phase = 'idle'
            splash(s, BOB.x)
            if (s.target) land(s)
          } else {
            s.hook = { x: s.hook.x + ((BOB.x - s.hook.x) / d) * step, y: s.hook.y + ((BOB.y - s.hook.y) / d) * step }
          }
          // Cá treo trên lưỡi câu
          const f = s.target
          if (f) {
            f.x = s.hook.x - f.dir * f.size * 0.95
            f.y = s.hook.y
          }
        }
      }

      s.pops = s.pops.map((p) => ({ ...p, age: p.age + dt })).filter((p) => p.age < 1.8)
      s.splashes = s.splashes.map((p) => ({ ...p, age: p.age + dt })).filter((p) => p.age < 0.8)
      setFrame((f) => f + 1)
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  /** Chạm vào con cá: quăng lưỡi câu tới nó */
  const cast = (e: PointerEvent<SVGSVGElement>) => {
    const s = g.current
    const m = svg.current?.getScreenCTM()
    if (s.over || s.phase !== 'idle' || s.timeLeft <= 0 || !m) return
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    const near = s.fish
      .map((f) => ({ f, d: Math.hypot(f.x - p.x, f.y - p.y) }))
      .filter(({ f, d }) => d < f.size + 24)
      .sort((a, b) => a.d - b.d)[0]
    if (!near) {
      if (p.y > SURFACE) splash(s, p.x)
      return
    }
    s.target = near.f
    s.phase = 'cast'
    sfx.shoot()
  }

  const restart = () => {
    g.current = newGame(rewardLeft > 0)
  }

  const s = g.current
  const line = s.phase === 'idle' ? { x: BOB.x, y: BOB.y + Math.sin(s.t * 3) * 2 } : s.hook
  const fighting = s.phase === 'fight' && s.drill && s.target
  const kind = s.target ? FISH_KINDS[s.target.kind] : null
  const caught = total(s.bucket)

  return (
    <div className="screen gold-screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onExit} aria-label="Về nông trại">
          ⬅️
        </button>
        <div className="chip">⏱️ {Math.ceil(s.timeLeft)}s</div>
        <div className="chip">
          🪣 {caught}/{BUCKET} 🐟
        </div>
        <div className={`chip ${s.rewarded ? '' : 'muted'}`} title="Lượt được giữ cá hôm nay">
          🎣 {s.rewarded ? `${rewardLeft}/${REWARD_RUNS_PER_DAY}` : 'hết'}
        </div>
      </header>

      {fighting && kind ? (
        <button className="drill pond-panel" onClick={() => speak(exprToSpeech(s.drill!.expr))}>
          <span>{s.drill!.expr} = ?</span>
          <div className="fish-timer">
            <i className={s.qLeft / s.qTime < 0.35 ? 'low' : ''} style={{ width: `${(s.qLeft / s.qTime) * 100}%` }} />
          </div>
          <small>
            {kind.emoji} {kind.name} vùng vẫy · kéo {s.pulled}/{kind.questions} · {'🪝'.repeat(Math.max(0, MISSES - s.misses))} 🔊
          </small>
        </button>
      ) : (
        <div className="drill pond-panel">
          <span className="fish-legend">
            {FISH_KINDS.map((k) => (
              <b key={k.id}>
                {k.emoji} {k.questions} phép
              </b>
            ))}
          </span>
          <small>Cá càng to càng đắt nhưng vùng vẫy càng dữ!</small>
        </div>
      )}

      <svg ref={svg} className="mine pond" viewBox={`0 0 ${W} ${H}`} onPointerDown={cast}>
        <image href="/img/pond/pond-top.png" x={0} y={0} width={W} height={SURFACE} preserveAspectRatio="none" />
        <image href="/img/pond/pond-water.png" x={0} y={SURFACE} width={W} height={H - SURFACE} preserveAspectRatio="none" />
        {/* Gợn sóng mặt ao */}
        {[0, 1, 2, 3].map((i) => (
          <ellipse key={i} cx={((s.t * 14 + i * 100) % (W + 60)) - 30} cy={SURFACE + 14 + i * 6} rx={22} ry={3} fill="#ffffff" opacity={0.25} />
        ))}
        {/* Bọt nước */}
        {[60, 140, 210, 300].map((x, i) => (
          <circle key={x} cx={x + Math.sin(s.t * 2 + i) * 4} cy={H - ((s.t * 35 + i * 110) % (H - SURFACE))} r={3 + (i % 2)} fill="#ffffff" opacity={0.35} />
        ))}

        {/* Bé ngồi câu và xô cá */}
        <image href="/img/pond/bucket.png" x={0} y={100} width={34} height={39} />
        <image href="/img/pond/boy-fish.png" x={22} y={44} width={55} height={100} />
        <line x1={66} y1={SURFACE - 44} x2={TIP.x} y2={TIP.y} stroke="#6d4c2f" strokeWidth={4} strokeLinecap="round" />

        {s.fish.map((f) => (
          <FishView key={f.id} f={f} t={s.t} hooked={f === s.target && s.phase !== 'cast'} />
        ))}

        <line
          x1={TIP.x}
          y1={TIP.y}
          x2={line.x}
          y2={line.y}
          stroke={fighting ? '#b3261e' : '#333'}
          strokeWidth={fighting ? 2.5 : 1.5}
        />
        {s.phase === 'idle' ? (
          <g transform={`translate(${line.x} ${line.y})`}>
            <circle r={7} fill="#fff" stroke="#333" strokeWidth={1.5} />
            <path d="M -7 0 A 7 7 0 0 0 7 0 Z" fill="#e53935" />
          </g>
        ) : (
          <path d={`M ${line.x} ${line.y - 6} v 10 a 5 5 0 0 1 -9 0`} stroke="#555" strokeWidth={2.5} fill="none" strokeLinecap="round" />
        )}

        {s.splashes.map((p) => (
          <ellipse key={p.id} cx={p.x} cy={p.y} rx={6 + p.age * 40} ry={2 + p.age * 10} fill="none" stroke="#fff" strokeWidth={2} opacity={1 - p.age / 0.8} />
        ))}

        {s.pops.map((pop) => (
          <text
            key={pop.id}
            x={W / 2}
            y={SURFACE + 40 - pop.age * 30}
            textAnchor="middle"
            className={`pop ${pop.good ? 'good' : 'bad'}`}
            opacity={1 - pop.age / 1.8}
          >
            {pop.text}
          </text>
        ))}
      </svg>

      <div className="pond-bottom">
        {fighting ? (
          <div className="choices fish-choices">
            {s.choices.map((v) => (
              <button key={`${s.drill!.expr}-${v}`} className="choice-btn" onClick={() => answer(v)}>
                {v}
              </button>
            ))}
          </div>
        ) : (
          <p className="mine-tip">Chạm vào con cá muốn câu để quăng lưỡi 👆</p>
        )}
      </div>

      {s.over && (
        <div className="overlay">
          <div className="overlay-card">
            <div className="result-emoji">{caught > 0 ? '🐟' : '🎣'}</div>
            <h2>{caught >= BUCKET ? 'Đầy xô rồi!' : 'Hết giờ!'}</h2>
            <p className="result-text">
              Làm đúng <b>{s.correct}</b> / {s.tries} phép
              {s.escaped > 0 && <> · {s.escaped} con sổng</>}
              <br />
              {s.rewarded ? (
                caught > 0 ? (
                  <>
                    Xô cá:{' '}
                    <b>
                      {FISH_KINDS.filter((k) => s.bucket[k.id]).map((k) => `${k.emoji} ${s.bucket[k.id]}`).join('  ')}
                    </b>
                    , đã cất vào kho
                  </>
                ) : (
                  <>Chưa câu được con nào, thử lại nhé!</>
                )
              ) : (
                <>Hết lượt giữ cá hôm nay nên cá được thả lại ao. Mai quay lại nhé!</>
              )}
            </p>
            {s.rewarded && caught > 0 && (
              <button className="btn btn-primary btn-xl" onClick={onSell}>
                🛒 Đem cá ra sạp bán
              </button>
            )}
            <button className="btn btn-gold btn-xl" onClick={restart}>
              🔁 Câu tiếp
            </button>
            <button className="btn btn-xl" onClick={onExit}>
              🌾 Về nông trại
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function FishView({ f, t, hooked }: { f: Fish; t: number; hooked: boolean }) {
  // Cá bị móc thì giãy
  const wiggle = hooked ? Math.sin(t * 20) * 16 : Math.sin(t * 6 + f.phase) * 4
  // Ảnh cá vẽ sẵn quay đầu sang trái nên lật theo hướng bơi ngược dấu `dir`
  const [nw, nh] = SPRITE_SIZE[f.sprite]
  const h = f.size * 2.2
  const w = (h * nw) / nh
  return (
    <g transform={`translate(${f.x} ${f.y}) scale(${-f.dir} 1) rotate(${wiggle})`}>
      <image href={`/img/pond/${f.sprite}.png`} x={-w / 2} y={-h / 2} width={w} height={h} />
    </g>
  )
}
