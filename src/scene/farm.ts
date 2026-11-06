import { Application, Assets, Container, Graphics, Sprite, Text, Texture, type FederatedPointerEvent } from 'pixi.js'
import { sfx } from '../game/sound'
import { CROP_IMAGES, POND_COST, PRODUCE, canFeed, cropImage, cropOf, stageOf, fieldOf, isRipe, nextField, tileKey, type Farm, type PlaceId, type Plot, type TileAction, type TileFx } from '../game/farm'

export interface FarmFigure {
  image?: string
  emoji: string
}

export interface FarmSceneOptions {
  /** Cô chú nông dân */
  farmers: FarmFigure[]
  onStrokeStart: () => void
  /** Dùng công cụ đang chọn lên ô; null = ô này không làm gì được */
  onTile: (key: string) => TileFx | null
  onStrokeEnd: () => void
  /** Bé chạm vào một chỗ trên bản đồ */
  onPlace: (place: PlaceId) => void
  /** Câu cô chú nói khi rảnh; null = nói chuyện phiếm */
  chatter: () => string | null
}

const EMOJI_FONT = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif"
const TEXT_FONT = `'Baloo 2', system-ui, ${EMOJI_FONT}`

/** Nửa bề ngang / nửa bề cao một ô đất nhìn chéo (px thế giới) */
const HW = 40
const HH = 20
/** Đảo vuông ISLAND × ISLAND ô */
const ISLAND = 14
/** Hình cây vẽ cỡ ~200px: thu lại cho cây kết trái nằm gọn trong một ô đất */
const CROP_ART_SCALE = 0.28
/** Bề dày mép đảo */
const DEPTH = 28
/** Ô (0, 0) của ruộng nằm ở ô này của đảo; ruộng rộng nhất 5×5 */
const FIELD_AT = 5
const FIELD_MAX = 5
/** Số ô ruộng vừa khít bề ngang khung nhìn (bé hơn thì thấy nhiều đảo hơn, ô nhỏ đi) */
const FIT_TILES = 5
/** Luống đất nhô lên khỏi mặt cỏ */
const BED = 5
/** Chiều cao cô chú nông dân (px thế giới) */
const FARMER_H = 74
/** Chạm rồi kéo quá chừng này px thì là kéo bản đồ, không phải chạm */
const TAP_SLOP = 8

const SMALL_TALK = ['Trời đẹp quá!', 'Cây lớn nhanh ghê!', 'Ruộng mình đẹp ghê!', 'Làm nông vui ghê!']

/** Máy bật giảm chuyển động: bỏ bớt hiệu ứng trang trí */
const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const easeOut = (p: number) => 1 - (1 - p) ** 3
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)]
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

interface Pt {
  x: number
  y: number
}

/** Ô (cx, cy) của đảo → toạ độ thế giới (góc trên của ô) */
const iso = (cx: number, cy: number): Pt => ({ x: (cx - cy) * HW, y: (cx + cy) * HH })
const fromIso = (p: Pt) => ({ cx: (p.x / HW + p.y / HH) / 2, cy: (p.y / HH - p.x / HW) / 2 })
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const up = (p: Pt, h: number): Pt => ({ x: p.x, y: p.y - h })
const flat = (pts: Pt[]) => pts.flatMap((p) => [p.x, p.y])

/** Bốn góc mặt đất của vùng w × d ô: trên, phải, dưới, trái */
function corners(cx: number, cy: number, w: number, d: number) {
  return { A: iso(cx, cy), B: iso(cx + w, cy), C: iso(cx + w, cy + d), D: iso(cx, cy + d) }
}

/** Hình công trình, cây, hàng rào: cắt từ bộ nhavacaycoi.png */
const farmArt = (name: string) => `/img/farm/${name}.webp`

/** Hình (hoặc emoji dự phòng) */
type Art = Sprite | Text

/** Điểm (u, v) tính theo tỉ lệ 0–1 trên khung hình, ra toạ độ của container chứa hình */
const artPoint = (s: Art, u: number, v: number): Pt => ({ x: s.x + (u - s.anchor.x) * s.width, y: s.y + (v - s.anchor.y) * s.height })

interface Tween {
  elapsed: number
  dur: number
  step: (p: number) => void
  done?: () => void
}

interface Particle {
  node: Container
  vx: number
  vy: number
  life: number
  max: number
  spin: number
  gravity: number
}

interface CropNode {
  root: Container
  /** Khung chứa hình cây: nhún, lắc lư ở đây để không đụng tới tỉ lệ của hình */
  fig: Container
  /** Hình cây theo giai đoạn; chưa tải được hình thì dùng emoji */
  art: Sprite | Text
  dots: Graphics
  need: Text
  plot: Plot
  /** Độ lớn đang hiển thị (trượt mượt tới độ lớn thật) */
  grow: number
  phase: number
}

interface Place {
  id: PlaceId
  cx: number
  cy: number
  w: number
  d: number
  label: string
  soon?: boolean
  art: string
  /** Bề ngang hình (px thế giới) */
  width: number
  /** Thiếu hình thì dùng emoji này */
  emoji: string
}

/** Bố cục đảo: các công trình quanh ruộng (ruộng ở ô 5–9) */
const PLACES: Place[] = [
  { id: 'house', cx: 1.2, cy: 1.2, w: 2.6, d: 2.6, label: '🏡 Nhà', art: 'house', width: 230, emoji: '🏡' },
  { id: 'coop', cx: 6.2, cy: 1.1, w: 1.9, d: 1.7, label: '🐔 Chuồng gà', art: 'coop', width: 150, emoji: '🐔' },
  { id: 'fish', cx: 10, cy: 0.8, w: 3.2, d: 3, label: '🎣 Ao cá', art: 'pond', width: 270, emoji: '🎣' },
  { id: 'gold', cx: 0.8, cy: 10.6, w: 3, d: 2.8, label: '⛏️ Mỏ vàng', art: 'mine', width: 250, emoji: '⛏️' },
  { id: 'shop', cx: 11.2, cy: 11.2, w: 1.8, d: 1.8, label: '🛒 Sạp hàng', art: 'stall', width: 160, emoji: '🛒' },
]

/** Hình ao lúc chưa đào: bãi đất có khóa */
const POND_LOCKED = 'pond-locked'

