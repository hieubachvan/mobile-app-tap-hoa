import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { ShopLevel } from '../game/shopLevels'
import { UPGRADES } from '../game/upgrades'
import { CUSTOMERS, patienceLabel, type Customer } from '../game/items'
import type { Street } from '../scene/street'
import ShopDecor from './ShopDecor'

export interface StreetHandle {
  /** Khách đi vào quầy; onArrive chạy khi khách đứng tới quầy */
  enter: (c: Customer, onArrive: () => void) => void
  react: (kind: 'ok' | 'bad') => void
  leave: (kind: 'happy' | 'angry', coins?: number) => void
}

interface Props {
  mode: 'home' | 'shop'
  level: ShopLevel
  owned: string[]
  /** Kéo cửa cuốn lúc mở tiệm */
  opening?: boolean
  /** Độ kiên nhẫn 0–1 của khách đang đứng quầy, đọc mỗi khung hình */
  getPatience?: () => number
}

/** failed: máy không dựng được cảnh, dùng hình tĩnh; gone: cảnh đã bị hủy */
type Loaded = Street | 'failed' | 'gone'

const walkers = CUSTOMERS.map((c) => ({ image: c.image, emoji: c.emoji }))

/** Cảnh phố trước tiệm (PixiJS, tải riêng để không làm chậm lúc mở app) */
export default forwardRef<StreetHandle, Props>(function StreetScene({ mode, level, owned, opening, getPatience }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const street = useRef<Promise<Loaded>>(Promise.resolve('gone'))
  const patience = useRef(getPatience)
  patience.current = getPatience
  const [failed, setFailed] = useState(false)
  const ownedKey = owned.join(',')

  useEffect(() => {
    let cancelled = false
    let created: Street | null = null
    const decor = UPGRADES.filter((u) => owned.includes(u.id)).flatMap((u) =>
      u.decor.map((d) => ({ id: u.id, emoji: u.emoji, ...d })),
    )
    const loading: Promise<Loaded> = import('../scene/street')
      .then(async ({ Street }) => {
        if (cancelled) return 'gone' as const
        created = new Street(host.current!, {
          mode,
          shop: { image: level.image, ratio: level.ratio, decor },
          walkers,
          opening,
          getPatience: () => patience.current?.() ?? 1,
        })
        const ok = await created.ready
        if (cancelled) return 'gone' as const
        if (!ok) {
          setFailed(true)
          return 'failed' as const
        }
        return created
      })
      .catch(() => {
        if (cancelled) return 'gone' as const
        setFailed(true)
        return 'failed' as const
      })
    street.current = loading
    return () => {
      cancelled = true
      created?.destroy()
    }
  }, [mode, level.image, ownedKey])

  useImperativeHandle(
    ref,
    () => ({
      enter: (c, onArrive) =>
        void street.current.then((s) => {
          if (s === 'failed') onArrive()
          else if (s !== 'gone') s.enter({ image: c.image, emoji: c.emoji, trait: patienceLabel(c) }, onArrive)
        }),
      react: (kind) => void street.current.then((s) => typeof s === 'object' && s.react(kind)),
      leave: (kind, coins) => void street.current.then((s) => typeof s === 'object' && s.leave(kind, coins)),
    }),
    [],
  )

  return (
    <div className={`street ${mode}`} ref={host}>
      {failed && (
        <div className="street-fallback">
          <ShopDecor level={level} owned={owned} />
        </div>
      )}
    </div>
  )
})
