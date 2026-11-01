import type { DailyState } from './daily'
import { TEST_MODE } from './testMode'

export interface Profile {
  name: string
  age: number
  day: number
  coins: number
  /** Số sao cao nhất đạt được theo từng ngày */
  stars: Record<number, number>
  goldBest: number
  sound: boolean
  /** Cấp tiệm (mặt tiền) 1–5 */
  shopLevel: number
  /** Id các món nâng cấp tiệm đã mua */
  owned: string[]
  /** Chuỗi ngày điểm danh liên tiếp */
  streak: number
  /** Ngày điểm danh gần nhất (YYYY-MM-DD) */
  lastCheckIn: string
  daily?: DailyState
}

// Chế độ test lưu riêng để xu test không lẫn vào hồ sơ chơi thật
const KEY = TEST_MODE ? 'cau-lon-profile-test' : 'cau-lon-profile-v1'

const DEFAULTS = { shopLevel: 1, owned: [] as string[], streak: 0, lastCheckIn: '' }

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(KEY)
    // Hồ sơ cũ chưa có các trường mới: bù mặc định
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Profile) } : null
  } catch {
    return null
  }
}

export function saveProfile(p: Profile | null) {
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify(p))
    else localStorage.removeItem(KEY)
  } catch {
    /* trình duyệt chặn lưu trữ: chơi tiếp không lưu */
  }
}

export function newProfile(name: string, age: number): Profile {
  return { name, age, day: 1, coins: 0, stars: {}, goldBest: 0, sound: true, ...DEFAULTS }
}