/** Cây cối, hoa cỏ trang trí: [cx, cy, hình, chiều cao px; emoji dự phòng] */
const TREE_EMOJI: Record<string, string> = {
  'tree-round': '🌳', 'tree-blossom': '🌳', 'tree-pine': '🌲', sunflower: '🌻', tulip: '🌷', 'grass-tuft': '🌿',
}
const TREES: [number, number, string, number][] = [
  [0.5, 5.6, 'tree-round', 92],
  [0.6, 7.6, 'tree-pine', 88],
  [0.4, 9.3, 'tree-blossom', 80],
  [13.4, 5.6, 'tree-round', 90],
  [13.3, 8.2, 'tree-pine', 92],
  [13.5, 9.9, 'tree-blossom', 74],
  [5.6, 13.3, 'tree-round', 86],
  [7.8, 13.4, 'tree-pine', 80],
  [9.6, 13.2, 'tree-blossom', 78],
  [4.6, 0.5, 'tree-pine', 78],
  [9.2, 0.4, 'tree-round', 72],
  [0.4, 0.4, 'tree-blossom', 74],
  [4.4, 3.2, 'sunflower', 40],
  [3.2, 5.4, 'tulip', 32],
  [11.4, 5.2, 'grass-tuft', 28],
  [11.6, 8.8, 'tulip', 32],
  [4.3, 11.6, 'grass-tuft', 28],
  [8.3, 11.6, 'sunflower', 40],
]

const ART_FILES = [...new Set([...PLACES.map((p) => p.art), POND_LOCKED, ...TREES.map((t) => t[2]), 'fence', 'fence-corner'])].map(farmArt)

/** Đường đất: vòng quanh ruộng và lối rẽ tới các công trình */
function pathCells(): [number, number][] {
  const cells: [number, number][] = []
  for (let i = 4; i <= 10; i++) cells.push([i, 4], [i, 10], [4, i], [10, i])
  for (let i = 1; i < 4; i++) cells.push([i, 4], [i, 10])
  cells.push([6, 3], [7, 3], [10, 3], [11, 10], [10, 11])
  return cells
}

/** Cô chú nông dân: root đặt ở chân, body nhún nhảy theo bước */
class FarmerNode {
  root = new Container()
  body = new Container()
  fig: Sprite | Text
  tool: Text
  bubble = new Container()
  bubbleBg = new Graphics()
  bubbleText: Text
  top: number
  target: Pt = { x: 0, y: 0 }
  phase: 'idle' | 'walk' | 'work' = 'idle'
  until = 0
  /** Đồ nghề sẽ dùng khi đi tới nơi */
  then = '💧'
  /** Bé nhờ thì chạy nhanh, tự đi làm thì đi thong thả */
  hurry = false
  sayUntil = 0
  step = Math.random() * Math.PI
  hop = 0

  constructor(f: FarmFigure) {
    if (f.image) {
      const s = new Sprite(Texture.from(f.image))
      s.anchor.set(0.5, 1)
      s.scale.set(FARMER_H / s.texture.height)
      this.fig = s
    } else {
      const t = new Text({ text: f.emoji, style: { fontFamily: EMOJI_FONT, fontSize: FARMER_H * 0.6 } })
      t.anchor.set(0.5, 0.95)
      this.fig = t
    }
    this.top = -this.fig.height
    this.tool = new Text({ text: '', style: { fontFamily: EMOJI_FONT, fontSize: 22 }, resolution: 2 })
    this.tool.anchor.set(0.5, 0.8)
    this.tool.position.set(this.fig.width * 0.42, this.top * 0.42)
    this.bubbleText = new Text({
      text: '',
      style: { fontFamily: TEXT_FONT, fontSize: 13, fontWeight: '700', fill: 0x3b2a1a, wordWrap: true, wordWrapWidth: 130, align: 'center' },
      resolution: 2,
    })
    this.bubbleText.anchor.set(0.5, 1)
    this.bubble.addChild(this.bubbleBg, this.bubbleText)
    this.bubble.visible = false
    this.body.addChild(this.fig, this.tool)
    this.root.addChild(this.body, this.bubble)
  }

  say(text: string, until: number) {
    this.bubbleText.text = text
    const w = this.bubbleText.width + 16
    const h = this.bubbleText.height + 8
    const y = this.top - 8
    this.bubbleText.position.set(0, y - 4)
    this.bubbleBg
      .clear()
      .roundRect(-w / 2, y - h, w, h, 10)
      .fill(0xffffff)
      .stroke({ width: 1.5, color: 0xe7d3b5 })
      .poly([-5, y, 5, y, 0, y + 7])
      .fill(0xffffff)
    this.bubble.visible = true
    this.sayUntil = until
  }
}

/** Nông trại nhìn chéo từ trên xuống, vẽ bằng PixiJS */
export class FarmScene {
  /** false nếu máy không dựng được cảnh (không WebGL/canvas) hoặc cảnh đã bị hủy */
  readonly ready: Promise<boolean>
  private app = new Application()
  private alive = true
  private inited = false
  private observer?: ResizeObserver

  private W = 0
  private H = 0
  private time = 0
  private zoom = 1
  private cam: Pt = iso(FIELD_AT + 2.5, FIELD_AT + 2.5)
  private camVel: Pt = { x: 0, y: 0 }

  private tweens: Tween[] = []
  private particles: Particle[] = []

  private world = new Container()
  private ground = new Graphics()
  private fieldG = new Graphics()
  private objects = new Container()
  private fxLayer = new Container()
  private sky = new Container()

  private farm?: Farm
  private runs = 0
  private crops = new Map<string, CropNode>()
  private farmers: FarmerNode[] = []
  private chickens: { node: Text; target: Pt; until: number; peck: number }[] = []
  private trees: { node: Art; phase: number }[] = []
  private placeNodes = new Map<PlaceId, Container>()
  private stallGoods?: Text
  private signs = new Map<PlaceId, Container>()
  /** Đã tải được bộ hình cây */
  private cropArt = false
  /** Đã tải được bộ hình công trình, cây cối */
  private farmArt = false
  private pondArt?: Art
  /** Tâm và bán kính mặt nước ao */
  private pondCenter: Pt = { x: 0, y: 0 }
  private pondR: Pt = { x: 0, y: 0 }
  /** Vùng lấp lánh vàng ở mỏ: góc trên-trái và cỡ */
  private mineArea = { x: 0, y: 0, w: 0, h: 0 }
  private chimney: Pt = { x: 0, y: 0 }
  private timers = { ripple: 0, fish: 2500, gold: 600, smoke: 0 }
  private clouds: { g: Graphics; speed: number }[] = []

  /** Ngón tay đang chạm: kéo bản đồ hoặc kéo qua ruộng */
  private drag?: { id: number; mode: 'pan' | 'stroke'; start: Pt; cam: Pt; last: Pt; lastT: number; moved: boolean; touched: Set<string> }

  constructor(
    private host: HTMLElement,
    private opts: FarmSceneOptions,
  ) {
    this.ready = this.init().catch(() => false)
  }

  // ---------- Điều khiển từ React ----------

