import { CUSTOMERS, nounOf, unitOf, type Customer, type Item } from './items'
import type { Kind, Op, Tier } from './levels'
import { distractors, pick, rand, shuffle } from './random'
import { TUNING } from './tuning'

export const CURRENCY = 'xu'

/** Chỗ giữ tên chủ sạp trong câu thoại; genVisit thay bằng tên bé */
const OWNER = '{chủ tiệm}'

export interface Line {
  item: Item
  qty: number
  price: number
}

export interface Hint {
  /** Các nhóm chấm tròn để cộng */
  groups?: number[]
  /** Lấy đi `take` chấm từ `from` chấm */
  takeAway?: { from: number; take: number }
  /** Phép chia: `count` túi, mỗi túi `per` chấm, dư `extra` chấm */
  bags?: { count: number; per: number; extra: number; emoji: string }
}

export interface Step {
  prompt: string
  speech: string
  expr: string
  answer: number
  hint?: Hint
  /** Bước thối tiền: hiện tờ tiền khách đưa */
  showPaid?: boolean
}

export interface Visit {
  kind: Kind
  customer: Customer
  lines: Line[]
  /** Khách đưa tiền hỏi mua được mấy món: chưa cho bé thấy số món */
  hideQty?: boolean
  paid?: number
  /** Tổng tiền khách trả */
  total: number
  steps: Step[]
  /** Người/túi nhận hàng khi chia đều, vd 3 × 🛍️ */
  targets?: { emoji: string; count: number }
}

/** Một loại nông sản đang bày trên kệ */
export interface Goods {
  item: Item
  /** Giá cố định một món (đã nhân theo cấp) */
  price: number
  /** Số món còn trên kệ */
  left: number
}

/** Các dạng không hỏi về tiền nên không hiện giá ở quầy */
export const NO_PRICE_KINDS: Kind[] = ['count', 'share', 'group', 'remainder']

const DIV_HINT_MAX = 30
/** Thử bấy nhiêu lần tìm câu hỏi hợp với hàng còn trên kệ */
const TRIES = 60

const sumOf = (lines: Line[]) => lines.reduce((s, l) => s + l.qty * l.price, 0)
const countOf = (lines: Line[]) => lines.reduce((s, l) => s + l.qty, 0)

