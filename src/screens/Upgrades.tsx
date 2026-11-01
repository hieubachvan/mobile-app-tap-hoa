import { useState } from 'react'
import { callName, type Profile } from '../game/storage'
import { UPGRADES, effectText, type Upgrade } from '../game/upgrades'
import { levelPerks, nextShopLevel, shopLevel, type ShopLevel } from '../game/shopLevels'
import { sfx, speak } from '../game/sound'
import ShopDecor from '../components/ShopDecor'

interface Props {
  profile: Profile
  onBuy: (u: Upgrade) => void
  onLevelUp: (l: ShopLevel) => void
  onExit: () => void
}

export default function Upgrades({ profile, onBuy, onLevelUp, onExit }: Props) {
  const [justBought, setJustBought] = useState<string>()
  const [celebrate, setCelebrate] = useState<ShopLevel | null>(null)
  const current = shopLevel(profile.shopLevel)
  const next = nextShopLevel(profile.shopLevel)

  const buy = (u: Upgrade) => {
    if (profile.coins < u.cost || profile.owned.includes(u.id)) return
    sfx.coin()
    speak(`Tiệm có thêm ${u.name.toLowerCase()} rồi!`)
    setJustBought(u.id)
    onBuy(u)
  }

  const levelUp = () => {
    if (!next || profile.coins < next.cost) return
    sfx.win()
    speak(`Hoan hô! Tiệm đã lên cấp ${next.level}, ${next.name}!`)
    setCelebrate(next)
    onLevelUp(next)
  }

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onExit} aria-label="Về tiệm">
          ⬅️
        </button>
        <h1 className="screen-title">🔨 Nâng cấp tiệm</h1>
        <div className="chip push-right">🪙 {profile.coins}</div>
      </header>

      <section className="level-card">
        <div className="level-head">
          <span className="level-badge">Cấp {current.level}</span>
          <b>{current.name}</b>
        </div>
        <ShopDecor level={current} owned={profile.owned} highlight={justBought} />
        {next ? (
          <div className="level-next">
            <img className="level-next-img" src={next.image} alt={next.name} draggable={false} />
            <div className="level-next-info">
              <div className="upgrade-name">
                Lên cấp {next.level}: {next.name}
              </div>
              <div className="upgrade-effect">{levelPerks(next).join(' · ')}</div>
              <div className="quest-bar">
                <div style={{ width: `${Math.min(1, profile.coins / next.cost) * 100}%` }} />
              </div>
              <small className="upgrade-effect">
                {profile.coins >= next.cost ? 'Đủ xu rồi, nâng cấp thôi!' : `Còn thiếu ${next.cost - profile.coins} xu`}
              </small>
            </div>
            <button className="btn btn-primary upgrade-buy" disabled={profile.coins < next.cost} onClick={levelUp}>
              🪙 {next.cost}
            </button>
          </div>
        ) : (
          <p className="practice-tip">👑 Tiệm đã đạt cấp cao nhất. {callName(profile.name)} giỏi quá!</p>
        )}
      </section>

      <h2 className="section-title">Đồ trang trí</h2>

      <div className="upgrade-list">
        {UPGRADES.map((u) => {
          const has = profile.owned.includes(u.id)
          return (
            <div key={u.id} className={`upgrade ${has ? 'owned' : ''}`}>
              <span className="upgrade-emoji">{u.emoji}</span>
              <div className="upgrade-info">
                <div className="upgrade-name">{u.name}</div>
                <div className="upgrade-effect">{effectText(u)}</div>
              </div>
              {has ? (
                <span className="upgrade-owned">✅ Đã có</span>
              ) : (
                <button className="btn btn-gold upgrade-buy" disabled={profile.coins < u.cost} onClick={() => buy(u)}>
                  🪙 {u.cost}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {celebrate && (
        <div className="overlay">
          <div className="overlay-card">
            <div className="confetti">🎉✨🎊</div>
            <h2>Tiệm lên cấp {celebrate.level}!</h2>
            <div className="celebrate">
              <ShopDecor level={celebrate} owned={profile.owned} />
            </div>
            <p className="result-text">
              <b>{celebrate.name}</b>
              <br />
              {levelPerks(celebrate).join(' · ')}
            </p>
            <button className="btn btn-primary btn-xl" onClick={() => setCelebrate(null)}>
              Tuyệt vời! 🥳
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
