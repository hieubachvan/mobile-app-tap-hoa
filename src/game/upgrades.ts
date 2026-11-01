import { ITEMS } from './items'
import { shopLevel } from './shopLevels'

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

export const UPGRADES: Upgrade[] = [
  { id: 'plant', emoji: '🪴', name: 'Chậu cây xanh', cost: 30, decor: [{ x: 5, y: 86, size: 11 }] },
  { id: 'lantern', emoji: '🏮', name: 'Đèn lồng đỏ', cost: 40, decor: [{ x: 12, y: 24, size: 8 }, { x: 88, y: 24, size: 8 }] },
  { id: 'fruit', emoji: '🍉', name: 'Sạp trái cây', cost: 50, decor: [{ x: 16, y: 90, size: 9 }] },
  { id: 'fridge', emoji: '🍦', name: 'Tủ kem mát lạnh', cost: 60, decor: [{ x: 84, y: 90, size: 9 }] },
  { id: 'stationery', emoji: '✏️', name: 'Kệ văn phòng phẩm', cost: 60, decor: [{ x: 27, y: 92, size: 8 }] },
  { id: 'fan', emoji: '❄️', name: 'Máy lạnh', cost: 70, patience: 0.1, decor: [{ x: 30, y: 44, size: 6 }] },
  { id: 'cat', emoji: '🐱', name: 'Mèo thần tài', cost: 80, coins: 0.2, decor: [{ x: 95, y: 84, size: 10 }] },
  { id: 'toys', emoji: '🧸', name: 'Góc đồ chơi', cost: 100, decor: [{ x: 73, y: 92, size: 9 }] },
  { id: 'chair', emoji: '🪑', name: 'Ghế chờ cho khách', cost: 120, patience: 0.2, decor: [{ x: 39, y: 93, size: 8 }] },
  { id: 'radio', emoji: '📻', name: 'Loa phát nhạc', cost: 150, customers: 1, decor: [{ x: 61, y: 93, size: 7 }] },
  { id: 'sign', emoji: '🌟', name: 'Bảng hiệu đèn sáng', cost: 250, coins: 0.3, customers: 1, decor: [{ x: 6, y: 8, size: 7 }, { x: 94, y: 8, size: 7 }] },
]

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
export const PROFIT_PER_CUSTOMER = 5
/** Thưởng thêm khi bé trả lời đúng ngay mọi câu của khách đó */
export const PERFECT_BONUS = 3
