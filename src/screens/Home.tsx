import type { Profile } from '../game/storage'
import { DAYS_PER_TIER, TIERS, tierFor } from '../game/levels'
import { sfx } from '../game/sound'
import { REWARD_RUNS_PER_DAY, claimable, ensureDaily, rewardRunsLeft } from '../game/daily'
import { nextShopLevel, shopLevel } from '../game/shopLevels'
import StreetScene from '../components/StreetScene'
import ShopSign from '../components/ShopSign'

interface Props {
  profile: Profile
  onPlay: (screen: 'shop' | 'gold' | 'practice' | 'upgrades' | 'quests') => void
  onToggleSound: () => void
  onReset: () => void
}

const COMING_SOON = [
  { emoji: '🎣', name: 'Câu cá số' },
  { emoji: '🧺', name: 'Hứng trái cây' },
]

function RewardTag({ left }: { left: number }) {
  return left > 0 ? (
    <span className="reward-tag">
      🪙 Còn {left}/{REWARD_RUNS_PER_DAY} lượt thưởng
    </span>
  ) : (
    <span className="reward-tag done">Mai quay lại nhận thưởng nhé!</span>
  )
}

export default function Home({ profile, onPlay, onToggleSound, onReset }: Props) {
  const tier = tierFor(profile.age, profile.day)
  const totalStars = Object.values(profile.stars).reduce((a, b) => a + b, 0)
  const dayInTier = ((profile.day - 1) % DAYS_PER_TIER) + 1
  const daily = ensureDaily(profile.daily)
  const questsDone = daily.quests.filter((q) => q.claimed).length
  const toClaim = claimable(profile.daily)
  const level = shopLevel(profile.shopLevel)
  const next = nextShopLevel(profile.shopLevel)
  const canLevelUp = next !== null && profile.coins >= next.cost
  const play = (s: Parameters<Props['onPlay']>[0]) => {
    sfx.tap()
    onPlay(s)
  }

  return (
    <div className="home">
      <header className="topbar">
        <div className="chip name-chip">👦 {profile.name}</div>
        <div className="chip">🪙 {profile.coins}</div>
        <div className="chip">⭐ {totalStars}</div>
        <button className="icon-btn" onClick={onToggleSound} aria-label="Bật/tắt âm thanh">
          {profile.sound ? '🔊' : '🔇'}
        </button>
      </header>

      <div className="storefront">
        <ShopSign name={profile.name} />
        <StreetScene mode="home" level={level} owned={profile.owned} />
        <div className="level-caption">
          <span className="level-badge">Cấp {level.level}</span> {level.name}
        </div>
      </div>

      <div className="home-actions">
        <button className="action-btn" onClick={() => play('quests')}>
          <span className="action-icon">📋</span>
          <span>
            <b>Nhiệm vụ {questsDone}/{daily.quests.length}</b>
            <small>🔥 Chuỗi {profile.streak} ngày</small>
          </span>
          {toClaim > 0 && <span className="badge">{toClaim}</span>}
        </button>
        <button className="action-btn" onClick={() => play('upgrades')}>
          <span className="action-icon">🔨</span>
          <span>
            <b>Nâng cấp tiệm</b>
            <small>{next ? `Cấp ${next.level}: 🪙 ${next.cost}` : '👑 Cấp cao nhất'}</small>
          </span>
          {canLevelUp && <span className="badge">⬆</span>}
        </button>
      </div>

      <section className="day-card">
        <div className="day-badge">Ngày {profile.day}</div>
        <div className="day-info">
          <div className="day-tier">Cấp {tier.id}: {tier.name}</div>
          <div className="day-desc">{tier.desc}</div>
          {tier.id < TIERS.length && (
            <div className="day-progress">
              {Array.from({ length: DAYS_PER_TIER }, (_, i) => (
                <span key={i} className={i < dayInTier ? 'dot on' : 'dot'} />
              ))}
              <small>lên cấp sau {DAYS_PER_TIER - dayInTier + 1} ngày</small>
            </div>
          )}
        </div>
      </section>

      <button className="btn btn-primary btn-xl" onClick={() => play('shop')}>
        🛒 Mở cửa bán hàng
      </button>

      <h2 className="section-title">Trò chơi nhỏ</h2>
      <div className="games">
        <button className="game-card gold" onClick={() => play('gold')}>
          <span className="game-emoji">⛏️</span>
          <span className="game-name">Đào vàng</span>
          <RewardTag left={rewardRunsLeft(profile.daily, 'gold')} />
          {profile.goldBest > 0 && <span className="game-best">Kỷ lục: {profile.goldBest}</span>}
        </button>
        <button className="game-card practice" onClick={() => play('practice')}>
          <span className="game-emoji">🎯</span>
          <span className="game-name">Luyện riêng</span>
          <RewardTag left={rewardRunsLeft(profile.daily, 'practice')} />
        </button>
        {COMING_SOON.map((g) => (
          <div key={g.name} className="game-card locked">
            <span className="game-emoji">{g.emoji}</span>
            <span className="game-name">{g.name}</span>
            <span className="game-best">Sắp ra mắt</span>
          </div>
        ))}
      </div>

      <button
        className="link-btn"
        onClick={() => {
          if (confirm('Chơi lại từ đầu? Tiến độ hiện tại sẽ bị xóa.')) onReset()
        }}
      >
        Đổi người chơi / chơi lại từ đầu
      </button>
    </div>
  )
}