/** "2 quả cà chua, 1 trái bắp và 1 quả bí ngô" */
function describe(lines: Line[]) {
  const parts = lines.map((l) => `${l.qty} ${l.item.name}`)
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} và ${parts[parts.length - 1]}` : parts[0]
}

/** Khách xưng ở giữa câu: viết thường chữ đầu, vd "bán cho chú công an" */
const who = (c: Customer) => c.title.charAt(0).toLowerCase() + c.title.slice(1)

function totalExpr(lines: Line[], useMul: boolean) {
  return lines
    .map((l) => {
      if (l.qty === 1) return `${l.price}`
      return useMul ? `${l.qty} × ${l.price}` : Array(l.qty).fill(l.price).join(' + ')
    })
    .join(' + ')
}

function totalStep(c: Customer, lines: Line[], t: Tier): Step {
  const total = sumOf(lines)
  const text = `${OWNER} ơi, bán cho ${who(c)} ${describe(lines)}. Hết bao nhiêu ${CURRENCY}?`
  return {
    prompt: text,
    speech: text,
    expr: `${totalExpr(lines, t.useMul)} = ?`,
    answer: total,
    hint: total <= 20 ? { groups: lines.flatMap((l) => Array<number>(l.qty).fill(l.price)) } : undefined,
  }
}

/** Chọn `n` loại hàng khác nhau, số lượng mỗi loại không quá `qtyMax` và hàng còn trên kệ */
function pickLines(avail: Goods[], n: number, qtyMax: number): Line[] {
  return shuffle(avail)
    .slice(0, n)
    .map((g) => ({ item: g.item, qty: rand(1, Math.min(qtyMax, g.left)), price: g.price }))
}

/** Một loại hàng còn ít nhất `min` món trên kệ */
function pickGoods(avail: Goods[], min: number) {
  const ok = avail.filter((g) => g.left >= min)
  return ok.length ? pick(ok) : null
}

/**
 * Khách tới sạp mua hàng đang bày trên kệ; null khi kệ đã hết hàng.
 * `owner`: tên bé, khách gọi chủ sạp bằng tên này
 */
export function genVisit(t: Tier, goods: Goods[], owner = 'Cậu Lớn'): Visit | null {
  const avail = goods.filter((g) => g.left > 0)
  if (!avail.length) return null
  const customer = pick(CUSTOMERS)
  let v: Visit | null = null
  for (let i = 0; i < TRIES && !v; i++) v = buildVisit(t, pick(t.kinds), avail, customer)
  // Kệ còn ít hàng, không dạng nào vừa: hỏi đếm hoặc tính tiền một món
  v ??= singleItem(t, avail[0], customer)
  const named = (s: string) => s.split(OWNER).join(owner)
  return { ...v, steps: v.steps.map((s) => ({ ...s, prompt: named(s.prompt), speech: named(s.speech) })) }
}

function singleItem(t: Tier, g: Goods, c: Customer): Visit {
  const lines = [{ item: g.item, qty: 1, price: g.price }]
  if (t.kinds.includes('count')) return buildVisit(t, 'count', [{ ...g, left: 1 }], c)!
  return { kind: 'total', customer: c, lines, total: g.price, steps: [totalStep(c, lines, t)] }
}

/** Dựng một lượt khách theo dạng `kind`; null nếu hàng trên kệ không vừa dạng này */
function buildVisit(t: Tier, kind: Kind, avail: Goods[], c: Customer): Visit | null {
  switch (kind) {
    case 'count': {
      const lines = pickLines(avail, rand(1, Math.min(t.maxTypes, avail.length)), t.countMax)
      const total = countOf(lines)
      if (total > t.maxTotal) return null
      const single = lines.length === 1
      const item = lines[0].item
      const prompt = single
        ? `${OWNER} ơi, ${who(c)} lấy mấy ${unitOf(item)} ${nounOf(item)} vậy?`
        : `${OWNER} ơi, ${who(c)} lấy tất cả mấy món vậy?`
      return {
        kind, customer: c, lines, total: sumOf(lines),
        steps: [{
          prompt,
          speech: single ? prompt : `${OWNER} ơi, ${who(c)} lấy ${describe(lines)}. Tất cả mấy món vậy?`,
          expr: single ? `Đếm ${item.emoji}: có mấy?` : `${lines.map((l) => l.qty).join(' + ')} = ?`,
          answer: total,
          hint: { groups: lines.map((l) => l.qty) },
        }],
      }
    }

    case 'total': {
      const types = Math.min(t.maxTypes, avail.length)
      const lines = pickLines(avail, rand(Math.min(2, types), types), t.qtyMax)
      const total = sumOf(lines)
      if (total > t.maxTotal) return null
      return { kind, customer: c, lines, total, steps: [totalStep(c, lines, t)] }
    }

    case 'change': {
      const maxBill = Math.max(...t.bills)
      // Một bước: chỉ một loại hàng để bé thấy rõ mua gì, hết bao nhiêu
      const types = t.changeSteps === 1 ? 1 : rand(1, Math.min(t.maxTypes, avail.length))
      const lines = pickLines(avail, types, t.qtyMax)
      const total = sumOf(lines)
      if (total >= maxBill) return null
      // Khách đưa một tờ bất kỳ đủ trả, không phải lúc nào cũng tờ nhỏ nhất
      const paid = pick(t.bills.filter((b) => b > total))
      // Chỉ mua 1 món thì giá đã ghi sẵn: hỏi luôn tiền thối, không hỏi tổng
      const oneStep = t.changeSteps === 1 || (lines.length === 1 && lines[0].qty === 1)
      const ask = `${c.title} đưa ${paid} ${CURRENCY}. ${OWNER} thối lại mấy ${CURRENCY}?`
      const text = oneStep ? `${c.title} mua ${describe(lines)}, hết ${total} ${CURRENCY}. ${ask}` : ask
      const changeStep: Step = {
        prompt: text,
        speech: text,
        expr: `${paid} - ${total} = ?`,
        answer: paid - total,
        hint: paid <= 20 ? { takeAway: { from: paid, take: total } } : undefined,
        showPaid: true,
      }
      const steps = oneStep ? [changeStep] : [totalStep(c, lines, t), changeStep]
      return { kind, customer: c, lines, total, paid, steps }
    }

    case 'multiply': {
      const g = pickGoods(avail, 2)
      if (!g) return null
      const qty = rand(2, Math.min(t.mulQty, g.left))
      const total = qty * g.price
      if (total > t.maxTotal) return null
      const text = `${OWNER} ơi, bán cho ${who(c)} ${qty} ${g.item.name}. Mỗi ${unitOf(g.item)} ${g.price} ${CURRENCY}. Hết bao nhiêu ${CURRENCY}?`
      return {
        kind, customer: c, lines: [{ item: g.item, qty, price: g.price }], total,
        steps: [{
          prompt: text,
          speech: text,
          expr: `${qty} × ${g.price} = ?`,
          answer: total,
          hint: total <= 20 ? { groups: Array<number>(qty).fill(g.price) } : undefined,
        }],
      }
    }

    case 'divide': {
      // Khách đưa một số tiền, hỏi mua được mấy món
      const g = pickGoods(avail, 2)
      if (!g || g.price < 2) return null
      const qty = rand(2, Math.min(9, g.left))
      const budget = qty * g.price
      if (budget > t.maxTotal) return null
      const unit = unitOf(g.item)
      const text = `${OWNER} ơi, bán cho ${who(c)} ${budget} ${CURRENCY} ${nounOf(g.item)} nhé. Mỗi ${unit} ${g.price} ${CURRENCY}, được mấy ${unit}?`
      return {
        kind, customer: c, lines: [{ item: g.item, qty, price: g.price }], total: budget, hideQty: true,
        steps: [{
          prompt: text,
          speech: text,
          expr: `${budget} : ${g.price} = ?`,
          answer: qty,
          hint: budget <= DIV_HINT_MAX ? { bags: { count: qty, per: g.price, extra: 0, emoji: '🪙' } } : undefined,
        }],
      }
    }

    case 'share': {
      const g = pickGoods(avail, 2)
      if (!g) return null
      const n = rand(2, t.shareDiv)
      const each = rand(1, t.shareQuot)
      const total = n * each
      if (total > g.left) return null
      const unit = unitOf(g.item)
      const toFriends = Math.random() < 0.5
      const text = toFriends
        ? `${OWNER} ơi, ${who(c)} mua ${total} ${g.item.name} chia đều cho ${n} bạn. Mỗi bạn được mấy ${unit}?`
        : `${OWNER} xếp ${total} ${g.item.name} vào ${n} túi đều nhau giúp ${who(c)} nhé. Mỗi túi mấy ${unit}?`
      return {
        kind, customer: c, lines: [{ item: g.item, qty: total, price: g.price }], total: total * g.price,
        targets: { emoji: toFriends ? '🧒' : '🛍️', count: n },
        steps: [{
          prompt: text,
          speech: text,
          expr: `${total} : ${n} = ?`,
          answer: each,
          hint: total <= DIV_HINT_MAX ? { bags: { count: n, per: each, extra: 0, emoji: toFriends ? '🧒' : '🛍️' } } : undefined,
        }],
      }
    }

    case 'group':
    case 'remainder': {
      const g = pickGoods(avail, 2)
      if (!g) return null
      const per = rand(2, t.shareDiv)
      const bags = rand(1, t.shareQuot)
      const extra = kind === 'remainder' ? rand(1, per - 1) : 0
      const total = per * bags + extra
      if (total > g.left) return null
      const unit = unitOf(g.item)
      const ask = `${OWNER} ơi, ${who(c)} mua ${total} ${g.item.name}, mỗi túi đựng ${per} ${unit}.`
      const hint = total <= DIV_HINT_MAX ? { bags: { count: bags, per, extra, emoji: '🛍️' } } : undefined
      const first: Step = {
        prompt: `${ask} ${extra ? 'Đóng được mấy túi đầy?' : 'Cần mấy túi?'}`,
        speech: `${ask} ${extra ? 'Đóng được mấy túi đầy?' : 'Cần mấy túi?'}`,
        expr: extra ? `${total} : ${per} = ? (dư …)` : `${total} : ${per} = ?`,
        answer: bags,
        hint,
      }
      const steps = [first]
      if (extra) {
        const rest = `Đóng được ${bags} túi. Còn dư mấy ${unit}?`
        steps.push({ prompt: rest, speech: rest, expr: `${total} - ${bags} × ${per} = ?`, answer: extra, hint })
      }
      return { kind, customer: c, lines: [{ item: g.item, qty: total, price: g.price }], total: total * g.price, steps }
    }
  }
}

export function makeChoices(answer: number, n = 3): number[] {
  return shuffle([answer, ...distractors(answer, n - 1)])
}

/** Phép tính nhanh cho mini game */
export interface Drill {
  expr: string
  answer: number
}

/** Phép tính cho mini game; truyền `op` khi bé đang luyện riêng một phép */
export function genDrill(tierId: number, op?: Op): Drill {
  const add = (max: number): Drill => {
    const a = rand(0, max)
    const b = rand(0, max - a)
    return { expr: `${a} + ${b}`, answer: a + b }
  }
  const sub = (max: number): Drill => {
    const a = rand(1, max)
    const b = rand(0, a)
    return { expr: `${a} - ${b}`, answer: a - b }
  }
  const addSub = (max: number) => (Math.random() < 0.5 ? add(max) : sub(max))
  const mul = (maxA: number, maxB: number): Drill => {
    const a = rand(2, maxA)
    const b = rand(1, maxB)
    return { expr: `${a} × ${b}`, answer: a * b }
  }
  /** Số chia đến `max`, thương đến `maxQ` */
  const div = (max: number, maxQ = max): Drill => {
    const b = rand(2, max)
    const q = rand(1, maxQ)
    return { expr: `${b * q} : ${b}`, answer: q }
  }
  if (op) {
    const addMax = [5, 10, 10, 20, 50, 100, 100, 100, 1000, 10000, 10000, 100000][Math.min(tierId, 12) - 1]
    switch (op) {
      case 'add': return add(addMax)
      case 'sub': return sub(addMax)
      case 'mul': return tierId <= 3 ? mul(3, 3) : tierId <= 6 ? mul(5, 10) : tierId <= 9 ? mul(10, 10) : mul(99, 9)
      case 'div': return tierId <= 9 ? div(tierId <= 3 ? 3 : tierId <= 6 ? 5 : tierId <= 8 ? 9 : 10) : div(9, 99)
    }
  }
  switch (tierId) {
    case 1: return add(5)
    case 2: return add(10)
    case 3: return addSub(10)
    case 4: return addSub(20)
    case 5: return addSub(50)
    case 6: return Math.random() < 0.8 ? addSub(100) : div(3)
    case 7: return pick([() => mul(5, 10), () => mul(5, 10), () => div(5), () => addSub(100)])()
    case 8: return pick([() => mul(9, 10), () => div(9), () => div(9), () => sub(100)])()
    case 9: return pick([() => mul(10, 10), () => div(10), () => add(1000), () => sub(1000)])()
    case 10: return pick([() => mul(99, 9), () => div(9, 20), () => add(10000), () => sub(10000)])()
    case 11: return pick([() => mul(99, 9), () => mul(99, 9), () => div(9, 99), () => div(9, 99)])()
    // Cấp cuối và các bậc sau: số to dần
    default: {
      const big = Math.round(100000 * TUNING.day.beyondGrowth ** Math.max(0, tierId - 12))
      return pick([() => mul(999, 9), () => div(9, 999), () => add(big), () => sub(big)])()
    }
  }
}

export function exprToSpeech(expr: string) {
  return (
    expr
      .replace(/\+/g, ' cộng ')
      .replace(/-/g, ' trừ ')
      .replace(/×/g, ' nhân ')
      .replace(/:/g, ' chia ') + ' bằng mấy?'
  )
}
