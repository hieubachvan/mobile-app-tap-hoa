import { ITEMS } from './items'
import { shopLevel } from './shopLevels'
import { TUNING } from './tuning'

export interface Decor {
  /** Vị trí trên ảnh mặt tiền, tính theo % (dùng chung cho mọi cấp tiệm) */
  x: number
  y: number
  /** Cỡ chữ emoji, tính theo % chiều rộng ảnh */
  size: number
}

export interface Upgrade {
  id: string
  emoji: string
  name: string
  cost: number
  /** Khách chờ lâu hơn, vd 0.2 = +20% */
  patience?: number
  /** Tiền lời thêm, vd 0.2 = +20% */
  coins?: number
  /** Thêm khách mỗi ngày */
  customers?: number
  decor: Decor[]
}

/** Hình và chỗ đặt trên mặt tiền; tên, giá, tác dụng lấy từ tuning.json */
const LOOKS: Pick<Upgrade, 'id' | 'emoji' | 'decor'>[] = [
  { id: 'plant', emoji: '🪴', decor: [{ x: 5, y: 86, size: 11 }] },
  { id: 'lantern', emoji: '🏮', decor: [{ x: 12, y: 24, size: 8 }, { x: 88, y: 24, size: 8 }] },
  { id: 'fruit', emoji: '🍉', decor: [{ x: 16, y: 90, size: 9 }] },
  { id: 'fridge', emoji: '🍦', decor: [{ x: 84, y: 90, size: 9 }] },
  { id: 'stationery', emoji: '✏️', decor: [{ x: 27, y: 92, size: 8 }] },
  { id: 'fan', emoji: '❄️', decor: [{ x: 30, y: 44, size: 6 }] },
  { id: 'cat', emoji: '🐱', decor: [{ x: 95, y: 84, size: 10 }] },
  { id: 'toys', emoji: '🧸', decor: [{ x: 73, y: 92, size: 9 }] },
  { id: 'chair', emoji: '🪑', decor: [{ x: 39, y: 93, size: 8 }] },
  { id: 'radio', emoji: '📻', decor: [{ x: 61, y: 93, size: 7 }] },
  { id: 'sign', emoji: '🌟', decor: [{ x: 6, y: 8, size: 7 }, { x: 94, y: 8, size: 7 }] },
]

export const UPGRADES: Upgrade[] = LOOKS.map((u) => ({ ...TUNING.upgrades.find((t) => t.id === u.id)!, ...u }))

interface ShopState {
  owned: string[]
  shopLevel: number
}

const owned = (p: ShopState) => UPGRADES.filter((u) => p.owned.includes(u.id))

/** Tổng tác dụng của đồ trong tiệm và cấp tiệm */
export const patienceBonus = (p: ShopState) => 1 + shopLevel(p.shopLevel).patience + owned(p).reduce((s, u) => s + (u.patience ?? 0), 0)
export const coinBonus = (p: ShopState) => 1 + shopLevel(p.shopLevel).coins + owned(p).reduce((s, u) => s + (u.coins ?? 0), 0)
export const extraCustomers = (p: ShopState) => shopLevel(p.shopLevel).customers + owned(p).reduce((s, u) => s + (u.customers ?? 0), 0)

/** Mô tả tác dụng để hiện cho bé */
export function effectText(u: Upgrade): string {
  const parts: string[] = []
  const goods = ITEMS.filter((i) => i.pack === u.id).map((i) => i.emoji)
  if (goods.length) parts.push(`Bán thêm ${goods.join(' ')}`)
  if (u.patience) parts.push(`Khách chờ lâu hơn ${u.patience * 100}%`)
  if (u.coins) parts.push(`Tiền lời +${u.coins * 100}%`)
  if (u.customers) parts.push(`Thêm ${u.customers} khách mỗi ngày`)
  return parts.length ? parts.join(' · ') : 'Trang trí cho tiệm thêm xinh'
}

/** Tiền lời mỗi khách phục vụ xong */
export const PROFIT_PER_CUSTOMER = TUNING.coins.perCustomer
/** Thưởng thêm khi bé trả lời đúng ngay mọi câu của khách đó */
export const PERFECT_BONUS = TUNING.coins.perfectBonus
