import { CUSTOMERS, ITEMS, nounOf, unitOf, type Customer, type Item } from './items'
import type { Kind, Op, Tier } from './levels'
import { distractors, pick, rand, shuffle } from './random'

export const CURRENCY = 'xu'

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
  /** Ẩn giá (bài chia: phải tìm giá) */
  hidePrice?: boolean
  paid?: number
  /** Số xu bé được khi phục vụ xong khách */
  total: number
  steps: Step[]
  /** Người/túi nhận hàng khi chia đều, vd 3 × 🛍️ */
  targets?: { emoji: string; count: number }
}

/** Các dạng không hỏi về tiền nên không hiện bảng giá */
export const NO_PRICE_KINDS: Kind[] = ['count', 'share', 'group', 'remainder']

const DIV_HINT_MAX = 30

function randPrice(t: Tier) {
  const [lo, hi] = t.price
  return lo + rand(0, Math.floor((hi - lo) / t.priceStep)) * t.priceStep
}

const sumOf = (lines: Line[]) => lines.reduce((s, l) => s + l.qty * l.price, 0)

function describe(lines: Line[]) {
  return {
    emoji: lines.map((l) => `${l.qty} ${l.item.emoji}`).join(' và '),
    speech: lines.map((l) => `${l.qty} ${l.item.name}`).join(' và '),
  }
}

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
  const d = describe(lines)
  return {
    prompt: `Cậu Lớn ơi, ${c.title} mua ${d.emoji}. Hết bao nhiêu ${CURRENCY}?`,
    speech: `Cậu Lớn ơi, ${c.title} mua ${d.speech}. Hết bao nhiêu ${CURRENCY}?`,
    expr: `${totalExpr(lines, t.useMul)} = ?`,
    answer: total,
    hint: total <= 20 ? { groups: lines.flatMap((l) => Array<number>(l.qty).fill(l.price)) } : undefined,
  }
}

function genLines(t: Tier, maxTotal: number, items: Item[]): Line[] {
  for (let tries = 0; tries < 300; tries++) {
    const n = rand(Math.min(2, t.maxTypes), t.maxTypes)
    const lines = shuffle(items).slice(0, n).map((item) => ({ item, qty: rand(1, t.qtyMax), price: randPrice(t) }))
    if (sumOf(lines) <= maxTotal) return lines
  }
  return [{ item: pick(items), qty: 1, price: t.price[0] }]
}

