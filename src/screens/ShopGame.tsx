import { useEffect, useMemo, useRef, useState } from 'react'
import { callName, type Profile } from '../game/storage'
import { agePatienceFactor, practiceTier, tierOf, type Op } from '../game/levels'
import { cropOf, isRipe, marketPrices, practiceGoods, produceBonus, produceIn, shelfGoods } from '../game/farm'
import { shopLevel } from '../game/shopLevels'
import StreetScene, { type StreetHandle } from '../components/StreetScene'
import { PERFECT_BONUS, PROFIT_PER_CUSTOMER, coinBonus, extraCustomers, patienceBonus } from '../game/upgrades'
import { CURRENCY, NO_PRICE_KINDS, genVisit, makeChoices, type Visit } from '../game/questions'
import { sfx, speak } from '../game/sound'
import { TUNING } from '../game/tuning'
import AnswerInput from '../components/AnswerInput'
import HintDots from '../components/HintDots'
import { warn } from '../components/Warning'

export interface DayResult {
  stars: number
  coins: number
  passed: boolean
  /** Số khách phục vụ xong (không bỏ về) */
  served: number
  /** Số khách được trả lời đúng ngay mọi câu */
  perfect: number
  /** Nông sản nhà trồng đã bán, theo loại cây */
  sold: Record<string, number>
  /** Ngày đủ dài (đủ số câu tối thiểu) để tính vào tiến độ lên cấp */
  counted: boolean
}

interface Props {
  profile: Profile
  /** Nông sản bé bày lên kệ, theo loại cây (Luyện riêng không dùng) */
  shelf: Record<string, number>
  /** Luyện riêng một phép tính, không tính vào tiến độ ngày */
  practice: Op | null
  /** Lượt này có được nhận xu không (Luyện riêng giới hạn lượt thưởng mỗi ngày) */
  rewarded: boolean
  onFinish: (r: DayResult) => void
  onExit: () => void
  onGoldBonus: () => void
}

type Feedback = null | 'ok' | 'bad' | 'reveal' | 'leave'

const praises = (name: string) => ['Giỏi quá!', 'Đúng rồi!', 'Tuyệt vời!', `${name} siêu ghê!`, 'Chính xác!']

/** Khách vừa vào và đang nói: chưa trừ kiên nhẫn */
const GRACE_MS = TUNING.day.graceSeconds * 1000
const TICK_MS = 100
/** Trả lời sai làm khách sốt ruột thêm (tỉ lệ trên tổng kiên nhẫn) */
const WRONG_PENALTY = TUNING.day.wrongPenalty
const MAX_RATING = 3
/** Khách cuối mua xong: chờ khách xách túi đi rồi mới hiện kết quả */
const LAST_EXIT_MS = 1300

function starsFor(ratio: number) {
  const [one, two, three] = TUNING.day.stars
  if (ratio >= three) return 3
  if (ratio >= two) return 2
  if (ratio >= one) return 1
  return 0
}

