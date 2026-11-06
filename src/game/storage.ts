import type { DailyState } from './daily'
import { newFarm, type Farm } from './farm'
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
  farm: Farm
  /** Số lượt chơi đã xong (bán hàng, đào vàng, luyện riêng): cây bón được thêm 1 lần mỗi lượt */
  runs: number
  /** Số ngày bán được tính là tiến bộ (quyết định cấp cùng với tuổi) */
  progress: number
  /** Số ngày liền 0 sao (đủ nhiều thì tạm hạ một cấp) */
  slump: number
  /** Số ngày liền 3 sao (đủ nhiều thì lên nhanh) */
  hot: number
}

// Chế độ test lưu riêng để xu test không lẫn vào hồ sơ chơi thật
const KEY = TEST_MODE ? 'cau-lon-profile-test' : 'cau-lon-profile-v1'

const DEFAULTS = { shopLevel: 1, owned: [] as string[], streak: 0, lastCheckIn: '', farm: newFarm(), runs: 0, slump: 0, hot: 0 }

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(KEY)
    // Hồ sơ cũ chưa có các trường mới: bù mặc định
    if (!raw) return null
    const saved = JSON.parse(raw) as Profile
    // Hồ sơ cũ lên cấp theo số ngày: lấy số ngày đã qua làm tiến độ để giữ nguyên cấp
    const p: Profile = { ...DEFAULTS, ...saved, progress: saved.progress ?? saved.day - 1 }
    // Bản thử nông trại đầu tiên chưa có ruộng ô lưới: làm ruộng mới, giữ kho
    return p.farm.tiles ? p : { ...p, farm: { ...newFarm(), stock: p.farm.stock ?? {} } }
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

/** Tên để gọi bé trong lời thoại: chữ cuối của họ tên, vd "Nguyễn Minh Khôi" → "Khôi" */
export const callName = (name: string) => name.trim().split(/\s+/).pop() || name

export function newProfile(name: string, age: number): Profile {
  return { name, age, day: 1, coins: 0, stars: {}, goldBest: 0, sound: true, progress: 0, ...DEFAULTS }
}
