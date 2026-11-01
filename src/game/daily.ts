import { TUNING } from './tuning'

/** Quà điểm danh theo ngày trong chuỗi 7 ngày (ngày 7 là quà lớn) */
export const CHECKIN_REWARDS = TUNING.coins.checkin

export const CHEST_REWARD = TUNING.coins.chest

/** Mỗi ngày chỉ bấy nhiêu lượt Đào vàng / Luyện riêng được nhận xu; chơi thêm vẫn được nhưng không có xu */
export const REWARD_RUNS_PER_DAY = TUNING.coins.rewardRunsPerDay

export type RewardGame = 'gold' | 'practice'

export type QuestKind = 'serve' | 'perfect' | 'gold' | 'practice' | 'stars'

export interface Quest {
  kind: QuestKind
  target: number
  reward: number
  progress: number
  claimed: boolean
}

export interface DailyState {
  date: string
  quests: Quest[]
  chestClaimed: boolean
  /** Số lượt đã nhận xu hôm nay; hồ sơ cũ có thể chưa có */
  rewardRuns?: Partial<Record<RewardGame, number>>
}

const POOL: Omit<Quest, 'progress' | 'claimed'>[] = (Object.keys(TUNING.quests) as QuestKind[]).map((kind) => ({
  kind,
  ...TUNING.quests[kind],
}))

export function questText(q: Quest) {
  switch (q.kind) {
    case 'serve': return `Bán hàng cho ${q.target} khách`
    case 'perfect': return `Trả lời đúng ngay cho ${q.target} khách`
    case 'gold': return `Gắp đúng ${q.target} cục vàng`
    case 'practice': return `Hoàn thành ${q.target} lượt luyện riêng`
    case 'stars': return `Được 3 sao trong một ngày bán hàng`
  }
}

export const QUEST_ICON: Record<QuestKind, string> = {
  serve: '🛒',
  perfect: '🎯',
  gold: '⛏️',
  practice: '📝',
  stars: '⭐',
}

/** Ngày theo giờ máy của bé, dạng YYYY-MM-DD */
export function today(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function yesterday() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return today(d)
}

/** Chọn 3 nhiệm vụ cố định theo ngày (mở lại app trong ngày vẫn ra cùng nhiệm vụ) */
export function newDaily(date: string): DailyState {
  let seed = [...date].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
  const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32
  const pool = [...POOL]
  const quests: Quest[] = []
  while (quests.length < 3) {
    const [q] = pool.splice(Math.floor(rnd() * pool.length), 1)
    quests.push({ ...q, progress: 0, claimed: false })
  }
  return { date, quests, chestClaimed: false, rewardRuns: {} }
}

export function rewardRunsLeft(d: DailyState | undefined, game: RewardGame) {
  return Math.max(0, REWARD_RUNS_PER_DAY - (ensureDaily(d).rewardRuns?.[game] ?? 0))
}

/** Ghi nhận đã dùng một lượt có thưởng */
export function spendRewardRun(d: DailyState | undefined, game: RewardGame): DailyState {
  const cur = ensureDaily(d)
  const runs = cur.rewardRuns ?? {}
  return { ...cur, rewardRuns: { ...runs, [game]: (runs[game] ?? 0) + 1 } }
}

export function ensureDaily(d: DailyState | undefined): DailyState {
  const t = today()
  return d && d.date === t ? d : newDaily(t)
}

export function addProgress(d: DailyState | undefined, gains: Partial<Record<QuestKind, number>>): DailyState {
  const cur = ensureDaily(d)
  return {
    ...cur,
    quests: cur.quests.map((q) => ({ ...q, progress: Math.min(q.target, q.progress + (gains[q.kind] ?? 0)) })),
  }
}

/** Số việc đang chờ bé bấm nhận thưởng */
export function claimable(d: DailyState | undefined) {
  const cur = ensureDaily(d)
  const quests = cur.quests.filter((q) => q.progress >= q.target && !q.claimed).length
  const chest = !cur.chestClaimed && cur.quests.every((q) => q.claimed) ? 1 : 0
  return quests + chest
}
