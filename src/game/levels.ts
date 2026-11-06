import { TUNING } from './tuning'

/**
 * divide: khách đưa số tiền, hỏi mua được mấy món (giá có trên bảng)
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
  /** Số loại hàng tối đa trong một lượt mua */
  maxTypes: number
  /** Số lượng tối đa mỗi loại khi tính tổng tiền */
  qtyMax: number
  /** Số lượng tối đa mỗi loại khi đếm */
  countMax: number
  maxTotal: number
  /** Giá nông sản ở cấp này = giá gốc × hệ số (bé lớn tính số to hơn) */
  priceScale: number
  /** Tờ tiền khách đưa (để thối tiền) */
  bills: number[]
  /** 1: cho sẵn tổng tiền rồi hỏi thối; 2: hỏi tổng trước, rồi hỏi thối */
  changeSteps: 1 | 2
  /** Số món tối đa khi hỏi nhân (số lượng × giá) */
  mulQty: number
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

/** Các cấp độ, chỉnh trong tuning.json; qua cấp cuối thì số tiếp tục to dần (beyondTier) */
export const TIERS: Tier[] = TUNING.tiers

/** Thông số theo tuổi; tuổi ngoài 3–10 lấy tuổi gần nhất */
function ageRow(age: number) {
  const ages = Object.keys(TUNING.ages).map(Number)
  const near = ages.reduce((best, a) => (Math.abs(a - age) < Math.abs(best - age) ? a : best), ages[0])
  return TUNING.ages[near]
}

/** Hệ số thời gian chờ theo tuổi: bé nhỏ được nghĩ lâu hơn */
export const agePatience = (age: number) => ageRow(age).patience

/** Cấp khởi đầu theo tuổi */
export function startTierForAge(age: number): number {
  return Math.min(TIERS.length, Math.max(1, ageRow(age).startTier))
}

/** Cứ bấy nhiêu ngày tiến bộ lại lên một cấp */
export const DAYS_PER_TIER = TUNING.day.daysPerTier

/** Cấp cao nhất: các cấp trong tuning cộng các bậc thêm sau cấp cuối */
export const MAX_LEVEL = TIERS.length + TUNING.day.beyondLevels

/** Tiến độ lên cấp của bé (lưu trong hồ sơ) */
export interface LevelState {
  age: number
  /** Số ngày bán được tính là tiến bộ */
  progress: number
  /** Số ngày liền 0 sao */
  slump: number
  /** Số ngày liền 3 sao */
  hot: number
}

/** Cấp hiện tại (1, 2, …; lớn hơn số cấp trong tuning thì là bậc thêm sau cấp cuối) */
export function levelOf(s: LevelState): number {
  // Trượt mấy ngày liền: tạm hạ một cấp để ôn lại, bán được 1 sao là trở về
  const ease = s.slump >= TUNING.day.slumpDays ? 1 : 0
  const level = startTierForAge(s.age) + Math.floor(s.progress / DAYS_PER_TIER) - ease
  return Math.max(1, Math.min(MAX_LEVEL, level))
}

/** Ngày thứ mấy (0, 1, …) trong cấp hiện tại: dùng để tăng giá chợ dần trong cấp */
export const dayInLevel = (s: LevelState) => s.progress % DAYS_PER_TIER

/** Qua cấp cuối: giữ dạng câu hỏi của cấp cuối, giá và phạm vi số to dần mỗi bậc */
function beyondTier(k: number): Tier {
  const last = TIERS[TIERS.length - 1]
  const f = TUNING.day.beyondGrowth ** k
  const grow = (n: number) => Math.round(n * f)
  return {
    ...last,
    id: TIERS.length + k,
    name: `${last.name} +${k}`,
    maxTotal: grow(last.maxTotal),
    priceScale: grow(last.priceScale),
    bills: last.bills.map(grow),
  }
}

export function tierAt(level: number): Tier {
  return level <= TIERS.length ? TIERS[level - 1] : beyondTier(level - TIERS.length)
}

export const tierOf = (s: LevelState) => tierAt(levelOf(s))

/** Sau một ngày bán: `counted` = ngày đủ dài (đủ số câu tối thiểu) */
export function afterDay(s: LevelState, stars: number, counted: boolean): Omit<LevelState, 'age'> {
  if (!counted) return { progress: s.progress, slump: s.slump, hot: s.hot }
  let progress = s.progress + (stars >= TUNING.day.starsToAdvance ? 1 : 0)
  let hot = stars === 3 ? s.hot + 1 : 0
  // Mấy ngày liền 3 sao: bé làm tốt, cho lên nhanh thêm một ngày
  if (hot >= TUNING.day.fastTrackDays) {
    progress++
    hot = 0
  }
  return { progress, slump: stars === 0 ? s.slump + 1 : 0, hot }
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
      // Bảng cửu chương: giá gốc (2–9 xu) nhân số món
      return { ...p, kinds: ['multiply'], useMul: true, mulQty: small ? 3 : mid ? 5 : 9, priceScale: 1, maxTotal: Math.max(t.maxTotal, 99) }
    case 'div':
      if (small) return { ...p, kinds: ['share'], shareDiv: 3, shareQuot: 3 }
      if (mid) return { ...p, kinds: ['share', 'group', 'divide'], shareDiv: 5, shareQuot: 5, priceScale: 1, maxTotal: Math.max(t.maxTotal, 50) }
      if (t.id <= 8) return { ...p, kinds: ['share', 'group', 'divide'], shareDiv: 9, shareQuot: 9, priceScale: 1, maxTotal: 99 }
      return { ...p, kinds: ['share', 'group', 'divide', 'remainder'], shareDiv: 9, shareQuot: 12 }
  }
}

/** Bé càng nhỏ khách càng chờ lâu */
export function agePatienceFactor(age: number) {
  return ageRow(age).patience
}
