import type { Profile } from '../game/storage'
import { CHEST_REWARD, CHECKIN_REWARDS, QUEST_ICON, ensureDaily, questText } from '../game/daily'
import { sfx } from '../game/sound'

interface Props {
  profile: Profile
  onClaimQuest: (index: number) => void
  onClaimChest: () => void
  onExit: () => void
}

export default function Quests({ profile, onClaimQuest, onClaimChest, onExit }: Props) {
  const daily = ensureDaily(profile.daily)
  const allClaimed = daily.quests.every((q) => q.claimed)
  const slot = profile.streak > 0 ? (profile.streak - 1) % CHECKIN_REWARDS.length : -1

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onExit} aria-label="Về tiệm">
          ⬅️
        </button>
        <h1 className="screen-title">📋 Nhiệm vụ hôm nay</h1>
      </header>

      <section className="streak-card">
        <div className="streak-fire">🔥</div>
        <div>
          <div className="streak-num">{profile.streak} ngày liên tiếp</div>
          <div className="streak-dots">
            {CHECKIN_REWARDS.map((_, i) => (
              <span key={i} className={i <= slot ? 'on' : ''} />
            ))}
          </div>
          <small>Mai nhớ quay lại để giữ chuỗi nhé!</small>
        </div>
      </section>

      <div className="quest-list">
        {daily.quests.map((q, i) => {
          const done = q.progress >= q.target
          return (
            <div key={q.kind} className={`quest ${q.claimed ? 'claimed' : ''}`}>
              <span className="quest-icon">{QUEST_ICON[q.kind]}</span>
              <div className="quest-info">
                <div className="quest-name">{questText(q)}</div>
                <div className="quest-bar">
                  <div style={{ width: `${(q.progress / q.target) * 100}%` }} />
                </div>
                <small>
                  {q.progress}/{q.target}
                </small>
              </div>
              {q.claimed ? (
                <span className="upgrade-owned">✅</span>
              ) : (
                <button
                  className="btn btn-gold upgrade-buy"
                  disabled={!done}
                  onClick={() => {
                    sfx.coin()
                    onClaimQuest(i)
                  }}
                >
                  🪙 {q.reward}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <section className={`chest ${allClaimed && !daily.chestClaimed ? 'ready' : ''}`}>
        <span className="chest-icon">{daily.chestClaimed ? '📭' : '🧰'}</span>
        <div className="quest-info">
          <div className="quest-name">Rương thưởng</div>
          <small>{daily.chestClaimed ? 'Đã mở hôm nay. Mai có rương mới!' : 'Làm xong cả 3 nhiệm vụ để mở'}</small>
        </div>
        {!daily.chestClaimed && (
          <button
            className="btn btn-gold upgrade-buy"
            disabled={!allClaimed}
            onClick={() => {
              sfx.win()
              onClaimChest()
            }}
          >
            🪙 {CHEST_REWARD}
          </button>
        )}
      </section>
    </div>
  )
}
