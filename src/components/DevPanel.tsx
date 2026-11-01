import { useState } from 'react'
import type { Profile } from '../game/storage'
import { MAX_SHOP_LEVEL } from '../game/shopLevels'
import { UPGRADES } from '../game/upgrades'
import { newDaily, today, yesterday } from '../game/daily'

interface Props {
  profile: Profile
  update: (patch: Partial<Profile> | ((p: Profile) => Partial<Profile>)) => void
}

/** Công cụ test, chỉ có khi chạy `npm run dev:test` */
export default function DevPanel({ profile, update }: Props) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button className="dev-fab" onClick={() => setOpen(true)} aria-label="Mở bảng dev">
        🛠
      </button>
    )
  }

  const btn = (label: string, fn: () => void) => (
    <button key={label} className="dev-btn" onClick={fn}>
      {label}
    </button>
  )

  return (
    <div className="dev-panel">
      <div className="dev-head">
        <b>🛠 Dev mode</b>
        <button className="dev-btn" onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>
      <div className="dev-info">
        🪙 {profile.coins} · Cấp tiệm {profile.shopLevel} · Ngày {profile.day} · Tuổi {profile.age} · 🔥 {profile.streak}
      </div>

      <div className="dev-label">Xu</div>
      <div className="dev-row">
        {[100, 1000, 10000].map((n) => btn(`+${n}`, () => update((p) => ({ coins: p.coins + n }))))}
        {btn('Về 0', () => update({ coins: 0 }))}
      </div>

      <div className="dev-label">Cấp tiệm</div>
      <div className="dev-row">
        {Array.from({ length: MAX_SHOP_LEVEL }, (_, i) => btn(`${i + 1}`, () => update({ shopLevel: i + 1 })))}
      </div>

      <div className="dev-label">Đồ trong tiệm</div>
      <div className="dev-row">
        {btn('Có hết', () => update({ owned: UPGRADES.map((u) => u.id) }))}
        {btn('Xoá hết', () => update({ owned: [] }))}
      </div>

      <div className="dev-label">Ngày chơi / tuổi</div>
      <div className="dev-row">
        {btn('Ngày −1', () => update((p) => ({ day: Math.max(1, p.day - 1) })))}
        {btn('Ngày +1', () => update((p) => ({ day: p.day + 1 })))}
        {btn('Tuổi −1', () => update((p) => ({ age: Math.max(3, p.age - 1) })))}
        {btn('Tuổi +1', () => update((p) => ({ age: Math.min(10, p.age + 1) })))}
      </div>

      <div className="dev-label">Điểm danh & nhiệm vụ</div>
      <div className="dev-row">
        {btn('Điểm danh lại', () => update((p) => ({ lastCheckIn: yesterday(), streak: Math.max(0, p.streak) })))}
        {btn('Chuỗi 6 ngày', () => update({ lastCheckIn: yesterday(), streak: 6 }))}
        {btn('Xong nhiệm vụ', () =>
          update((p) => {
            const d = p.daily?.date === today() ? p.daily : newDaily(today())
            return { daily: { ...d, quests: d.quests.map((q) => ({ ...q, progress: q.target })) } }
          }),
        )}
        {btn('Nhiệm vụ mới', () => update({ daily: newDaily(today()) }))}
      </div>
    </div>
  )
}
