import { useEffect } from 'react'
import { CHECKIN_REWARDS } from '../game/daily'
import { speak } from '../game/sound'

interface Props {
  /** Ngày thứ mấy trong chuỗi nếu bé điểm danh hôm nay */
  nextStreak: number
  onClaim: () => void
}

export default function CheckIn({ nextStreak, onClaim }: Props) {
  const slot = (nextStreak - 1) % CHECKIN_REWARDS.length
  const reward = CHECKIN_REWARDS[slot]

  useEffect(() => {
    speak(nextStreak > 1 ? `Chào mừng quay lại! Ngày thứ ${nextStreak} liên tiếp rồi!` : 'Chào bé! Nhận quà điểm danh hôm nay nhé!')
  }, [nextStreak])

  return (
    <div className="overlay">
      <div className="overlay-card">
        <div className="result-emoji">🎁</div>
        <h2>Quà điểm danh</h2>
        <p className="result-text">
          🔥 Chuỗi <b>{nextStreak}</b> ngày liên tiếp
        </p>
        <div className="checkin-track">
          {CHECKIN_REWARDS.map((r, i) => (
            <div key={i} className={`checkin-day ${i < slot ? 'done' : ''} ${i === slot ? 'today' : ''} ${i === 6 ? 'big' : ''}`}>
              <small>Ngày {i + 1}</small>
              <span>{i < slot ? '✅' : i === 6 ? '💰' : '🪙'}</span>
              <b>{r}</b>
            </div>
          ))}
        </div>
        <p className="practice-tip">Vào chơi mỗi ngày để giữ chuỗi. Ngày thứ 7 có quà lớn!</p>
        <button className="btn btn-gold btn-xl" onClick={onClaim}>
          Nhận 🪙 {reward} xu
        </button>
      </div>
    </div>
  )
}
