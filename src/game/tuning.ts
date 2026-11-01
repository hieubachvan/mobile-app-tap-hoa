import raw from './tuning.json'
import type { Tier } from './levels'
import type { QuestKind } from './daily'

/**
 * Thông số cân bằng game, lưu trong tuning.json.
 * Sửa bằng trang cấu hình (`npm run config`) hoặc sửa thẳng file JSON.
 */
export interface Tuning {
  day: {
    /** Số ngày chơi trước khi lên cấp */
    daysPerTier: number
    practiceQuestions: number
    /** Khách vừa tới quầy và đang nói: chưa trừ kiên nhẫn */
    graceSeconds: number
    /** Trả lời sai làm khách sốt ruột thêm (tỉ lệ trên tổng kiên nhẫn) */
    wrongPenalty: number
    /** Tỉ lệ câu đúng ngay lần đầu để được 1, 2, 3 sao */
    stars: [number, number, number]
  }
  /** Theo tuổi bé (3–10): cấp khởi đầu và hệ số kiên nhẫn của khách */
  ages: Record<string, { startTier: number; patience: number }>
  coins: {
    perCustomer: number
    /** Thưởng thêm khi bé trả lời đúng ngay mọi câu của khách đó */
    perfectBonus: number
    goldPerCorrect: number
    goldSeconds: number
    /** Lượt Đào vàng / Luyện riêng được nhận xu mỗi ngày */
    rewardRunsPerDay: number
    /** Quà điểm danh 7 ngày */
    checkin: number[]
    /** Rương khi xong cả 3 nhiệm vụ */
    chest: number
  }
  quests: Record<QuestKind, { target: number; reward: number }>
  tiers: Tier[]
  shopLevels: { level: number; name: string; cost: number; coins: number; patience: number; customers: number }[]
  upgrades: { id: string; name: string; cost: number; patience: number; coins: number; customers: number }[]
  customers: { id: string; title: string; patience: number }[]
}

// JSON không mang được kiểu chặt (tuple, union): trang cấu hình đảm bảo đúng dạng
export const TUNING = raw as unknown as Tuning
