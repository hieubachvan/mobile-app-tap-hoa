import { useState } from 'react'
import { OPS, type Op } from '../game/levels'
import { sfx } from '../game/sound'
import { REWARD_RUNS_PER_DAY } from '../game/daily'

interface Props {
  /** Số lượt Luyện riêng còn được nhận xu hôm nay */
  rewardLeft: number
  onPlay: (screen: 'shop' | 'gold', op: Op) => void
  onExit: () => void
}

export default function Practice({ rewardLeft, onPlay, onExit }: Props) {
  const [op, setOp] = useState<Op | null>(null)

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onExit} aria-label="Về tiệm">
          ⬅️
        </button>
        <h1 className="screen-title">🎯 Luyện riêng</h1>
      </header>

      <p className="practice-tip">Bé muốn luyện phép tính nào? Luyện riêng không ảnh hưởng tiến độ ngày.</p>
      <p className={`reward-tag center ${rewardLeft > 0 ? '' : 'done'}`}>
        {rewardLeft > 0
          ? `🪙 Hôm nay còn ${rewardLeft}/${REWARD_RUNS_PER_DAY} lượt nhận xu`
          : 'Hôm nay đã hết lượt nhận xu. Bé vẫn luyện được, mai quay lại nhận thưởng nhé!'}
      </p>

      <div className="op-grid">
        {OPS.map((o) => (
          <button
            key={o.op}
            className={`op-btn ${op === o.op ? 'active' : ''}`}
            onClick={() => {
              sfx.tap()
              setOp(o.op)
            }}
          >
            <span className="op-sign">{o.sign}</span>
            <span>{o.name}</span>
          </button>
        ))}
      </div>

      {op && (
        <div className="practice-actions">
          <button className="btn btn-primary btn-xl" onClick={() => onPlay('shop', op)}>
            🛒 Bán hàng
          </button>
          <button className="btn btn-gold btn-xl" onClick={() => onPlay('gold', op)}>
            ⛏️ Đào vàng
          </button>
        </div>
      )}
    </div>
  )
}
