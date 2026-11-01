import { TUNING } from './tuning'

/**
 * divide: biết tổng tiền, tìm giá 1 món
 * share: chia đều N món cho k bạn / vào k túi
 * group: mỗi túi k món, N món được mấy túi
 * remainder: như group nhưng có dư (2 bước)
 */
export type Kind = 'count' | 'total' | 'change' | 'multiply' | 'divide' | 'share' | 'group' | 'remainder'

export type Op = 'add' | 'sub' | 'mul' | 'div'

export interface Tier {
  id: number
  name: string
  desc: string
  /** Lặp một loại nhiều lần để nó xuất hiện thường hơn */
  kinds: Kind[]
  /** Khoảng giá mỗi món */
  price: [number, number]
  priceStep: number
  /** Số loại hàng tối đa trong một lượt mua */
  maxTypes: number
  /** Số lượng tối đa mỗi loại khi tính tổng tiền */
  qtyMax: number
  /** Số lượng tối đa mỗi loại khi đếm */
  countMax: number
  maxTotal: number
  /** Tờ tiền khách đưa (để thối tiền) */
  bills: number[]
  /** 1: cho sẵn tổng tiền rồi hỏi thối; 2: hỏi tổng trước, rồi hỏi thối */
  changeSteps: 1 | 2
  mulQty: number
  mulPrice: number
  divMax: number
  /** Chia đều / đóng túi: số túi (số chia) tối đa và số món mỗi túi (thương) tối đa */
  shareDiv: number
  shareQuot: number
  /** Viết số lượng dạng phép nhân (2 × 5) hay cộng lặp (5 + 5) */
  useMul: boolean
  input: 'choice' | 'pad'
  /** Số câu hỏi mỗi ngày: khách đến đến khi đủ (khách cuối hỏi 2 câu thì có thể dư 1) */
  questions: number
  /** Số giây khách chờ cho mỗi câu hỏi (trước khi nhân hệ số kiên nhẫn) */
  patience: number
}

/** 9 cấp độ, chỉnh trong tuning.json */
export const TIERS: Tier[] = TUNING.tiers

/** Thông số theo tuổi; tuổi ngoài 3–10 lấy tuổi gần nhất */
function ageRow(age: number) {
  const ages = Object.keys(TUNING.ages).map(Number)
  const near = ages.reduce((best, a) => (Math.abs(a - age) < Math.abs(best - age) ? a : best), ages[0])
  return TUNING.ages[near]
}

/** Cấp khởi đầu theo tuổi */
export function startTierForAge(age: number): number {
  return Math.min(TIERS.length, Math.max(1, ageRow(age).startTier))
}

/** Cứ qua bấy nhiêu ngày lại lên một cấp */
export const DAYS_PER_TIER = TUNING.day.daysPerTier

export function tierFor(age: number, day: number): Tier {
  const id = Math.min(TIERS.length, startTierForAge(age) + Math.floor((day - 1) / DAYS_PER_TIER))
  return TIERS[id - 1]
}

export const OPS: { op: Op; sign: string; name: string }[] = [
  { op: 'add', sign: '➕', name: 'Cộng' },
  { op: 'sub', sign: '➖', name: 'Trừ' },
  { op: 'mul', sign: '✖️', name: 'Nhân' },
  { op: 'div', sign: '➗', name: 'Chia' },
]

/** Bản sao của cấp hiện tại chỉ ra một phép tính, số to nhỏ theo cấp của bé */
export function practiceTier(t: Tier, op: Op): Tier {
  const small = t.id <= 3
  const mid = t.id <= 6
  const name = `Luyện phép ${OPS.find((o) => o.op === op)!.name.toLowerCase()}`
  const p: Tier = { ...t, name, questions: TUNING.day.practiceQuestions }
  switch (op) {
    case 'add':
      return { ...p, kinds: t.id <= 2 ? ['count', 'total'] : ['total'], maxTypes: Math.max(2, t.maxTypes) }
    case 'sub':
      // Cho sẵn tổng tiền để bé chỉ phải làm phép trừ
      return { ...p, kinds: ['change'], changeSteps: 1, bills: small ? [t.id === 1 ? 5 : 10] : t.bills }
    case 'mul':
      return { ...p, kinds: ['multiply'], useMul: true, mulQty: small ? 3 : mid ? 5 : 9, mulPrice: small ? 3 : mid ? 5 : Math.max(9, t.mulPrice) }
    case 'div':
      if (small) return { ...p, kinds: ['share'], shareDiv: 3, shareQuot: 3 }
      if (mid) return { ...p, kinds: ['share', 'group'], shareDiv: 5, shareQuot: 5 }
      if (t.id <= 8) return { ...p, kinds: ['share', 'group', 'divide'], shareDiv: 9, shareQuot: 9, divMax: 10 }
      return { ...p, kinds: ['share', 'group', 'divide', 'remainder'], shareDiv: 9, shareQuot: 12, divMax: 12 }
  }
}

/** Bé càng nhỏ khách càng chờ lâu */
export function agePatienceFactor(age: number) {
  return ageRow(age).patience
}
