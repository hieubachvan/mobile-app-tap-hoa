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
  customers: number
  /** Số giây khách chờ cho mỗi câu hỏi (trước khi nhân hệ số kiên nhẫn) */
  patience: number
}

const base = {
  price: [1, 5] as [number, number],
  priceStep: 1,
  maxTypes: 2,
  qtyMax: 1,
  countMax: 5,
  maxTotal: 10,
  bills: [10],
  changeSteps: 1 as 1 | 2,
  mulQty: 3,
  mulPrice: 5,
  divMax: 5,
  shareDiv: 3,
  shareQuot: 3,
  useMul: false,
  input: 'choice' as 'choice' | 'pad',
  customers: 5,
  patience: 25,
}

export const TIERS: Tier[] = [
  { ...base, id: 1, name: 'Đếm hàng', desc: 'Đếm số món (đến 5)', kinds: ['count'], maxTypes: 1, maxTotal: 5, customers: 4 },
  { ...base, id: 2, name: 'Cộng trong 10', desc: 'Đếm và cộng tiền trong phạm vi 10', kinds: ['count', 'total', 'total'] },
  { ...base, id: 3, name: 'Thối tiền trong 10', desc: 'Cộng, trừ trong phạm vi 10', kinds: ['total', 'change', 'change'], price: [1, 9] },
  {
    ...base, id: 4, name: 'Cộng trừ trong 20', desc: 'Tính tổng 2–3 món, thối tiền từ 10, 20',
    kinds: ['total', 'change'], price: [1, 9], maxTypes: 3, maxTotal: 19, bills: [10, 20], changeSteps: 2, input: 'pad',
  },
  {
    ...base, id: 5, patience: 30, name: 'Trong phạm vi 50', desc: 'Mua nhiều món, thối tiền từ 20, 50',
    kinds: ['total', 'change', 'change'], price: [2, 20], maxTypes: 3, qtyMax: 2, maxTotal: 49, bills: [20, 50], changeSteps: 2, input: 'pad', customers: 6,
  },
  {
    ...base, id: 6, patience: 30, name: 'Trong phạm vi 100', desc: 'Cộng trừ đến 100, làm quen nhân và chia đều',
    kinds: ['total', 'change', 'multiply', 'share'], price: [5, 50], maxTypes: 3, qtyMax: 2, maxTotal: 99, bills: [50, 100], changeSteps: 2, mulQty: 3, mulPrice: 10, shareDiv: 3, shareQuot: 5, useMul: true, input: 'pad', customers: 6,
  },
  {
    ...base, id: 7, patience: 30, name: 'Bảng cửu chương', desc: 'Nhân số lượng với giá, chia đều vào túi',
    kinds: ['multiply', 'multiply', 'total', 'change', 'share', 'group'], price: [2, 20], maxTypes: 3, qtyMax: 5, maxTotal: 99, bills: [50, 100], changeSteps: 2, mulQty: 9, mulPrice: 9, shareDiv: 5, shareQuot: 5, useMul: true, input: 'pad', customers: 6,
  },
  {
    ...base, id: 8, patience: 35, name: 'Chia đều', desc: 'Chia đều, đóng túi, tìm giá một món',
    kinds: ['divide', 'share', 'group', 'multiply', 'change'], price: [2, 20], maxTypes: 3, qtyMax: 5, maxTotal: 99, bills: [50, 100], changeSteps: 2, mulQty: 9, mulPrice: 10, divMax: 10, shareDiv: 9, shareQuot: 9, useMul: true, input: 'pad', customers: 7,
  },
  {
    ...base, id: 9, patience: 40, name: 'Siêu thị nhí', desc: 'Số lớn đến 1000, đủ 4 phép tính, chia có dư',
    kinds: ['total', 'change', 'multiply', 'divide', 'share', 'remainder'], price: [10, 200], priceStep: 5, maxTypes: 3, qtyMax: 3, maxTotal: 999, bills: [500, 1000], changeSteps: 2, mulQty: 9, mulPrice: 50, divMax: 20, shareDiv: 9, shareQuot: 12, useMul: true, input: 'pad', customers: 8,
  },
]

/** Cấp khởi đầu theo tuổi: 3–4 tuổi → cấp 1, 5 tuổi → cấp 2, ... 10 tuổi → cấp 7 */
export function startTierForAge(age: number): number {
  if (age <= 4) return 1
  return Math.min(TIERS.length, age - 3)
}

/** Cứ qua 2 ngày lại lên một cấp */
export const DAYS_PER_TIER = 2

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
  const p: Tier = { ...t, name, customers: 6 }
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
  if (age <= 4) return 1.6
  if (age <= 6) return 1.25
  return 1
}
