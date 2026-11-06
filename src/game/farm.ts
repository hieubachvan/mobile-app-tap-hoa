import { EGG, type Coop } from './coop'
import type { Item } from './items'
import { DAYS_PER_TIER, dayInLevel, type LevelState, type Tier } from './levels'
import type { Goods, Line } from './questions'
import { TUNING } from './tuning'

export interface Crop {
  id: string
  emoji: string
  name: string
  /** Đơn vị + tên khi bán ở sạp, vd "quả cà chua" */
  item: string
  unlockDay: number
  fertilizer: number
  feeds: number
  harvest: number
  price: number
  bonus: number
}

/** Hình và tên hàng; giá phân, số lần bón, sản lượng lấy từ tuning.json */
const LOOKS: Pick<Crop, 'id' | 'emoji' | 'item'>[] = [
  { id: 'tomato', emoji: '🍅', item: 'quả cà chua' },
  { id: 'cucumber', emoji: '🥒', item: 'quả dưa leo' },
  { id: 'corn', emoji: '🌽', item: 'trái bắp' },
  { id: 'strawberry', emoji: '🍓', item: 'quả dâu tây' },
  { id: 'eggplant', emoji: '🍆', item: 'quả cà tím' },
  { id: 'pumpkin', emoji: '🎃', item: 'quả bí ngô' },
]

/** Cây gieo được trên ruộng */
export const CROPS: Crop[] = LOOKS.map((c) => ({ ...TUNING.farm.crops.find((t) => t.id === c.id)!, ...c }))

const POND = TUNING.farm.pond

const FISH_EMOJI: Record<string, string> = { fish: '🐟', fish_mid: '🐠', fish_big: '🐡' }

export type FishKind = (typeof POND.fish)[number] & { emoji: string }

/** Các loại cá trong ao, từ bé đến lớn */
export const FISH_KINDS: FishKind[] = POND.fish.map((f) => ({ ...f, emoji: FISH_EMOJI[f.id] ?? '🐟' }))

/** Cá câu ở ao: không gieo được, nhưng vào kho và bán ở sạp như nông sản */
export const FISHES: Crop[] = FISH_KINDS.map((f) => ({
  id: f.id, emoji: f.emoji, name: f.name, item: `con ${f.name.toLowerCase()}`,
  unlockDay: 1, fertilizer: 0, feeds: 0, harvest: 0, price: f.price, bonus: f.bonus,
}))

/** Mọi thứ bày lên kệ được: nông sản, cá và trứng */
export const PRODUCE: Crop[] = [...CROPS, ...FISHES, EGG]

export const cropOf = (id: string) => PRODUCE.find((c) => c.id === id)!

/** Giá đào ao cá */
export const POND_COST = POND.cost

/** Các cỡ ruộng theo thứ tự mở rộng; cỡ đầu có sẵn */
export const FIELDS = TUNING.farm.fields

export interface Plot {
  crop: string
  /** Số lần đã bón */
  fed: number
  /** Lượt chơi lúc bón gần nhất: mỗi lượt chơi chỉ bón được 1 lần */
  lastFed: number
}

export interface Farm {
  /** Chỉ số cỡ ruộng trong FIELDS */
  size: number
  /** Cây đang trồng theo ô "hàng-cột"; ô không có trong đây là đất trống */
  tiles: Record<string, Plot>
  /** Nông sản đã thu hoạch, chờ bán ở sạp */
  stock: Record<string, number>
  /** Đã đào ao cá chưa (hồ sơ cũ chưa có) */
  pond?: boolean
  /** Chuồng gà (hồ sơ cũ chưa có, đọc qua coopOf) */
  coop?: Coop
}

export const newFarm = (): Farm => ({ size: 0, tiles: {}, stock: { ...TUNING.farm.starter } })

export type TileAction = 'plant' | 'feed' | 'harvest'

/** Hiệu ứng khi bé dùng công cụ lên một ô */
export interface TileFx {
  action: TileAction
  /** Chữ bay lên trên ô, vd "🍅+2" */
  label: string
}

/** Các chỗ trên bản đồ nông trại */
export type PlaceId = 'house' | 'coop' | 'fish' | 'gold' | 'shop' | 'expand'

export const fieldOf = (f: Farm) => FIELDS[Math.min(f.size, FIELDS.length - 1)]

export const tileKey = (row: number, col: number) => `${row}-${col}`

/** Mọi ô của ruộng hiện tại, theo hàng */
export function tileKeys(f: Farm): string[] {
  const { rows, cols } = fieldOf(f)
  return Array.from({ length: rows * cols }, (_, i) => tileKey(Math.floor(i / cols), i % cols))
}

export const inField = (f: Farm, key: string) => tileKeys(f).includes(key)

