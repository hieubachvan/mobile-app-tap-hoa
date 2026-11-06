import raw from './tuning.json'
import type { Tier } from './levels'
import type { QuestKind } from './daily'

/**
 * Thông số cân bằng game, lưu trong tuning.json.
 * Sửa bằng trang cấu hình (`npm run config`) hoặc sửa thẳng file JSON.
 */
export interface Tuning {
  day: {
    /** Số ngày tiến bộ (đạt starsToAdvance sao) để lên một cấp */
    daysPerTier: number
    practiceQuestions: number
    /** Khách vừa tới quầy và đang nói: chưa trừ kiên nhẫn */
    graceSeconds: number
    /** Trả lời sai làm khách sốt ruột thêm (tỉ lệ trên tổng kiên nhẫn) */
    wrongPenalty: number
    /** Tỉ lệ câu đúng ngay lần đầu để được 1, 2, 3 sao */
    stars: [number, number, number]
    /** Ngày bán đạt từ bấy nhiêu sao mới tính là tiến bộ */
    starsToAdvance: number
    /** Bấy nhiêu ngày liền 3 sao thì được tính thêm một ngày tiến bộ (lên cấp nhanh) */
    fastTrackDays: number
    /** Bấy nhiêu ngày liền 0 sao thì tạm hạ một cấp để ôn lại */
    slumpDays: number
    /** Qua cấp cuối: mỗi bậc thêm, giá và phạm vi số nhân thêm hệ số này */
    beyondGrowth: number
    /** Số bậc tối đa sau cấp cuối (để số không to quá sức bé) */
    beyondLevels: number
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
    /** Trả lời sai / gắp sai bị trừ bấy nhiêu xu vào tiền lời của lượt đang chơi */
    mistakeCost: number
    /** Bé từ tuổi này trở lên mới bị trừ xu khi sai */
    mistakeFromAge: number
  }
  quests: Record<QuestKind, { target: number; reward: number }>
  tiers: Tier[]
  shopLevels: { level: number; name: string; cost: number; coins: number; patience: number; customers: number }[]
  upgrades: { id: string; name: string; cost: number; patience: number; coins: number; customers: number }[]
  farm: {
    /** Các cỡ ruộng theo thứ tự mở rộng và giá mở; cỡ đầu có sẵn */
    fields: { cols: number; rows: number; cost: number }[]
    crops: {
      id: string
      name: string
      /** Mở hạt giống từ ngày chơi này */
      unlockDay: number
      /** Giá một lần bón phân */
      fertilizer: number
      /** Số lần bón để cây chín */
      feeds: number
      /** Số nông sản thu được */
      harvest: number
      /** Giá gốc một món trên bảng giá; mỗi cấp nhân thêm priceScale */
      price: number
      /** Xu lời thêm cho mỗi nông sản bán được ở sạp */
      bonus: number
    }[]
    /** Nông sản có sẵn trong kho khi bé mới chơi */
    starter: Record<string, number>
    /** Phải bày ít nhất bấy nhiêu món lên kệ mới mở sạp */
    minShelf: number
    /** Ao cá: phải đào (mở bằng xu) mới câu được; cá câu được thành hàng bán ở sạp */
    pond: {
      cost: number
      /** Số giây một lượt câu */
      seconds: number
      /** Xô đựng tối đa bấy nhiêu con: đầy xô thì xong lượt sớm */
      bucket: number
      /** Câu sai / hết giờ bấy nhiêu lần trong lúc cá vùng vẫy thì cá sổng */
      misses: number
      /** Các loại cá từ bé đến lớn: cá càng lớn càng đắt nhưng vùng vẫy càng dữ */
      fish: {
        id: string
        name: string
        /** Số con loại này bơi trong ao cùng lúc */
        count: number
        /** Số phép phải làm đúng để kéo cá lên */
        questions: number
        /** Số giây cho mỗi phép (trước khi nhân hệ số tuổi) */
        seconds: number
        /** Phép tính dễ / khó hơn cấp của bé bấy nhiêu bậc */
        tierShift: number
        /** Giá gốc một con trên bảng giá; mỗi cấp nhân thêm priceScale */
        price: number
        /** Xu lời thêm cho mỗi con bán được */
        bonus: number
      }[]
    }
    /** Chuồng gà: cho gà ăn để đẻ trứng, mỗi ngày đuổi chuột trộm trứng */
    coop: {
      /** Số con gà trong chuồng */
      hens: number
      /** Giá một bữa thức ăn cho một con */
      feedCost: number
      /** Ăn bấy nhiêu bữa (mỗi lượt chơi một bữa) thì no, lượt sau đẻ */
      feeds: number
      /** Số trứng mỗi lần đẻ */
      eggsPerLay: number
      /** Số chuột tối đa mỗi đợt */
      maxMice: number
      /** Tốc độ chuột bò về ổ trứng (px/giây trên khung 360) */
      mouseSpeed: number
      eggPrice: number
      eggBonus: number
    }
  }
  customers: { id: string; title: string; patience: number }[]
}

// JSON không mang được kiểu chặt (tuple, union): trang cấu hình đảm bảo đúng dạng
export const TUNING = raw as unknown as Tuning
