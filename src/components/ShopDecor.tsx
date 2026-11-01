import type { ShopLevel } from '../game/shopLevels'
import { UPGRADES } from '../game/upgrades'

interface Props {
  level: ShopLevel
  owned: string[]
  /** Món vừa mua: nảy lên cho bé thấy */
  highlight?: string
}

/** Mặt tiền tiệm đúng cấp, kèm các món trang trí bé đã mua */
export default function ShopDecor({ level, owned, highlight }: Props) {
  return (
    <div className="storefront-box" style={{ aspectRatio: level.ratio, ['--ratio' as string]: level.ratio }}>
      <img className="storefront-img" src={level.image} alt={level.name} draggable={false} />
      {UPGRADES.filter((u) => owned.includes(u.id)).flatMap((u) =>
        u.decor.map((d, i) => (
          <span
            key={`${u.id}-${i}`}
            className={`decor ${highlight === u.id ? 'new' : ''}`}
            style={{ left: `${d.x}%`, top: `${d.y}%`, fontSize: `${d.size}cqw` }}
          >
            {u.emoji}
          </span>
        )),
      )}
    </div>
  )
}