  /** Cập nhật ruộng theo hồ sơ của bé */
  setFarm(farm: Farm, runs: number) {
    const grew = this.farm !== undefined && farm.size > this.farm.size
    const dug = this.farm !== undefined && !this.farm.pond && !!farm.pond
    this.farm = farm
    this.runs = runs
    if (!this.inited) return
    this.drawField()
    this.syncCrops()
    this.syncStall()
    this.syncPond()
    if (grew) this.celebrateExpand()
    if (dug) this.celebratePond()
  }

  destroy() {
    if (!this.alive) return
    this.alive = false
    this.observer?.disconnect()
    if (this.inited) this.app.destroy({ removeView: true }, { children: true })
  }

  // ---------- Dựng cảnh ----------

  private async init(): Promise<boolean> {
    const { host, opts } = this
    await this.app.init({
      width: host.clientWidth || 320,
      height: host.clientHeight || 320,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: ['webgl', 'canvas'],
    })
    await Assets.load(opts.farmers.flatMap((f) => (f.image ? [f.image] : [])))
    // Thiếu hình thì vẫn chơi được bằng emoji
    const [cropArt, farmArt] = await Promise.all(
      [CROP_IMAGES, ART_FILES].map((list) =>
        Assets.load(list).then(
          () => true,
          () => false,
        ),
      ),
    )
    this.cropArt = cropArt
    this.farmArt = farmArt
    this.inited = true
    if (!this.alive) {
      this.app.destroy({ removeView: true }, { children: true })
      return false
    }

    const canvas = this.app.canvas
    canvas.style.display = 'block'
    // Kéo trên cảnh là kéo bản đồ / gieo hạt, không cuộn trang
    canvas.style.touchAction = 'none'
    host.appendChild(canvas)

    this.objects.sortableChildren = true
    this.world.addChild(this.ground, this.fieldG, this.objects, this.fxLayer)
    this.app.stage.addChild(this.world, this.sky)

    this.drawIsland()
    this.buildPlaces()
    this.buildTrees()
    this.buildFence()
    this.buildChickens()
    this.buildFarmers()
    this.buildClouds()
    if (this.farm) this.setFarm(this.farm, this.runs)

    const stage = this.app.stage
    stage.eventMode = 'static'
    stage.hitArea = this.app.screen
    stage.on('pointerdown', (e) => this.onDown(e))
    stage.on('globalpointermove', (e) => this.onMove(e))
    stage.on('pointerup', (e) => this.onUp(e))
    stage.on('pointerupoutside', (e) => this.onUp(e))

    this.layout()
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(host)
    this.app.ticker.add((t) => this.update(t.deltaMS))
    return true
  }

  private resize() {
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    if (!this.alive || !w || !h || (w === this.W && h === this.H)) return
    this.app.renderer.resize(w, h)
    this.layout()
  }

  private layout() {
    this.W = this.host.clientWidth || this.app.screen.width
    this.H = this.host.clientHeight || this.app.screen.height
    // Ruộng FIT_TILES ô vừa khít bề ngang khung: ô vẫn đủ to cho ngón tay bé, phần còn lại kéo bản đồ để xem
    this.zoom = clamp((this.W - 24) / (2 * FIT_TILES * HW), 0.6, 1.4)
    this.world.scale.set(this.zoom)
    this.moveCamera(this.cam)
    for (const c of this.clouds) c.g.y = Math.min(c.g.y, this.H * 0.3)
  }

  /** Giữ khung nhìn trong phạm vi đảo */
  private moveCamera(p: Pt) {
    const vw = this.W / this.zoom / 2
    const vh = this.H / this.zoom / 2
    const span = (lo: number, hi: number, half: number, v: number) => (hi - lo < half * 2 ? (lo + hi) / 2 : clamp(v, lo + half, hi - half))
    this.cam = {
      x: span(-ISLAND * HW - 30, ISLAND * HW + 30, vw, p.x),
      y: span(-170, 2 * ISLAND * HH + DEPTH + 30, vh, p.y),
    }
    this.world.position.set(this.W / 2 - this.cam.x * this.zoom, this.H / 2 - this.cam.y * this.zoom)
  }

  private drawIsland() {
    const g = this.ground
    const { A, B, C, D } = corners(0, 0, ISLAND, ISLAND)
    const down = (p: Pt) => up(p, -DEPTH)
    // Bóng đảo và mép đất
    g.ellipse(C.x, C.y + DEPTH + 10, ISLAND * HW * 0.9, 26).fill({ color: 0x2d5f86, alpha: 0.18 })
    g.poly(flat([D, C, down(C), down(D)])).fill(0xa8713f)
    g.poly(flat([C, B, down(B), down(C)])).fill(0x8a5a30)
    g.poly(flat([D, C, up(C, -7), up(D, -7)])).fill(0x5fa043)
    g.poly(flat([C, B, up(B, -7), up(C, -7)])).fill(0x4f8c37)
    for (let i = 1; i < 4; i++) {
      const t = i / 4
      g.poly(flat([lerp(D, C, t), lerp(D, C, t + 0.02), down(lerp(D, C, t + 0.02)), down(lerp(D, C, t))])).fill({ color: 0x8a5a30, alpha: 0.4 })
    }
    // Mặt cỏ kẻ ô nhạt
    g.poly(flat([A, B, C, D])).fill(0x8fd16a)
    for (let cx = 0; cx < ISLAND; cx++)
      for (let cy = 0; cy < ISLAND; cy++)
        if ((cx + cy) % 2) {
          const q = corners(cx, cy, 1, 1)
          g.poly(flat([q.A, q.B, q.C, q.D])).fill({ color: 0x7fc45a, alpha: 0.35 })
        }
    // Đường đất
    for (const [cx, cy] of pathCells()) {
      const q = corners(cx + 0.04, cy + 0.04, 0.92, 0.92)
      g.poly(flat([q.A, q.B, q.C, q.D])).fill(0xe6cc95)
    }
    // Vài khóm cỏ
    for (let i = 0; i < 40; i++) {
      const p = iso(rand(0.3, ISLAND - 0.3), rand(0.3, ISLAND - 0.3))
      g.ellipse(p.x, p.y, rand(3, 6), rand(1.5, 3)).fill({ color: 0x5fa043, alpha: 0.5 })
    }
  }

  /** Hình vẽ sẵn, bề ngang `width`, neo ở giữa mặt đất dưới chân; thiếu hình thì dùng emoji */
  private art(name: string, emoji: string, width: number, anchorY?: number): Art {
    if (!this.farmArt) {
      const t = new Text({ text: emoji, style: { fontFamily: EMOJI_FONT, fontSize: width * 0.45 }, resolution: 2 })
      t.anchor.set(0.5, anchorY ?? 0.8)
      return t
    }
    const s = new Sprite()
    this.setArt(s, name, width, anchorY)
    return s
  }

