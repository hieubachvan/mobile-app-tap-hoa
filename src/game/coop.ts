import type { Crop } from './farm'
import { TUNING } from './tuning'

export const COOP = TUNING.farm.coop

export interface Hen {
  /** Số bữa đã ăn từ lần đẻ trước */
  fed: number
  /** Lượt chơi lúc ăn gần nhất: mỗi lượt chỉ ăn 1 bữa */
  lastFed: number
}

export interface Coop {
  hens: Hen[]
  /** Trứng trong ổ, chưa nhặt (chuột chỉ trộm được trứng này) */
  nest: number
  /** Ngày (YYYY-MM-DD) đã có đợt chuột; mỗi ngày một đợt */
  raidDate: string
}

/** Trứng gà: vào kho và bán ở sạp như nông sản */
export const EGG: Crop = {
  id: 'egg', emoji: '🥚', name: 'Trứng gà', item: 'quả trứng gà',
  unlockDay: 1, fertilizer: 0, feeds: 0, harvest: 0, price: COOP.eggPrice, bonus: COOP.eggBonus,
}

const newHen = (): Hen => ({ fed: 0, lastFed: -1 })

/** Chuồng của hồ sơ; hồ sơ cũ chưa có thì tạo mới, đổi số gà trong tuning thì bù/bớt */
export function coopOf(c: Coop | undefined): Coop {
  const base = c ?? { hens: [], nest: 0, raidDate: '' }
  const hens = Array.from({ length: COOP.hens }, (_, i) => base.hens[i] ?? newHen())
  return { ...base, hens }
}

export const isFull = (h: Hen) => h.fed >= COOP.feeds

export const canFeedHen = (h: Hen, runs: number) => !isFull(h) && h.lastFed !== runs

/** Gà no từ lượt trước thì đã đẻ: dồn trứng vào ổ (gọi lại nhiều lần vẫn ra cùng kết quả) */
export function settleCoop(c: Coop, runs: number): Coop {
  let nest = c.nest
  const hens = c.hens.map((h) => {
    if (!isFull(h) || runs <= h.lastFed) return h
    nest += COOP.eggsPerLay
    return { ...h, fed: 0 }
  })
  return { ...c, hens, nest }
}

/** Hôm nay chuột chưa đến mà ổ có trứng: vào chuồng là gặp chuột */
export const raidPending = (c: Coop, date: string) => c.nest > 0 && c.raidDate !== date

/** Số chuột của đợt: không nhiều hơn số trứng (ít nhất 2 cho vui) */
export const miceFor = (nest: number) => Math.min(COOP.maxMice, Math.max(2, nest))
