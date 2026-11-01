/** Bảng hiệu "Tiệm Tạp Hóa <tên bé>"; tên dài thì chữ nhỏ lại cho vừa */
export default function ShopSign({ name, big }: { name: string; big?: boolean }) {
  const shown = name.trim() || 'của Bé'
  const size = shown.length <= 8 ? 1 : shown.length <= 12 ? 0.8 : 0.66
  return (
    <div className={`sign ${big ? 'big' : ''}`}>
      <div className="sign-sub">Tiệm Tạp Hóa</div>
      <div className="sign-title" style={{ ['--scale' as string]: size }}>
        {shown}
      </div>
    </div>
  )
}
