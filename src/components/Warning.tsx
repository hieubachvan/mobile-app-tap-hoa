import { useEffect, useState } from 'react'
import { sfx, speak } from '../game/sound'

let show: ((text: string) => void) | null = null

/** Trên điện thoại, nhấc tay khỏi ruộng xong trình duyệt bắn thêm một cú click vào đúng chỗ đó: bỏ qua để cảnh báo không tắt ngay */
const IGNORE_TAP_MS = 500

/** Báo bé thao tác không làm được (thiếu xu, chưa đủ điều kiện): bảng cảnh báo nổi bật, kêu và đọc to */
export function warn(text: string) {
  sfx.wrong()
  speak(text)
  show?.(text)
}

/** Đặt một lần ở gốc app để `warn()` hiện được ở mọi màn */
export function WarningHost() {
  const [w, setW] = useState<{ text: string; id: number } | null>(null)

  useEffect(() => {
    show = (text) => setW({ text, id: Date.now() })
    return () => {
      show = null
    }
  }, [])

  useEffect(() => {
    if (!w) return
    const t = window.setTimeout(() => setW(null), 4000)
    return () => window.clearTimeout(t)
  }, [w])

  if (!w) return null
  return (
    <div className="warn-backdrop" onClick={() => Date.now() - w.id > IGNORE_TAP_MS && setW(null)}>
      {/* key: cảnh báo mới thì rung lại từ đầu */}
      <div key={w.id} className="warn-card" role="alert">
        <div className="warn-icon">⚠️</div>
        <p>{w.text}</p>
        <button className="btn btn-gold">Đã hiểu</button>
      </div>
    </div>
  )
}
