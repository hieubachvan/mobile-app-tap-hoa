import { TUNING } from './tuning'

export interface ShopLevel {
  level: number
  name: string
  /** Mặt tiền tiệm ở cấp này */
  image: string
  /** Rộng / cao của ảnh */
  ratio: number
  /** Số xu để lên cấp này (cấp 1 có sẵn) */
  cost: number
  /** Tiền lời thêm, vd 0.2 = +20% */
  coins: number
  /** Khách chờ lâu hơn, vd 0.1 = +10% */
  patience: number
  /** Thêm khách mỗi ngày */
  customers: number
}

/** Ảnh mặt tiền từng cấp; tên, giá, tác dụng lấy từ tuning.json */
const LOOKS: Pick<ShopLevel, 'level' | 'image' | 'ratio'>[] = [
  { level: 1, image: '/img/shop-lv1.webp', ratio: 446 / 375 },
  { level: 2, image: '/img/shop-lv2.webp', ratio: 477 / 431 },
  { level: 3, image: '/img/shop-lv3.webp', ratio: 519 / 446 },
  { level: 4, image: '/img/shop-lv4.webp', ratio: 687 / 441 },
  { level: 5, image: '/img/shop-lv5.webp', ratio: 793 / 491 },
]

export const SHOP_LEVELS: ShopLevel[] = LOOKS.map((l) => ({ ...TUNING.shopLevels.find((t) => t.level === l.level)!, ...l }))

export const MAX_SHOP_LEVEL = SHOP_LEVELS.length

export const shopLevel = (n: number) => SHOP_LEVELS[Math.min(Math.max(n, 1), MAX_SHOP_LEVEL) - 1]

export const nextShopLevel = (n: number): ShopLevel | null => (n < MAX_SHOP_LEVEL ? SHOP_LEVELS[n] : null)

export function levelPerks(l: ShopLevel): string[] {
  const perks: string[] = []
  if (l.coins) perks.push(`Tiền lời +${Math.round(l.coins * 100)}%`)
  if (l.customers) perks.push(`Thêm ${l.customers} khách mỗi ngày`)
  if (l.patience) perks.push(`Khách chờ lâu hơn ${Math.round(l.patience * 100)}%`)
  return perks
}
