export interface Item {
  emoji: string
  /** Đơn vị + tên, vd "quả táo" — chữ đầu là đơn vị đếm */
  name: string
  /** Id món nâng cấp tiệm cần có để bán mặt hàng này; không có = bán từ đầu */
  pack?: string
}

export const ITEMS: Item[] = [
  { emoji: '🍬', name: 'viên kẹo' },
  { emoji: '🍭', name: 'cây kẹo mút' },
  { emoji: '🍪', name: 'cái bánh quy' },
  { emoji: '🥚', name: 'quả trứng' },
  { emoji: '🍞', name: 'ổ bánh mì' },
  { emoji: '🍎', name: 'quả táo' },
  { emoji: '🍌', name: 'quả chuối' },
  { emoji: '🍜', name: 'gói mì' },
  { emoji: '🥕', name: 'củ cà rốt' },
  { emoji: '🧼', name: 'cục xà phòng' },
  { emoji: '🍦', name: 'cây kem', pack: 'fridge' },
  { emoji: '🥛', name: 'hộp sữa', pack: 'fridge' },
  { emoji: '🧃', name: 'hộp nước trái cây', pack: 'fridge' },
  { emoji: '✏️', name: 'cây bút chì', pack: 'stationery' },
  { emoji: '📒', name: 'cuốn vở', pack: 'stationery' },
  { emoji: '🖍️', name: 'cây bút sáp', pack: 'stationery' },
  { emoji: '🍉', name: 'quả dưa hấu', pack: 'fruit' },
  { emoji: '🍊', name: 'quả cam', pack: 'fruit' },
  { emoji: '🍇', name: 'chùm nho', pack: 'fruit' },
  { emoji: '🎈', name: 'quả bóng bay', pack: 'toys' },
  { emoji: '🧸', name: 'con gấu bông', pack: 'toys' },
  { emoji: '🪀', name: 'cái yo-yo', pack: 'toys' },
]

export const itemsFor = (owned: string[]) => ITEMS.filter((i) => !i.pack || owned.includes(i.pack))

export const unitOf = (item: Item) => item.name.split(' ')[0]
export const nounOf = (item: Item) => item.name.split(' ').slice(1).join(' ')

export interface Customer {
  emoji: string
  /** Cách khách tự xưng, vd "Bà", "Chú" */
  title: string
  /** Hệ số kiên nhẫn: > 1 chờ lâu, < 1 vội */
  patience: number
  /** Hình vẽ nhân vật trong public/img; chưa có thì dùng emoji */
  image?: string
}

export const CUSTOMERS: Customer[] = [
  { emoji: '👵', title: 'Bà', patience: 1.5, image: '/img/balao.webp' },
  { emoji: '👴', title: 'Ông', patience: 1.4, image: '/img/onglao.webp' },
  { emoji: '🧑‍🌾', title: 'Bác nông dân', patience: 1.2 },
  { emoji: '👩', title: 'Cô', patience: 1 },
  { emoji: '👨', title: 'Chú', patience: 1 },
  { emoji: '👮', title: 'Chú công an', patience: 0.9 },
  { emoji: '👧', title: 'Bé Na', patience: 0.8 },
  { emoji: '👩‍🍳', title: 'Cô đầu bếp', patience: 0.75 },
  { emoji: '👦', title: 'Bé Bin', patience: 0.7 },
]

export function patienceLabel(c: Customer) {
  if (c.patience >= 1.3) return '🐢 Thong thả'
  if (c.patience <= 0.8) return '🐇 Vội vàng'
  return null
}
