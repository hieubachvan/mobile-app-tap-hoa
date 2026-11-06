import { useState } from 'react'
import type { Profile } from '../game/storage'
import { tierOf } from '../game/levels'
import { MIN_SHELF, PRODUCE, cropOf, marketPrices, produceItem } from '../game/farm'
import { unitOf } from '../game/items'
import { CURRENCY } from '../game/questions'
import { sfx, speak } from '../game/sound'
import { warn } from '../components/Warning'
import { SHOP_RUNS_PER_DAY, rewardRunsLeft } from '../game/daily'

interface Props {
  profile: Profile
  onOpen: (shelf: Record<string, number>) => void
  onExit: () => void
}

/** Trước khi mở sạp: bé chọn bày bao nhiêu nông sản lên kệ */
export default function StallSetup({ profile, onOpen, onExit }: Props) {
  const prices = marketPrices(tierOf(profile), profile)
  const stock = profile.farm.stock
  const crops = PRODUCE.filter((c) => (stock[c.id] ?? 0) > 0)
  // Mặc định bày hết hàng trong kho
  const [shelf, setShelf] = useState<Record<string, number>>(() => Object.fromEntries(crops.map((c) => [c.id, stock[c.id]])))
  const total = Object.values(shelf).reduce((a, b) => a + b, 0)
  const sessionsLeft = rewardRunsLeft(profile.daily, 'shop')
  const ready = total >= MIN_SHELF && sessionsLeft > 0

  const change = (id: string, delta: number) => {
    const next = Math.max(0, Math.min(stock[id] ?? 0, (shelf[id] ?? 0) + delta))
    if (delta > 0 && next === shelf[id]) return warn(`Trong kho chỉ có ${stock[id]} ${cropOf(id).name.toLowerCase()}, bày hết lên kệ rồi!`)
    if (next === shelf[id]) return
    sfx.tap()
    setShelf({ ...shelf, [id]: next })
  }

  const open = () => {
    if (!sessionsLeft) return warn(`Hôm nay bé bán đủ ${SHOP_RUNS_PER_DAY} phiên chợ rồi, chợ đóng cửa. Mai quay lại bán tiếp nhé!`)
    if (!ready) {
      const inStock = crops.reduce((a, c) => a + stock[c.id], 0)
      const tip = inStock >= MIN_SHELF ? 'Bấm dấu + để bày thêm hàng nhé!' : 'Ra ruộng thu hoạch thêm nhé!'
      return warn(`Cần bày ít nhất ${MIN_SHELF} món mới mở sạp được, kệ đang có ${total} món. ${tip}`)
    }
    sfx.win()
    speak('Sạp mở cửa rồi! Khách tới mua hàng kìa!')
    onOpen(Object.fromEntries(Object.entries(shelf).filter(([, n]) => n > 0)))
  }

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onExit} aria-label="Về nông trại">
          ⬅️
        </button>
        <h1 className="screen-title">🛒 Bày hàng lên kệ</h1>
      </header>

      <p className="practice-tip">
        Chọn số nông sản đem ra sạp. Khách chỉ mua được hàng có trên kệ, hàng bán không hết sẽ cất lại vào kho.
      </p>

      {crops.length ? (
        <div className="upgrade-list">
          {crops.map((c) => {
            const n = shelf[c.id] ?? 0
            return (
              <div key={c.id} className="upgrade shelf-row">
                <span className="upgrade-emoji">{c.emoji}</span>
                <div className="upgrade-info">
                  <div className="upgrade-name">{c.name}</div>
                  <div className="upgrade-effect">
                    Giá hôm nay 🪙 {prices[c.id]} {CURRENCY}/{unitOf(produceItem(c))} · Trong kho: {stock[c.id]}
                  </div>
                </div>
                <div className="stepper">
                  <button className="step-btn" disabled={n === 0} onClick={() => change(c.id, -1)} aria-label={`Bớt ${c.name}`}>
                    −
                  </button>
                  <b>{n}</b>
                  <button className={`step-btn ${n >= stock[c.id] ? 'locked' : ''}`} onClick={() => change(c.id, 1)} aria-label={`Thêm ${c.name}`}>
                    +
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="practice-tip">🧺 Kho đang trống. Ra ruộng trồng cây và thu hoạch rồi quay lại bày hàng nhé!</p>
      )}

      <p className={`reward-tag center ${sessionsLeft ? '' : 'done'}`}>
        {sessionsLeft ? `🛒 Hôm nay còn ${sessionsLeft}/${SHOP_RUNS_PER_DAY} phiên chợ` : '🌙 Hôm nay chợ đóng cửa rồi, mai quay lại nhé!'}
      </p>

      <p className={`reward-tag center ${total >= MIN_SHELF ? '' : 'done'}`}>
        {total >= MIN_SHELF ? `Trên kệ có ${total} món` : `Cần bày ít nhất ${MIN_SHELF} món mới mở sạp được (đang có ${total})`}
      </p>

      <button className={`btn btn-primary btn-xl ${ready ? '' : 'locked'}`} onClick={open}>
        🛒 Mở sạp bán hàng
      </button>
    </div>
  )
}