/** `items`: các mặt hàng tiệm đang bán (mở thêm khi nâng cấp tiệm) */
export function genVisit(t: Tier, items: Item[] = ITEMS): Visit {
  const customer = pick(CUSTOMERS)
  const c = customer
  const kind = pick(t.kinds)

  switch (kind) {
    case 'count': {
      const types = rand(1, t.maxTypes)
      let lines: Line[]
      do {
        lines = shuffle(items).slice(0, types).map((item) => ({ item, qty: rand(1, t.countMax), price: 1 }))
      } while (sumOf(lines) > t.maxTotal)
      const total = sumOf(lines)
      const single = types === 1
      const prompt = single
        ? `Cậu Lớn ơi, ${c.title} lấy mấy ${unitOf(lines[0].item)} ${nounOf(lines[0].item)} vậy?`
        : `Cậu Lớn ơi, ${c.title} lấy tất cả mấy món vậy?`
      return {
        kind, customer, lines, total,
        steps: [{
          prompt,
          speech: single ? prompt : `Cậu Lớn ơi, ${c.title} lấy ${describe(lines).speech}. Tất cả mấy món vậy?`,
          expr: single ? `Đếm ${lines[0].item.emoji}: có mấy?` : `${lines.map((l) => l.qty).join(' + ')} = ?`,
          answer: total,
          hint: { groups: lines.map((l) => l.qty) },
        }],
      }
    }

    case 'total': {
      const lines = genLines(t, t.maxTotal, items)
      return { kind, customer, lines, total: sumOf(lines), steps: [totalStep(c, lines, t)] }
    }

    case 'change': {
      const maxBill = Math.max(...t.bills)
      const lines = t.changeSteps === 1
        ? [{ item: pick(items), qty: 1, price: rand(1, maxBill - 1) }]
        : genLines(t, maxBill - 1, items)
      const total = sumOf(lines)
      const paid = t.bills.find((b) => b > total) ?? maxBill
      const text = t.changeSteps === 1
        ? `Hết ${total} ${CURRENCY}. ${c.title} đưa ${paid} ${CURRENCY}. Cậu Lớn thối lại mấy ${CURRENCY}?`
        : `${c.title} đưa ${paid} ${CURRENCY}. Cậu Lớn thối lại mấy ${CURRENCY}?`
      const changeStep: Step = {
        prompt: text,
        speech: text,
        expr: `${paid} - ${total} = ?`,
        answer: paid - total,
        hint: paid <= 20 ? { takeAway: { from: paid, take: total } } : undefined,
        showPaid: true,
      }
      const steps = t.changeSteps === 1 ? [changeStep] : [totalStep(c, lines, t), changeStep]
      return { kind, customer, lines, total, paid, steps }
    }

    case 'multiply': {
      const item = pick(items)
      const qty = rand(2, t.mulQty)
      const price = rand(2, t.mulPrice)
      const total = qty * price
      const text = `Cậu Lớn ơi, ${c.title} mua ${qty} ${item.name}, mỗi ${unitOf(item)} ${price} ${CURRENCY}. Hết bao nhiêu ${CURRENCY}?`
      return {
        kind, customer, lines: [{ item, qty, price }], total,
        steps: [{
          prompt: text,
          speech: text,
          expr: `${qty} × ${price} = ?`,
          answer: total,
          hint: total <= 20 ? { groups: Array<number>(qty).fill(price) } : undefined,
        }],
      }
    }

    case 'divide': {
      const item = pick(items)
      const qty = rand(2, 9)
      const price = rand(2, t.divMax)
      const total = qty * price
      const text = `Cậu Lớn ơi, ${c.title} mua ${qty} ${item.name} hết ${total} ${CURRENCY}. Mỗi ${unitOf(item)} giá mấy ${CURRENCY}?`
      return {
        kind, customer, lines: [{ item, qty, price }], total, hidePrice: true,
        steps: [{ prompt: text, speech: text, expr: `${total} : ${qty} = ?`, answer: price }],
      }
    }

    case 'share': {
      const item = pick(items)
      const n = rand(2, t.shareDiv)
      const each = rand(1, t.shareQuot)
      const total = n * each
      const unit = unitOf(item)
      const toFriends = Math.random() < 0.5
      const text = toFriends
        ? `Cậu Lớn ơi, ${c.title} mua ${total} ${item.name} chia đều cho ${n} bạn. Mỗi bạn được mấy ${unit}?`
        : `Cậu Lớn xếp ${total} ${item.name} vào ${n} túi đều nhau giúp ${c.title} nhé. Mỗi túi mấy ${unit}?`
      return {
        kind, customer, lines: [{ item, qty: total, price: 1 }], total,
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
      const item = pick(items)
      const per = rand(2, t.shareDiv)
      const bags = rand(1, t.shareQuot)
      const extra = kind === 'remainder' ? rand(1, per - 1) : 0
      const total = per * bags + extra
      const unit = unitOf(item)
      const ask = `Cậu Lớn ơi, ${c.title} cần ${total} ${item.name}, mỗi túi đựng ${per} ${unit}.`
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
      return { kind, customer, lines: [{ item, qty: total, price: 1 }], total, steps }
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
  const div = (max: number): Drill => {
    const b = rand(2, max)
    const q = rand(1, max)
    return { expr: `${b * q} : ${b}`, answer: q }
  }
  if (op) {
    const addMax = [5, 10, 10, 20, 50, 100, 100, 100, 1000][tierId - 1]
    switch (op) {
      case 'add': return add(addMax)
      case 'sub': return sub(addMax)
      case 'mul': return tierId <= 3 ? mul(3, 3) : tierId <= 6 ? mul(5, 10) : mul(10, 10)
      case 'div': return div(tierId <= 3 ? 3 : tierId <= 6 ? 5 : tierId <= 8 ? 9 : 10)
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
    default: return pick([() => mul(10, 10), () => div(10), () => add(1000), () => sub(1000)])()
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
