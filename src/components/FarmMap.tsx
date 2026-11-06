import { useEffect, useRef, useState } from 'react'
import type { PlaceId } from '../game/farm'
import type { FarmScene } from '../scene/farm'
import FarmField, { FARMERS, type FarmFieldProps } from './FarmField'

interface Props extends FarmFieldProps {
  onPlace: (place: PlaceId) => void
}

/** Bản đồ nông trại nhìn chéo (PixiJS, tải riêng để không làm chậm lúc mở app) */
export default function FarmMap(props: Props) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<FarmScene | null>(null)
  // Cảnh giữ hàm gọi lại lúc tạo: luôn chuyển tới props mới nhất
  const latest = useRef(props)
  latest.current = props
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let created: FarmScene | null = null
    import('../scene/farm')
      .then(async ({ FarmScene }) => {
        if (cancelled) return
        created = new FarmScene(host.current!, {
          farmers: FARMERS.map((f) => ({ image: f.image, emoji: '🧑‍🌾' })),
          onStrokeStart: () => latest.current.onStrokeStart(),
          onTile: (key) => latest.current.onTile(key),
          onStrokeEnd: () => latest.current.onStrokeEnd(),
          onPlace: (place) => latest.current.onPlace(place),
          chatter: () => latest.current.chatter(),
        })
        const ok = await created.ready
        if (cancelled) return
        if (!ok) return setFailed(true)
        scene.current = created
        created.setFarm(latest.current.farm, latest.current.runs)
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      scene.current = null
      created?.destroy()
    }
  }, [])

  useEffect(() => {
    scene.current?.setFarm(props.farm, props.runs)
  }, [props.farm, props.runs])

  if (failed) return <FarmField {...props} />
  return <div className="farm-map" ref={host} />
}