/** Cỡ ruộng mở rộng kế tiếp; null = đã rộng nhất */
export const nextField = (f: Farm) => FIELDS[f.size + 1] ?? null

export const isRipe = (p: Plot) => p.fed >= cropOf(p.crop).feeds

/** Giai đoạn cây: 1 cây non, 2 ra hoa (đã bón được nửa số lần), 3 kết trái (chín, hái được) */
export function stageOf(p: Plot): 1 | 2 | 3 {
  if (isRipe(p)) return 3
  return p.fed * 2 >= cropOf(p.crop).feeds ? 2 : 1
}

/** Hình cây theo giai đoạn, cắt từ bộ caytrong.png */
export const cropImage = (crop: string, stage: 1 | 2 | 3) => `/img/crops/${crop}-${stage}.webp`

export const CROP_IMAGES = CROPS.flatMap((c) => ([1, 2, 3] as const).map((s) => cropImage(c.id, s)))

/** `runs`: số lượt chơi bé đã xong */
export const canFeed = (p: Plot, runs: number) => !isRipe(p) && p.lastFed !== runs

/** Số cây đang chờ bé: bón được hoặc đã chín */
export const farmTodo = (f: Farm, runs: number) => Object.values(f.tiles).filter((p) => isRipe(p) || canFeed(p, runs)).length

export const ripeCount = (f: Farm) => Object.values(f.tiles).filter(isRipe).length

export const stockCount = (f: Farm) => Object.values(f.stock).reduce((a, b) => a + b, 0)

export const produceItem = (c: Crop): Item => ({ emoji: c.emoji, name: c.item, crop: c.id })

/** Số nông sản trong đơn của khách, theo loại cây */
export function produceIn(lines: Line[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const l of lines) if (l.item.crop) out[l.item.crop] = (out[l.item.crop] ?? 0) + l.qty
  return out
}

/** Xu thêm khi bán số nông sản này */
export const produceBonus = (sold: Record<string, number>) =>
  Object.entries(sold).reduce((s, [id, n]) => s + n * cropOf(id).bonus, 0)

/** Cộng dồn số nông sản `b` vào `a` (`sign` = -1 để trừ, không xuống dưới 0) */
export function addStock(a: Record<string, number>, b: Record<string, number>, sign = 1) {
  const out = { ...a }
  for (const [id, n] of Object.entries(b)) out[id] = Math.max(0, (out[id] ?? 0) + sign * n)
  return out
}


/** Phải bày ít nhất bấy nhiêu món lên kệ mới mở sạp */
export const MIN_SHELF = TUNING.farm.minShelf

/** Số 0–1 cố định theo chuỗi: cùng ngày, cùng loại thì ra cùng giá (mở lại sạp vẫn thấy giá cũ) */
function seeded(key: string) {
  let h = 2166136261
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return ((h >>> 0) % 10007) / 10007
}

/**
 * Giá chợ hôm nay của một món: giá gốc × hệ số cấp × dao động theo ngày.
 * `ramp` 0–1: đầu cấp giá thấp, cuối cấp giá cao hơn để ngày sau khó hơn ngày trước một chút.
 */
export function priceAt(c: Crop, t: Tier, day: number, ramp: number) {
  const lo = 0.6 + 0.3 * ramp
  const hi = 1.2 + 0.4 * ramp
  const raw = c.price * t.priceScale * (lo + (hi - lo) * seeded(`${day}-${c.id}`))
  // Số to thì làm tròn cho dễ đọc: tròn chục, tròn trăm
  const step = raw >= 1000 ? 100 : raw >= 100 ? 10 : raw >= 30 ? 5 : 1
  return Math.max(1, Math.round(raw / step) * step)
}

/** Bảng giá chợ hôm nay cho mọi loại nông sản, ở cấp `t` */
export function marketPrices(t: Tier, p: LevelState & { day: number }): Record<string, number> {
  const ramp = DAYS_PER_TIER > 1 ? dayInLevel(p) / (DAYS_PER_TIER - 1) : 1
  return Object.fromEntries(PRODUCE.map((c) => [c.id, priceAt(c, t, p.day, ramp)]))
}

/** Hàng bày trên kệ thành danh sách cho khách mua */
export const shelfGoods = (shelf: Record<string, number>, prices: Record<string, number>): Goods[] =>
  PRODUCE.filter((c) => (shelf[c.id] ?? 0) > 0).map((c) => ({ item: produceItem(c), price: prices[c.id], left: shelf[c.id] }))

/** Luyện riêng: kệ có mọi loại đã mở, bán không bao giờ hết và không lấy hàng trong kho */
export const practiceGoods = (day: number, prices: Record<string, number>): Goods[] =>
  CROPS.filter((c) => day >= c.unlockDay).map((c) => ({ item: produceItem(c), price: prices[c.id], left: 99 }))