  /** Đổi hình của sprite, giữ bề ngang; mặc định neo ở tâm mặt đất (đáy hình nhìn chéo 2:1 dày 1/4 bề ngang) */
  private setArt(s: Sprite, name: string, width: number, anchorY?: number) {
    s.texture = Texture.from(farmArt(name))
    const { width: w, height: h } = s.texture
    s.anchor.set(0.5, anchorY ?? 1 - w / 4 / h)
    s.scale.set(width / w)
  }

  private buildPlaces() {
    for (const p of PLACES) {
      const c = new Container()
      const base = iso(p.cx + p.w / 2, p.cy + p.d / 2)
      c.zIndex = base.y
      const s = this.art(p.art, p.emoji, p.width)
      s.position.set(base.x, base.y)
      c.addChild(s)
      switch (p.id) {
        case 'house':
          this.chimney = artPoint(s, 0.72, 0.1)
          break
        case 'fish':
          this.pondArt = s
          this.pondCenter = artPoint(s, 0.4, 0.52)
          this.pondR = { x: s.width * 0.2, y: s.height * 0.13 }
          break
        case 'gold': {
          const a = artPoint(s, 0.2, 0.35)
          this.mineArea = { ...a, w: s.width * 0.6, h: s.height * 0.45 }
          break
        }
        case 'shop': {
          // Hàng trên quầy: lấy từ kho nông sản, bày ở mặt trước quầy
          const goods = new Text({ text: '🧺', style: { fontFamily: EMOJI_FONT, fontSize: 16 }, resolution: 2 })
          goods.anchor.set(0.5)
          const at = artPoint(s, 0.45, 0.76)
          goods.position.set(at.x, at.y)
          c.addChild(goods)
          this.stallGoods = goods
          break
        }
      }
      const sign = this.sign(p.label, base.x, artPoint(s, 0.5, 0).y - 4, p.soon ? 'Sắp có' : undefined)
      c.addChild(sign)
      this.signs.set(p.id, sign)
      this.objects.addChild(c)
      this.placeNodes.set(p.id, c)
    }
  }

  /** Bảng tên trên một chỗ; `badge`: dòng nhỏ màu xám bên dưới, vd "Sắp có" */
  private sign(label: string, x: number, y: number, badge?: string) {
    const c = new Container()
    const t = new Text({ text: label, style: { fontFamily: TEXT_FONT, fontSize: 14, fontWeight: '800', fill: 0x3b2a1a }, resolution: 2 })
    t.anchor.set(0.5)
    const w = t.width + 18
    const bg = new Graphics()
      .roundRect(-w / 2, -13, w, 26, 13)
      .fill({ color: 0xffffff, alpha: 0.92 })
      .stroke({ width: 2, color: 0xc48a52 })
    c.addChild(bg, t)
    if (badge) {
      const s = new Text({ text: badge, style: { fontFamily: TEXT_FONT, fontSize: 11, fontWeight: '800', fill: 0xffffff }, resolution: 2 })
      s.anchor.set(0.5)
      s.position.set(0, 20)
      const sw = s.width + 12
      c.addChild(new Graphics().roundRect(-sw / 2, 12, sw, 16, 8).fill(0x9e9e9e), s)
    }
    c.position.set(x, y)
    return c
  }

  private buildTrees() {
    for (const [cx, cy, name, height] of TREES) {
      // Hình cây cao gấp rưỡi bề ngang: đổi chiều cao ra bề ngang
      const t = this.art(name, TREE_EMOJI[name], height * 0.75, 0.94)
      if (t instanceof Sprite) t.scale.set(height / t.texture.height)
      const p = iso(cx, cy)
      t.position.set(p.x, p.y)
      t.zIndex = p.y
      this.objects.addChild(t)
      if (height > 60) this.trees.push({ node: t, phase: rand(0, 6) })
    }
  }

  /** Hàng rào gỗ hai cạnh sau của ruộng: góc ở đỉnh sau, các tấm nối dọc hai cạnh */
  private buildFence() {
    if (!this.farmArt) return
    const a = iso(FIELD_AT - 0.2, FIELD_AT - 0.2)
    const b = iso(FIELD_AT + FIELD_MAX + 0.2, FIELD_AT - 0.2)
    const d = iso(FIELD_AT - 0.2, FIELD_AT + FIELD_MAX + 0.2)
    // Hình tấm rào chạy chéo lên bên phải (cạnh a→d); cạnh a→b thì lật ngang.
    // Hình dốc ~0.28, cạnh ruộng dốc 0.5: nghiêng thanh ngang cho khớp, cột rào vẫn đứng thẳng
    const panels = 3
    const tilt = 0.21
    for (const [to, flip] of [
      [d, 1],
      [b, -1],
    ] as const) {
      for (let i = 0; i < panels; i++) {
        const t0 = 0.12 + (0.88 * i) / panels
        const t1 = 0.12 + (0.88 * (i + 1)) / panels
        const mid = lerp(a, to, (t0 + t1) / 2)
        const s = new Sprite()
        // Chân tấm rào ở giữa đáy hình; nối chồng một chút để không hở
        this.setArt(s, 'fence', Math.abs(to.x - a.x) * (t1 - t0) * 1.2, 0.83)
        s.scale.x *= flip
        s.skew.y = -tilt * flip
        s.position.set(mid.x, mid.y)
        s.zIndex = a.y
        this.objects.addChild(s)
      }
    }
    const corner = new Sprite()
    this.setArt(corner, 'fence-corner', 2 * HW * 1.3, 0.71)
    corner.anchor.x = 0.48
    corner.position.set(a.x, a.y)
    corner.zIndex = a.y
    this.objects.addChild(corner)
  }

  private buildChickens() {
    const coop = PLACES.find((p) => p.id === 'coop')!
    for (const emoji of ['🐔', '🐔', '🐤']) {
      const t = new Text({ text: emoji, style: { fontFamily: EMOJI_FONT, fontSize: emoji === '🐤' ? 18 : 24 }, resolution: 2 })
      t.anchor.set(0.5, 0.9)
      const p = iso(coop.cx + rand(0.5, 2.6), coop.cy + coop.d + rand(0.2, 1.4))
      t.position.set(p.x, p.y)
      this.objects.addChild(t)
      this.chickens.push({ node: t, target: p, until: rand(0, 2000), peck: 0 })
    }
  }

  private buildFarmers() {
    this.opts.farmers.forEach((f, i) => {
      const n = new FarmerNode(f)
      const p = iso(FIELD_AT - 0.6 + i * 3, FIELD_AT - 0.6 + (1 - i) * 3)
      n.root.position.set(p.x, p.y)
      n.target = p
      n.until = 800 + i * 1500
      this.objects.addChild(n.root)
      this.farmers.push(n)
    })
  }