export default function ShopGame({ profile, shelf, practice, rewarded: rewardedProp, onFinish, onExit, onGoldBonus }: Props) {
  // Chốt ngày/cấp lúc mở sạp để kết quả không đổi khi profile cập nhật
  const [day] = useState(profile.day)
  const [rewarded] = useState(rewardedProp)
  useEffect(() => {
    if (!rewarded) warn('Hôm nay hết lượt nhận xu ở Luyện riêng rồi. Vẫn luyện được nhưng không được cộng xu, cây và gà cũng không lớn thêm nhé!')
  }, [])
  const [tier] = useState(() => {
    const t = tierOf(profile)
    return practice ? practiceTier(t, practice) : t
  })
  const [goods] = useState(() => {
    const prices = marketPrices(tier, profile)
    return practice ? practiceGoods(profile.day, prices) : shelfGoods(shelf, prices)
  })
  const [visits] = useState(() => {
    // Giữ chỗ hàng cho từng khách để không hứa bán quá số trên kệ
    const left = goods.map((g) => ({ ...g }))
    const next = () => {
      const v = genVisit(tier, left, callName(profile.name))
      for (const l of v?.lines ?? []) left.find((g) => g.item.crop === l.item.crop)!.left -= l.qty
      return v
    }
    const list: Visit[] = []
    // Khách đến đến khi đủ số câu trong ngày hoặc kệ hết hàng; đồ nâng cấp "thêm khách" cộng thêm khách sau đó
    for (let n = 0; n < tier.questions; ) {
      const v = next()
      if (!v) break
      list.push(v)
      n += v.steps.length
    }
    for (let i = 0; i < extraCustomers(profile); i++) {
      const v = next()
      if (v) list.push(v)
    }
    return list
  })
  const totalSteps = useMemo(() => visits.reduce((s, v) => s + v.steps.length, 0), [visits])
  /** Kệ ít hàng thì ngày ngắn: phải làm được ít nhất nửa số câu mới sang ngày mới */
  const enough = practice !== null || totalSteps >= Math.ceil(tier.questions / 2)
  /** Hàng còn trên kệ (khách mua xong mới bớt) */
  const [onShelf, setOnShelf] = useState(() => goods.map((g) => ({ emoji: g.item.emoji, count: g.left, price: g.price, crop: g.item.crop! })))

  const [vi, setVi] = useState(0)
  const [si, setSi] = useState(0)
  const [wrong, setWrong] = useState(0)
  const [firstTry, setFirstTry] = useState(0)
  const [earned, setEarned] = useState(0)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [showHint, setShowHint] = useState(false)
  const [praise, setPraise] = useState('Giỏi quá!')
  const [result, setResult] = useState<DayResult | null>(null)
  const [lost, setLost] = useState(0)
  const timer = useRef<number>()
  const tally = useRef({ served: 0, perfect: 0, sold: {} as Record<string, number> })
  /** Xu bị trừ vì trả lời sai (bé nhỏ tuổi và lượt không nhận xu thì không trừ) */
  const fineCost = rewarded && profile.age >= TUNING.coins.mistakeFromAge ? TUNING.coins.mistakeCost : 0
  const fined = useRef(0)
  const [fineShown, setFineShown] = useState(0)
  /** Khách hiện tại chưa bị trả lời sai lần nào */
  const visitClean = useRef(true)

  /** Tổng thời gian (ms) khách thứ i chịu chờ */
  const patienceMs = (i: number) =>
    tier.patience * visits[i].steps.length * visits[i].customer.patience * agePatienceFactor(profile.age) * patienceBonus(profile) * 1000
  const scene = useRef<StreetHandle>(null)
  /** Khách đã đi tới quầy: lúc này mới nói và mới tính giờ chờ */
  const [arrived, setArrived] = useState(false)
  // Thời gian chờ để trong ref: đếm giờ không làm vẽ lại cả màn, cảnh tự đọc mỗi khung hình
  const left = useRef(patienceMs(0) + GRACE_MS)
  const warned = useRef(false)
  const gone = useRef(false)

  const visit = visits[vi]
  const step = visit.steps[si]
  const choices = useMemo(() => makeChoices(step.answer), [step])
  const maxMs = patienceMs(vi)
  const ratio = () => Math.max(0, Math.min(1, left.current / maxMs))
  const paused = result !== null || !arrived || feedback === 'ok' || feedback === 'reveal' || feedback === 'leave'

  useEffect(() => {
    if (!result && arrived) speak(step.speech)
  }, [step, result, arrived])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    scene.current?.enter(visit.customer, () => setArrived(true))
  }, [vi])

  const tick = useRef(() => {})
  tick.current = () => {
    if (gone.current) return
    left.current -= TICK_MS
    if (left.current <= 0) leave()
    else if (ratio() < 0.3 && !warned.current) {
      warned.current = true
      speak(`Nhanh lên ${callName(profile.name)} ơi, ${visit.customer.title} vội lắm!`)
    }
  }

  useEffect(() => {
    if (paused) return
    const id = window.setInterval(() => tick.current(), TICK_MS)
    return () => window.clearInterval(id)
  }, [paused])

  const finishDay = (coins: number, ft: number, lostNow: number) => {
    const stars = Math.max(0, Math.min(starsFor(ft / totalSteps), MAX_RATING - lostNow))
    // Tiền bị trừ vì trả lời sai lấy từ tiền lời của lượt này, không xuống dưới 0
    const net = Math.max(0, coins - fined.current)
    const r = { stars, coins: rewarded ? net : 0, passed: stars >= 1 && enough, counted: enough, ...tally.current, sold: { ...tally.current.sold } }
    setResult(r)
    onFinish(r)
    sfx.win()
    if (practice) speak(`Luyện xong rồi! ${callName(profile.name)} được ${stars} sao!`)
    else speak(r.passed ? `Hết ngày rồi! ${callName(profile.name)} được ${stars} sao!` : 'Hết ngày rồi! Mình thử lại nhé!')
  }

  const resetStep = () => {
    setWrong(0)
    setShowHint(false)
    setFeedback(null)
  }

  const nextVisit = (coins: number, ft: number, lostNow: number) => {
    resetStep()
    visitClean.current = true
    setArrived(false)
    if (vi + 1 < visits.length) {
      setVi(vi + 1)
      setSi(0)
      left.current = patienceMs(vi + 1) + GRACE_MS
      warned.current = false
      gone.current = false
    } else {
      timer.current = window.setTimeout(() => finishDay(coins, ft, lostNow), LAST_EXIT_MS)
    }
  }

  const advance = (wasFirstTry: boolean) => {
    const ft = firstTry + (wasFirstTry ? 1 : 0)
    setFirstTry(ft)
    if (!wasFirstTry) visitClean.current = false
    if (si + 1 < visit.steps.length) {
      resetStep()
      setSi(si + 1)
      return
    }
    const clean = visitClean.current
    tally.current.served++
    if (clean) tally.current.perfect++
    // Luyện riêng bày hàng mẫu: không bán hàng trong kho, không lời thêm
    const produce = practice ? {} : produceIn(visit.lines)
    for (const [id, n] of Object.entries(produce)) tally.current.sold[id] = (tally.current.sold[id] ?? 0) + n
    setOnShelf((list) => list.map((g) => ({ ...g, count: Math.max(0, g.count - (produce[g.crop] ?? 0)) })))
    const profit = Math.round((PROFIT_PER_CUSTOMER + (clean ? PERFECT_BONUS : 0)) * coinBonus(profile)) + produceBonus(produce)
    const coins = earned + profit
    setEarned(coins)
    sfx.coin()
    scene.current?.leave('happy', rewarded ? profit : 0)
    nextVisit(coins, ft, lost)
  }

  /** Hết kiên nhẫn: khách bỏ về, không trả tiền, sạp mất 1 sao */
  const leave = () => {
    window.clearTimeout(timer.current)
    gone.current = true
    sfx.wrong()
    scene.current?.leave('angry')
    setFeedback('leave')
    const lostNow = lost + 1
    setLost(lostNow)
    speak(`Lâu quá! ${visit.customer.title} không mua nữa đâu!`)
    timer.current = window.setTimeout(() => nextVisit(earned, firstTry, lostNow), 2600)
  }

  const answer = (n: number) => {
    if (paused) return
    window.clearTimeout(timer.current)
    if (n === step.answer) {
      sfx.correct()
      const list = praises(callName(profile.name))
      const p = list[Math.floor(Math.random() * list.length)]
      setPraise(p)
      setFeedback('ok')
      speak(p)
      scene.current?.react('ok')
      timer.current = window.setTimeout(() => advance(wrong === 0), 1100)
      return
    }
    sfx.wrong()
    scene.current?.react('bad')
    if (fineCost) {
      fined.current += fineCost
      setFineShown(fined.current)
    }
    const w = wrong + 1
    setWrong(w)
    left.current = Math.min(left.current, maxMs) - maxMs * WRONG_PENALTY
    if (w >= 2) setShowHint(true)
    if (w >= 3) {
      setFeedback('reveal')
      speak(`Đáp án là ${step.answer}`)
      timer.current = window.setTimeout(() => advance(false), 2600)
    } else {
      setFeedback('bad')
      speak('Chưa đúng, thử lại nhé!')
      timer.current = window.setTimeout(() => setFeedback(null), 800)
    }
  }

  if (result) {
    return (
      <div className="screen result">
        <div className="result-emoji">{result.passed ? '🎉' : '💪'}</div>
        <h1>{practice ? `${tier.name} xong!` : `Hết ngày ${day}!`}</h1>
        <div className="stars-big">
          {[1, 2, 3].map((i) => (
            <span key={i} className={i <= result.stars ? 'star on' : 'star'}>
              ★
            </span>
          ))}
        </div>
        <p className="result-text">
          Đúng ngay lần đầu: <b>{firstTry}/{totalSteps}</b>
          <br />
          {rewarded ? (
            <>
              Tiền lời: <b>🪙 {result.coins} {CURRENCY}</b>
            </>
          ) : (
            <>Hết lượt nhận xu hôm nay, mai quay lại nhé!</>
          )}
          {Object.keys(result.sold).length > 0 && (
            <>
              <br />
              Nông sản bán được:{' '}
              <b>
                {Object.entries(result.sold)
                  .map(([id, n]) => `${cropOf(id).emoji}×${n}`)
                  .join(' ')}
              </b>{' '}
              (+{produceBonus(result.sold)} {CURRENCY})
            </>
          )}
          {fineShown > 0 && (
            <>
              <br />
              Bán nhầm bị trừ: <b>−{fineShown} {CURRENCY}</b>
            </>
          )}
          {lost > 0 && (
            <>
              <br />
              Khách bỏ về: <b>😤 {lost}</b> (−{lost} ⭐)
            </>
          )}
        </p>
        {!practice && (
          <p className="result-text">
            {result.passed
              ? result.stars >= TUNING.day.starsToAdvance
                ? 'Bé tiến bộ thêm một ngày, sắp lên cấp rồi!'
                : `Sang ngày mới rồi! Được ${'⭐'.repeat(TUNING.day.starsToAdvance)} trở lên mới tính tiến bộ lên cấp nhé.`
              : !enough
                ? `Kệ ít hàng quá nên bán xong sớm. Bày thêm hàng để có đủ ${Math.ceil(tier.questions / 2)} câu mới sang ngày mới nhé!`
                : 'Cần 1 sao để sang ngày mới. Mình bán lại ngày này nhé!'}
            {onShelf.some((g) => g.count > 0) && (
              <>
                <br />
                🧺 Hàng chưa bán đã cất lại vào kho.
              </>
            )}
            {Object.values(profile.farm.tiles).some((p) => !isRipe(p)) && (
              <>
                <br />
                🌾 Cây ở nông trại bón phân tiếp được rồi!
              </>
            )}
          </p>
        )}
        <button className="btn btn-gold btn-xl" onClick={onGoldBonus}>
          ⛏️ Đi đào vàng
        </button>
        <button className="btn btn-primary btn-xl" onClick={onExit}>
          🌾 Về nông trại
        </button>
      </div>
    )
  }

  const paidVisible = step.showPaid && visit.paid !== undefined
  const totalKnown = paidVisible

  return (
    <div className="screen shop">
      <header className="topbar">
        <button className="icon-btn" onClick={onExit} aria-label="Về nông trại">
          ⬅️
        </button>
        <div className="chip">{practice ? tier.name : `Ngày ${day}`}</div>
        <div className="chip" aria-label="Khách">
          👤 {vi + 1}/{visits.length}
        </div>
        <div className="chip">🪙 {Math.max(0, earned - fineShown)}</div>
        <div className="chip rating" aria-label={`Uy tín sạp: ${MAX_RATING - lost} sao`}>
          {Array.from({ length: MAX_RATING }, (_, i) => (
            <span key={i} className={i < MAX_RATING - lost ? 'on' : 'off'}>
              ★
            </span>
          ))}
        </div>
      </header>

      <StreetScene
        ref={scene}
        mode="shop"
        level={shopLevel(profile.shopLevel)}
        owned={profile.owned}
        getPatience={ratio}
        market={onShelf}
      />

      {arrived ? (
        <div className={`bubble ${feedback === 'bad' ? 'shake' : ''}`} key={`b${vi}-${si}`}>
          <p>{step.prompt}</p>
          <div className="bubble-tools">
            <button className="speak-btn" onClick={() => speak(step.speech)} aria-label="Đọc lại">
              🔊
            </button>
            {!showHint && feedback !== 'reveal' && (
              <button className="speak-btn" onClick={() => setShowHint(true)} aria-label="Gợi ý">
                💡
              </button>
            )}
          </div>
        </div>
      ) : (
        // Khách đang đi vào: chưa nói gì
        <div className="bubble waiting">
          <p className="typing">• • •</p>
        </div>
      )}

      <div className="counter">
        {visit.lines.map((l, i) => (
          <div className="line" key={i}>
            <div className="line-items">
              {/* Khách đưa tiền hỏi mua được mấy món: chưa cho bé đếm sẵn */}
              {visit.hideQty && feedback !== 'reveal' && feedback !== 'ok' ? (
                <span>
                  {l.item.emoji} × ?
                </span>
              ) : l.qty <= 20 ? (
                Array.from({ length: l.qty }, (_, j) => <span key={j}>{l.item.emoji}</span>)
              ) : (
                <span>
                  {l.item.emoji} × {l.qty}
                </span>
              )}
            </div>
            {!NO_PRICE_KINDS.includes(visit.kind) && (
              <div className="price-tag">
                {l.price} {CURRENCY}
              </div>
            )}
          </div>
        ))}
        {visit.targets && (
          <div className="targets">
            <small>Chia cho:</small>
            {visit.targets.emoji.repeat(visit.targets.count)}
          </div>
        )}
        {visit.hideQty && <div className="paid-tag">Khách đưa: 🪙 {visit.total} {CURRENCY}</div>}
        {totalKnown && <div className="total-tag">Tổng: {visit.total} {CURRENCY}</div>}
        {paidVisible && <div className="paid-tag">Khách đưa: 💵 {visit.paid} {CURRENCY}</div>}
      </div>

      {(showHint || feedback === 'reveal') && (
        <div className="hint">
          <div className="expr">{feedback === 'reveal' ? step.expr.replace('?', String(step.answer)) : step.expr}</div>
          {step.hint && <HintDots hint={step.hint} />}
        </div>
      )}

      {feedback === 'ok' && <div className="toast ok">✅ {praise}</div>}
      {feedback === 'bad' && <div className="toast bad">🤔 Thử lại nhé!{fineCost > 0 && ` −${fineCost} ${CURRENCY}`}</div>}
      {feedback === 'reveal' && <div className="toast reveal">Đáp án là {step.answer}</div>}
      {feedback === 'leave' && <div className="toast bad">😤 Khách chờ lâu quá nên bỏ về! −1 ⭐</div>}

      <AnswerInput
        mode={tier.input}
        choices={choices}
        disabled={paused}
        onAnswer={answer}
        resetKey={`${vi}-${si}`}
      />
    </div>
  )
}
