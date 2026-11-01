import type { Hint } from '../game/questions'

/** Gợi ý trực quan bằng chấm tròn: cộng = nhóm chấm, trừ = gạch bớt chấm */
export default function HintDots({ hint }: { hint: Hint }) {
  if (hint.groups) {
    return (
      <div className="dots-row">
        {hint.groups.map((g, i) => (
          <span key={i} className="dot-group-wrap">
            {i > 0 && <span className="dot-plus">+</span>}
            <span className={`dot-group c${i % 4}`}>
              {Array.from({ length: g }, (_, j) => (
                <i key={j} />
              ))}
            </span>
          </span>
        ))}
      </div>
    )
  }
  if (hint.bags) {
    const { count, per, extra, emoji } = hint.bags
    return (
      <div className="dots-row">
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className="bag">
            <span className="bag-icon">{emoji}</span>
            <span className={`dot-group c${i % 4}`}>
              {Array.from({ length: per }, (_, j) => (
                <i key={j} />
              ))}
            </span>
          </span>
        ))}
        {extra > 0 && (
          <span className="bag leftover">
            <span className="bag-icon">dư</span>
            <span className="dot-group c3">
              {Array.from({ length: extra }, (_, j) => (
                <i key={j} />
              ))}
            </span>
          </span>
        )}
      </div>
    )
  }
  if (hint.takeAway) {
    const { from, take } = hint.takeAway
    return (
      <div className="dots-row">
        <span className="dot-group c0">
          {Array.from({ length: from }, (_, j) => (
            <i key={j} className={j >= from - take ? 'gone' : ''} />
          ))}
        </span>
      </div>
    )
  }
  return null
}