  private buildClouds() {
    for (let i = 0; i < 3; i++) {
      const g = new Graphics().circle(0, 0, 14).circle(16, -6, 18).circle(34, 0, 13).fill({ color: 0xffffff, alpha: 0.85 })
      g.position.set(rand(0, this.host.clientWidth || 320), rand(10, 50))
      g.scale.set(rand(0.6, 1))
      this.sky.addChild(g)
      this.clouds.push({ g, speed: rand(4, 9) })
    }
  }

  // ---------- Ruộng ----------

  private tileCell(key: string) {
    const [r, c] = key.split('-').map(Number)
    return { cx: FIELD_AT + c, cy: FIELD_AT + r }
  }

  private tileCenter(key: string): Pt {
    const { cx, cy } = this.tileCell(key)
    return up(iso(cx + 0.5, cy + 0.5), BED)
  }

  private drawField() {
    const farm = this.farm
    if (!farm) return
    const g = this.fieldG.clear()
    const { rows, cols } = fieldOf(farm)
    const next = nextField(farm)
    // Phần đất sẽ mở rộng: viền mờ để bé thấy ruộng còn lớn được
    if (next)
      for (let r = 0; r < next.rows; r++)
        for (let c = 0; c < next.cols; c++) {
          if (r < rows && c < cols) continue
          const q = corners(FIELD_AT + c + 0.06, FIELD_AT + r + 0.06, 0.88, 0.88)
          g.poly(flat([q.A, q.B, q.C, q.D])).fill({ color: 0xffffff, alpha: 0.18 }).stroke({ width: 1.5, color: 0xffffff, alpha: 0.55 })
        }
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const p = farm.tiles[tileKey(r, c)]
        const { A, B, C, D } = corners(FIELD_AT + c + 0.05, FIELD_AT + r + 0.05, 0.9, 0.9)
        const [a, b, cc, d] = [A, B, C, D].map((x) => up(x, BED))
        const soil = p ? 0x7a4622 : 0x9b6334
        g.poly(flat([D, C, cc, d])).fill(p ? 0x5e3518 : 0x7a4a24)
        g.poly(flat([C, B, b, cc])).fill(p ? 0x4e2c13 : 0x67401e)
        g.poly(flat([a, b, cc, d])).fill(soil)
        for (const t of [0.25, 0.5, 0.75]) {
          const s = lerp(a, d, t)
          const e = lerp(b, cc, t)
          g.moveTo(s.x, s.y).lineTo(e.x, e.y)
        }
        g.stroke({ width: 2, color: p ? 0x5a3317 : 0x7d4c25, alpha: 0.8 })
        if (p && isRipe(p)) g.poly(flat([a, b, cc, d])).stroke({ width: 3, color: 0xffd54f })
      }
  }

  private syncCrops() {
    const farm = this.farm!
    const { rows, cols } = fieldOf(farm)
    const seen = new Set<string>()
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const key = tileKey(r, c)
        const p = farm.tiles[key]
        if (!p) continue
        seen.add(key)
        let n = this.crops.get(key)
        if (!n) {
          n = this.makeCrop(key, p)
          this.crops.set(key, n)
        } else if (n.plot.fed !== p.fed || n.plot.crop !== p.crop) {
          // Vừa bón: cây nhún lên
          this.tween(450, (q) => n!.fig.scale.set(1 + 0.35 * Math.sin(q * Math.PI)))
        }
        n.plot = p
        this.styleCrop(n)
      }
    for (const [key, n] of this.crops) {
      if (seen.has(key)) continue
      this.crops.delete(key)
      this.tween(
        300,
        (q) => {
          n.root.scale.set(1 + 0.4 * q)
          n.root.alpha = 1 - q
        },
        () => n.root.destroy({ children: true }),
      )
    }
  }

  private makeCrop(key: string, p: Plot): CropNode {
    const root = new Container()
    const fig = new Container()
    const art = this.cropArt ? new Sprite() : new Text({ text: '🌱', style: { fontFamily: EMOJI_FONT, fontSize: 40 }, resolution: 2 })
    // Gốc cây (giữa ụ đất dưới đáy hình) đặt vào giữa ô
    art.anchor.set(0.5, this.cropArt ? 0.93 : 0.88)
    fig.addChild(art)
    const dots = new Graphics()
    const need = new Text({ text: '✨', style: { fontFamily: EMOJI_FONT, fontSize: 16 }, resolution: 2 })
    need.anchor.set(0.5)
    need.position.set(22, -26)
    root.addChild(fig, dots, need)
    const at = this.tileCenter(key)
    root.position.set(at.x, at.y + 6)
    root.zIndex = at.y
    this.objects.addChild(root)
    const n: CropNode = { root, fig, art, dots, need, plot: p, grow: 0.1, phase: rand(0, 6) }
    return n
  }

  private styleCrop(n: CropNode) {
    const c = cropOf(n.plot.crop)
    const ripe = isRipe(n.plot)
    if (n.art instanceof Sprite) {
      n.art.texture = Texture.from(cropImage(c.id, stageOf(n.plot)))
      // Cùng một tỉ lệ cho mọi hình: cây non tự nhỏ hơn cây kết trái
      n.art.scale.set(CROP_ART_SCALE)
    } else n.art.text = ripe ? c.emoji : n.plot.fed === 0 ? '🌱' : '🌿'
    n.need.visible = canFeed(n.plot, this.runs)
    const g = n.dots.clear()
    if (!ripe) {
      const w = c.feeds * 9
      for (let i = 0; i < c.feeds; i++) g.circle(-w / 2 + 4.5 + i * 9, 10, 3.2).fill(i < n.plot.fed ? 0x8dff7a : { color: 0xffffff, alpha: 0.5 })
    }
  }

  /** Độ lớn cây theo số lần bón: mầm nhỏ → cây chín to */
  private targetGrow(p: Plot) {
    // Có hình theo giai đoạn thì chỉ lớn nhẹ trong mỗi giai đoạn
    if (this.cropArt) return isRipe(p) ? 1 : 0.85 + (0.15 * p.fed) / cropOf(p.crop).feeds
    return isRipe(p) ? 1 : 0.45 + (0.35 * p.fed) / cropOf(p.crop).feeds
  }

  private syncStall() {
    if (!this.stallGoods || !this.farm) return
    const goods = PRODUCE.filter((c) => (this.farm!.stock[c.id] ?? 0) > 0).map((c) => c.emoji)
    this.stallGoods.text = goods.length ? goods.slice(0, 4).join('') : '🧺'
  }

  /** Chưa đào ao: bãi đất có khóa và bảng ghi giá mở; đào rồi thì thành ao */
  private syncPond() {
    const old = this.signs.get('fish')
    const node = this.placeNodes.get('fish')
    if (!old || !node || !this.farm) return
    const p = PLACES.find((x) => x.id === 'fish')!
    if (this.pondArt instanceof Sprite) this.setArt(this.pondArt, this.farm.pond ? p.art : POND_LOCKED, p.width)
    const sign = this.sign(p.label, old.x, old.y, this.farm.pond ? undefined : `🔒 ${POND_COST} xu`)
    old.destroy({ children: true })
    node.addChild(sign)
    this.signs.set('fish', sign)
  }

  /** Chỗ cô chú đứng câu: bờ trước của ao */
  private pondSpot(): Pt {
    return this.pondArt ? artPoint(this.pondArt, 0.36, 0.92) : this.pondCenter
  }

  private celebratePond() {
    sfx.win()
    const c = this.pondCenter
    for (let i = 0; i < 4; i++) this.wait(i * 150, () => this.sparkle(c.x + rand(-70, 70), c.y + rand(-30, 30), 10))
    this.wait(300, () => this.fishJump())
    const from = this.cam
    this.tween(700, (p) => this.moveCamera(lerp(from, c, easeOut(p))))
  }

  private celebrateExpand() {
    sfx.win()
    const f = fieldOf(this.farm!)
    const center = iso(FIELD_AT + f.cols / 2, FIELD_AT + f.rows / 2)
    for (let i = 0; i < 4; i++) this.wait(i * 120, () => this.sparkle(center.x + rand(-90, 90), center.y + rand(-40, 40), 10))
    const from = this.cam
    this.tween(700, (p) => this.moveCamera(lerp(from, center, easeOut(p))))
  }

  /** Ô ruộng (hoặc ô sắp mở rộng) dưới điểm chạm trên màn hình */
  private tileAt(screen: Pt): { key: string; locked: boolean } | null {
    if (!this.farm) return null
    const w = { x: (screen.x - this.world.x) / this.zoom, y: (screen.y - this.world.y) / this.zoom + BED }
    const { cx, cy } = fromIso(w)
    const c = Math.floor(cx) - FIELD_AT
    const r = Math.floor(cy) - FIELD_AT
    const { rows, cols } = fieldOf(this.farm)
    if (r >= 0 && c >= 0 && r < rows && c < cols) return { key: tileKey(r, c), locked: false }
    const next = nextField(this.farm)
    if (next && r >= 0 && c >= 0 && r < next.rows && c < next.cols) return { key: tileKey(r, c), locked: true }
    return null
  }

  // ---------- Chạm và kéo ----------

  private onDown(e: FederatedPointerEvent) {
    if (this.drag) return
    const p = { x: e.global.x, y: e.global.y }
    const hit = this.tileAt(p)
    const stroke = hit !== null && !hit.locked
    this.drag = { id: e.pointerId, mode: stroke ? 'stroke' : 'pan', start: p, cam: this.cam, last: p, lastT: this.time, moved: false, touched: new Set() }
    this.camVel = { x: 0, y: 0 }
    if (hit && !hit.locked) {
      this.opts.onStrokeStart()
      this.strokeAt(hit.key)
    }
  }

  private onMove(e: FederatedPointerEvent) {
    const d = this.drag
    if (!d || e.pointerId !== d.id) return
    const p = { x: e.global.x, y: e.global.y }
    if (Math.hypot(p.x - d.start.x, p.y - d.start.y) > TAP_SLOP) d.moved = true
    if (d.mode === 'stroke') {
      const hit = this.tileAt(p)
      if (hit && !hit.locked) this.strokeAt(hit.key)
    } else if (d.moved) {
      const dt = Math.max(1, this.time - d.lastT)
      this.camVel = { x: (-(p.x - d.last.x) / this.zoom / dt) * 16, y: (-(p.y - d.last.y) / this.zoom / dt) * 16 }
      this.moveCamera({ x: d.cam.x - (p.x - d.start.x) / this.zoom, y: d.cam.y - (p.y - d.start.y) / this.zoom })
    }
    d.last = p
    d.lastT = this.time
  }

  private onUp(e: FederatedPointerEvent) {
    const d = this.drag
    if (!d || e.pointerId !== d.id) return
    this.drag = undefined
    if (d.mode === 'stroke') this.opts.onStrokeEnd()
    else if (!d.moved) this.tap(d.start)
  }

  private strokeAt(key: string) {
    const d = this.drag
    if (!d || d.touched.has(key)) return
    d.touched.add(key)
    const fx = this.opts.onTile(key)
    if (!fx) return
    const at = this.tileCenter(key)
    this.floatText(fx.label, at.x, at.y - 30, fx.action === 'harvest' ? 0xfff3b0 : 0xffffff)
    this.sparkle(at.x, at.y - 10, fx.action === 'harvest' ? 10 : 5)
    if (fx.action === 'plant') this.dust(at)
    this.callFarmer(key, fx.action)
  }

  /** Chạm (không kéo) lên bản đồ */
  private tap(screen: Pt) {
    const hit = this.tileAt(screen)
    if (hit?.locked) {
      this.opts.onPlace('expand')
      return
    }
    for (const c of this.chickens) {
      const b = c.node.getBounds()
      if (screen.x >= b.minX && screen.x <= b.maxX && screen.y >= b.minY && screen.y <= b.maxY) {
        sfx.pop()
        this.popEmoji('💛', c.node.x, c.node.y - 30, 18)
        this.tween(380, (p) => (c.node.y = c.target.y - Math.sin(p * Math.PI) * 12))
        return
      }
    }
    for (const f of this.farmers) {
      const b = f.fig.getBounds()
      if (screen.x >= b.minX && screen.x <= b.maxX && screen.y >= b.minY && screen.y <= b.maxY) {
        sfx.pop()
        this.tween(380, (p) => (f.hop = Math.sin(p * Math.PI) * 14))
        f.say(pick(['Chào con!', 'Cố lên con nhé!', 'Con giỏi quá!']), this.time + 2500)
        return
      }
    }
    // Công trình phía trước (gần màn hình hơn) được chọn trước
    const places = [...this.placeNodes].sort((a, b) => b[1].zIndex - a[1].zIndex)
    for (const [id, node] of places) {
      const b = node.getBounds()
      if (screen.x < b.minX || screen.x > b.maxX || screen.y < b.minY || screen.y > b.maxY) continue
      sfx.tap()
      this.bounce(node)
      this.opts.onPlace(id)
      return
    }
  }

  /** Công trình nảy nhẹ khi chạm: phồng quanh chân */
  private bounce(node: Container) {
    const b = node.getLocalBounds()
    const pivot = { x: (b.minX + b.maxX) / 2, y: b.maxY }
    node.pivot.set(pivot.x, pivot.y)
    node.position.set(pivot.x, pivot.y)
    this.tween(
      360,
      (p) => node.scale.set(1 + 0.06 * Math.sin(p * Math.PI), 1 - 0.04 * Math.sin(p * Math.PI)),
      () => node.scale.set(1),
    )
  }

  // ---------- Cô chú nông dân ----------

  /** Bé vừa làm ở ô `key`: người đứng gần nhất chạy tới phụ */
  private callFarmer(key: string, action: TileAction) {
    const to = this.spotNear(key)
    const tool = action === 'plant' ? '🌱' : action === 'feed' ? '✨' : '🧺'
    const near = this.farmers.reduce<FarmerNode | undefined>(
      (best, f) => (!best || Math.hypot(f.root.x - to.x, f.root.y - to.y) < Math.hypot(best.root.x - to.x, best.root.y - to.y) ? f : best),
      undefined,
    )
    if (near) this.walkTo(near, to, tool, true)
  }

  /** Chỗ đứng cạnh ô: chân hơi lệch xuống dưới ô để không che cây */
  private spotNear(key: string): Pt {
    const { cx, cy } = this.tileCell(key)
    return iso(cx + 0.9, cy + 0.75)
  }

  private walkTo(f: FarmerNode, to: Pt, then: string, hurry = false) {
    f.target = to
    f.phase = 'walk'
    f.then = then
    f.hurry = hurry
    f.tool.text = ''
    if (Math.abs(to.x - f.root.x) > 2) f.fig.scale.x = Math.abs(f.fig.scale.x) * (to.x < f.root.x ? -1 : 1)
  }

  private idleTarget(f: FarmerNode): { at: Pt; tool: string } {
    const farm = this.farm
    const keys = farm ? Object.keys(farm.tiles) : []
    const roll = Math.random()
    if (keys.length && roll < 0.55) return { at: this.spotNear(pick(keys)), tool: pick(['💧', '💧', '🪱']) }
    if (roll < 0.7) {
      const coop = PLACES.find((p) => p.id === 'coop')!
      return { at: iso(coop.cx + rand(0.4, 2.4), coop.cy + coop.d + rand(0.4, 1.3)), tool: '🌾' }
    }
    if (roll < 0.82) return { at: this.pondSpot(), tool: '🎣' }
    if (farm) {
      const { rows, cols } = fieldOf(farm)
      return { at: this.spotNear(tileKey(Math.floor(rand(0, rows)), Math.floor(rand(0, cols)))), tool: '🪱' }
    }
    return { at: f.root.position.clone(), tool: '💧' }
  }

  private updateFarmers(dt: number) {
    for (const f of this.farmers) {
      if (f.bubble.visible && this.time > f.sayUntil) f.bubble.visible = false
      const r = f.root
      if (f.phase === 'walk') {
        const dx = f.target.x - r.x
        const dy = f.target.y - r.y
        const dist = Math.hypot(dx, dy)
        const speed = (f.hurry ? 120 : 55) * (dt / 1000)
        if (dist <= speed) {
          r.position.set(f.target.x, f.target.y)
          f.phase = 'work'
          f.tool.text = f.then
          f.until = this.time + 1500
        } else {
          r.x += (dx / dist) * speed
          r.y += (dy / dist) * speed
          f.step += dt * 0.012
        }
      } else if (this.time >= f.until) {
        if (f.phase === 'work') {
          f.phase = 'idle'
          f.tool.text = ''
          f.until = this.time + (calm ? Infinity : rand(1500, 4000))
          if (Math.random() < 0.35) f.say(this.opts.chatter() ?? pick(SMALL_TALK), this.time + 3000)
        } else {
          const t = this.idleTarget(f)
          this.walkTo(f, t.at, t.tool)
        }
      }
      const walking = f.phase === 'walk'
      const working = f.phase === 'work'
      f.body.y = (walking ? -Math.abs(Math.sin(f.step)) * 4 : 0) - f.hop
      f.body.rotation = walking ? Math.sin(f.step) * 0.06 : working ? Math.sin(this.time * 0.012) * 0.05 : 0
      f.tool.rotation = working ? Math.sin(this.time * 0.014) * 0.5 : 0
      r.zIndex = r.y + 1
    }
  }

  // ---------- Vòng lặp ----------

  private update(dtRaw: number) {
    const dt = Math.min(dtRaw, 50)
    this.time += dt

    const running = this.tweens
    this.tweens = []
    for (const t of running) {
      t.elapsed += dt
      const p = Math.min(1, t.elapsed / t.dur)
      t.step(p)
      if (p < 1) this.tweens.push(t)
      else t.done?.()
    }

    this.particles = this.particles.filter((p) => {
      p.life += dt
      if (p.life >= p.max) {
        p.node.destroy()
        return false
      }
      const s = dt / 1000
      p.vy += p.gravity * s
      p.node.x += p.vx * s
      p.node.y += p.vy * s
      p.node.rotation += p.spin * s
      p.node.alpha = 1 - (p.life / p.max) ** 2
      return true
    })

    // Thả tay sau khi kéo: bản đồ trôi thêm một chút
    if (!this.drag && (Math.abs(this.camVel.x) > 0.01 || Math.abs(this.camVel.y) > 0.01)) {
      this.moveCamera({ x: this.cam.x + (this.camVel.x * dt) / 16, y: this.cam.y + (this.camVel.y * dt) / 16 })
      const k = Math.pow(0.9, dt / 16)
      this.camVel = { x: this.camVel.x * k, y: this.camVel.y * k }
    }

    for (const n of this.crops.values()) {
      const target = this.targetGrow(n.plot)
      n.grow += (target - n.grow) * Math.min(1, dt / 180)
      const ripe = isRipe(n.plot)
      n.fig.y = ripe && !calm ? -Math.abs(Math.sin(this.time * 0.004 + n.phase)) * 4 : 0
      n.fig.rotation = calm ? 0 : Math.sin(this.time * 0.002 + n.phase) * (ripe ? 0.08 : 0.04)
      n.root.scale.set(n.grow)
      n.need.y = -26 - (calm ? 0 : Math.abs(Math.sin(this.time * 0.005 + n.phase)) * 4)
    }

    this.updateFarmers(dt)
    if (!calm) this.updateLife(dt)
  }

  /** Mây trôi, cây đung đưa, gà đi lại, cá nhảy, khói bếp */
  private updateLife(dt: number) {
    for (const c of this.clouds) {
      c.g.x += (c.speed * dt) / 1000
      if (c.g.x > this.W + 20) c.g.x = -70
    }
    for (const t of this.trees) t.node.rotation = Math.sin(this.time * 0.0012 + t.phase) * 0.03

    for (const c of this.chickens) {
      const n = c.node
      if (this.time >= c.until) {
        const coop = PLACES.find((p) => p.id === 'coop')!
        c.target = iso(coop.cx + rand(0.3, 2.8), coop.cy + coop.d + rand(0.1, 1.5))
        c.until = this.time + rand(2500, 5000)
        c.peck = rand(0, 1) < 0.5 ? 900 : 0
      }
      const dx = c.target.x - n.x
      const dy = c.target.y - n.y
      const dist = Math.hypot(dx, dy)
      if (c.peck > 0) {
        c.peck -= dt
        n.rotation = Math.sin(this.time * 0.03) * 0.25
      } else if (dist > 1) {
        const s = Math.min(dist, (28 * dt) / 1000)
        n.x += (dx / dist) * s
        n.y += (dy / dist) * s
        n.scale.x = dx > 0 ? -1 : 1
        n.rotation = Math.sin(this.time * 0.02) * 0.08
      } else n.rotation = 0
      n.zIndex = n.y
    }

    const t = this.timers
    t.ripple -= dt
    if (t.ripple <= 0) {
      t.ripple = rand(700, 1400)
      const p = this.pondCenter
      const r = this.pondR
      if (this.farm?.pond) this.ripple(p.x + rand(-0.8, 0.8) * r.x, p.y + rand(-0.6, 0.6) * r.y)
    }
    t.fish -= dt
    if (t.fish <= 0) {
      t.fish = rand(3000, 6000)
      // Ao chưa đào thì chưa có cá
      if (this.farm?.pond) this.fishJump()
    }
    t.gold -= dt
    if (t.gold <= 0) {
      t.gold = rand(500, 1100)
      const m = this.mineArea
      this.twinkle(m.x + rand(0, m.w), m.y + rand(0, m.h))
    }
    t.smoke -= dt
    if (t.smoke <= 0) {
      t.smoke = 700
      this.smoke()
    }
  }

  // ---------- Hiệu ứng ----------

  private tween(dur: number, step: (p: number) => void, done?: () => void) {
    this.tweens.push({ elapsed: 0, dur, step, done })
  }

  private wait(ms: number, done: () => void) {
    this.tween(ms, () => {}, done)
  }

  private sparkle(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const g = new Graphics().star(0, 0, 4, rand(4, 7), rand(1.5, 2.5)).fill(pick([0xffd54f, 0xffffff, 0xff8a65, 0x81d4fa]))
      g.position.set(x, y)
      const a = rand(0, Math.PI * 2)
      const speed = rand(40, 130)
      this.fxLayer.addChild(g)
      this.particles.push({ node: g, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 60, life: 0, max: rand(500, 800), spin: rand(-6, 6), gravity: 220 })
    }
  }

  /** Bụi đất tung lên khi gieo hạt */
  private dust(at: Pt) {
    for (let i = 0; i < 6; i++) {
      const g = new Graphics().circle(0, 0, rand(2, 4)).fill({ color: 0xc9a275, alpha: 0.8 })
      g.position.set(at.x + rand(-10, 10), at.y)
      this.fxLayer.addChild(g)
      this.particles.push({ node: g, vx: rand(-40, 40), vy: rand(-60, -20), life: 0, max: 500, spin: 0, gravity: 160 })
    }
  }

  private twinkle(x: number, y: number) {
    const g = new Graphics().star(0, 0, 4, 6, 2).fill(0xffe082)
    g.position.set(x, y)
    this.fxLayer.addChild(g)
    this.particles.push({ node: g, vx: 0, vy: -6, life: 0, max: 700, spin: 3, gravity: 0 })
  }

  private ripple(x: number, y: number) {
    const g = new Graphics()
    g.position.set(x, y)
    // Vẽ trong khối ao để gợn nằm trên mặt nước, dưới con cá
    this.placeNodes.get('fish')?.addChild(g)
    this.tween(
      1400,
      (p) => {
        g.clear()
          .ellipse(0, 0, 6 + 22 * p, 3 + 10 * p)
          .stroke({ width: 1.5, color: 0xffffff, alpha: 0.7 * (1 - p) })
      },
      () => g.destroy(),
    )
  }

  private fishJump() {
    const c = this.pondCenter
    const x0 = c.x + rand(-0.7, 0.2) * this.pondR.x
    const y0 = c.y + rand(-0.4, 0.4) * this.pondR.y
    const fish = new Text({ text: '🐟', style: { fontFamily: EMOJI_FONT, fontSize: 20 }, resolution: 2 })
    fish.anchor.set(0.5)
    fish.zIndex = (this.placeNodes.get('fish')?.zIndex ?? c.y) + 1
    this.objects.addChild(fish)
    this.ripple(x0, y0)
    this.tween(
      900,
      (p) => {
        fish.position.set(x0 + 36 * p, y0 - Math.sin(p * Math.PI) * 36)
        fish.rotation = -0.9 + 1.8 * p
      },
      () => {
        this.ripple(x0 + 36, y0)
        fish.destroy()
      },
    )
  }

  private smoke() {
    const g = new Graphics().circle(0, 0, rand(5, 8)).fill({ color: 0xffffff, alpha: 0.75 })
    g.position.set(this.chimney.x, this.chimney.y)
    this.fxLayer.addChild(g)
    this.particles.push({ node: g, vx: rand(4, 12), vy: rand(-26, -18), life: 0, max: 2200, spin: 0, gravity: 0 })
  }

  private floatText(text: string, x: number, y: number, fill: number) {
    const t = new Text({
      text,
      style: { fontFamily: TEXT_FONT, fontSize: 20, fontWeight: '800', fill, stroke: { color: 0x5d3a1a, width: 4 } },
      resolution: 2,
    })
    t.anchor.set(0.5)
    t.position.set(x, y)
    this.fxLayer.addChild(t)
    this.tween(
      900,
      (p) => {
        t.y = y - 34 * easeOut(p)
        t.alpha = 1 - p * p
      },
      () => t.destroy(),
    )
  }

  private popEmoji(emoji: string, x: number, y: number, size: number) {
    const t = new Text({ text: emoji, style: { fontFamily: EMOJI_FONT, fontSize: size }, resolution: 2 })
    t.anchor.set(0.5)
    t.position.set(x, y)
    this.fxLayer.addChild(t)
    this.tween(
      800,
      (p) => {
        t.scale.set(p < 0.25 ? 1.2 * easeOut(p / 0.25) : 1.2 - 0.2 * Math.min(1, (p - 0.25) / 0.2))
        t.y = y - 14 * p
        t.alpha = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1
      },
      () => t.destroy(),
    )
  }
}
