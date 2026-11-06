import { Application, Assets, Container, Graphics, Sprite, Text, Texture, type FederatedPointerEvent } from 'pixi.js'
import { sfx } from '../game/sound'

export interface Figure {
  /** Hình vẽ nhân vật; chưa có thì dùng emoji */
  image?: string
  emoji: string
}

export interface SceneCustomer extends Figure {
  /** Nhãn tính cách, vd "🐢 Thong thả" */
  trait?: string | null
}

export interface SceneDecor {
  id: string
  emoji: string
  /** Vị trí và cỡ theo % ảnh mặt tiền, giống ShopDecor */
  x: number
  y: number
  size: number
}

export interface SceneShop {
  image: string
  ratio: number
  decor: SceneDecor[]
}

/** Một loại hàng trên kệ sạp chợ */
export interface MarketSlot {
  emoji: string
  count: number
  price: number
}

export interface StreetOptions {
  /** home: tiệm mở sẵn, người qua đường ghé mua; shop: có khách vào quầy */
  mode: 'home' | 'shop'
  /** Mặt tiền tiệm phố; bỏ trống khi dùng sạp chợ */
  shop?: SceneShop
  /** Sạp kệ hàng nông sản giữa đồng quê thay cho tiệm phố */
  market?: MarketSlot[]
  /** Người qua đường (dùng lại hình khách) */
  walkers: Figure[]
  /** Kéo cửa cuốn lên rồi mới đón khách */
  opening?: boolean
  /** Độ kiên nhẫn 0–1 của khách đang đứng quầy */
  getPatience?: () => number
}

const EMOJI_FONT = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif"
const TEXT_FONT = `'Baloo 2', system-ui, ${EMOJI_FONT}`
/** Bề cao vỉa hè (px) */
const SIDEWALK = 40
/** Thú cưng emoji mặc định quay mặt sang trái */
const ANIMALS: Figure[] = [{ emoji: '🐕' }, { emoji: '🐈' }]
const BUILDING_COLORS = [0xffe3c2, 0xd7ecff, 0xffd6e0, 0xe2f5d3, 0xfff1b8]
/** Sạp chợ: tỉ lệ ngang/cao của khung sạp */
const STALL_RATIO = 1.25
/** Hình nhân vật xuất cùng tỉ lệ, người cao nhất cao chừng này px: hình thấp hơn thì vẽ thấp hơn tương ứng */
const CHARACTER_PX = 320

/** Máy bật giảm chuyển động: bỏ người qua đường và hiệu ứng trang trí */
const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const easeOut = (p: number) => 1 - (1 - p) ** 3
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)]
const sameFigure = (a?: Figure, b?: Figure) => !!a && !!b && a.image === b.image && a.emoji === b.emoji

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

/** Nhân vật đi bộ: root đặt ở chân, body nhún nhảy và lắc lư theo bước */
class Walker {
  root = new Container()
  body = new Container()
  fig: Sprite | Text
  baseWidth: number
  /** Đỉnh đầu, tính từ chân (số âm) */
  top: number
  phase = Math.random() * Math.PI
  /** Độ nảy lên (px) do hiệu ứng nhảy */
  hop = 0
  shakeX = 0

  constructor(
    public figure: Figure,
    public height: number,
  ) {
    if (figure.image) {
      const s = new Sprite(Texture.from(figure.image))
      s.anchor.set(0.5, 1)
      s.scale.set(height / Math.max(s.texture.height, CHARACTER_PX))
      this.fig = s
    } else {
      // Emoji người là hình bán thân, bè ngang: để nhỏ hơn hình vẽ cho cân
      const t = new Text({ text: figure.emoji, style: { fontFamily: EMOJI_FONT, fontSize: height * 0.5 } })
      t.anchor.set(0.5, 0.9)
      this.fig = t
    }
    this.baseWidth = this.fig.width
    this.top = -this.fig.height * this.fig.anchor.y
    this.body.addChild(this.fig)
    this.root.addChild(this.body)
  }

  walk(dt: number, pace: number) {
    this.phase += dt * pace
    this.pose(-Math.abs(Math.sin(this.phase)) * this.height * 0.05, Math.sin(this.phase) * 0.07)
  }

  stand(bounce: number) {
    this.pose(-bounce, 0)
  }

  private pose(y: number, rotation: number) {
    this.body.position.set(this.shakeX, y - this.hop)
    this.body.rotation = rotation
  }
}

interface Passerby {
  w: Walker
  dir: 1 | -1
  speed: number
  pace: number
  /** Ghé vào tiệm khi đi tới vị trí này */
  stopAt?: number
  state: 'walk' | 'inside' | 'gone'
}

interface Guest {
  w: Walker
  state: 'in' | 'stand' | 'out'
  leaving: boolean
  bar: Graphics
  mood: Text
  trait?: Text
  /** Độ kiên nhẫn đang hiển thị (trượt mượt về giá trị thật) */
  shown: number
  drawn: number
}

interface DecorNode {
  node: Text
  d: SceneDecor
  i: number
  baseY: number
  wiggle: number
}

/** Cảnh phố trước tiệm tạp hóa, vẽ bằng PixiJS */
export class Street {
  /** false nếu máy không dựng được cảnh (không WebGL/canvas) hoặc cảnh đã bị hủy */
  readonly ready: Promise<boolean>
  private app = new Application()
  private alive = true
  private inited = false
  private observer?: ResizeObserver
  private opened: Promise<void>

  private W = 0
  private H = 0
  private time = 0
  /** Chiều cao khách đứng quầy */
  private gh = 150
  private backY = 0
  private frontY = 0

  private tweens: Tween[] = []
  private particles: Particle[] = []
  private clouds: { g: Graphics; speed: number }[] = []

  private cloudLayer = new Container()
  private town = new Graphics()
  private ground = new Graphics()
  private shopLayer = new Container()
  private shutter = new Graphics()
  private backLayer = new Container()
  private frontLayer = new Container()
  private fxLayer = new Container()

  private shopSprite?: Sprite
  /** Sạp chợ: khung gỗ vẽ lại theo cỡ khung, hàng trên kệ vẽ lại khi bán bớt */
  private stall = new Graphics()
  private stallGoods = new Container()
  private shopRect = { x: 0, y: 0, w: 0, h: 0 }
  private decor: DecorNode[] = []
  private shutterP = 0
  private passersby: Passerby[] = []
  private spawnIn = 800
  private noteIn = 0
  private guests: Guest[] = []

  constructor(
    private host: HTMLElement,
    private opts: StreetOptions,
  ) {
    this.ready = this.init().catch(() => false)
    this.opened = this.ready.then((ok) => (ok && opts.opening ? this.openShutter() : undefined))
  }

  // ---------- Điều khiển từ màn chơi ----------

  /** Khách đi dọc vỉa hè vào quầy; gọi onArrive khi đứng tới quầy */
  enter(c: SceneCustomer, onArrive: () => void) {
    void this.opened.then(() => {
      if (!this.alive) return
      for (const g of this.guests) if (g.state === 'stand' && !g.leaving) this.walkOff(g, 1.4)

      const w = new Walker(c, this.gh)
      const bar = new Graphics()
      const mood = new Text({ text: '😊', style: { fontFamily: EMOJI_FONT, fontSize: 26 } })
      mood.anchor.set(0.5)
      const trait = c.trait
        ? new Text({
            text: c.trait,
            style: { fontFamily: TEXT_FONT, fontSize: 13, fontWeight: '800', fill: 0x5d4037, stroke: { color: 0xffffff, width: 4 } },
          })
        : undefined
      trait?.anchor.set(0.5, 1)
      w.root.addChild(bar, mood)
      if (trait) w.root.addChild(trait)

      const g: Guest = { w, state: 'in', leaving: false, bar, mood, trait, shown: 1, drawn: -1 }
      this.placeGuestUi(g)
      const from = -w.baseWidth
      w.root.position.set(from, this.frontY)
      this.frontLayer.addChild(w.root)
      this.guests.push(g)

      this.tween(
        calm ? 400 : 1700,
        (p) => (w.root.x = from + (this.counterX(g) - from) * (1 - (1 - p) ** 2)),
        () => {
          g.state = 'stand'
          sfx.bell()
          this.hop(w, 10)
          onArrive()
        },
      )
    })
  }

  /** Bé trả lời đúng / sai một câu */
  react(kind: 'ok' | 'bad') {
    const g = this.current()
    if (!g) return
    const head = this.headPos(g)
    if (kind === 'ok') {
      this.hop(g.w, 14)
      this.sparkle(head.x, head.y, 8)
    } else {
      this.shake(g.w)
      this.popEmoji('❓', head.x + 26, head.y - 6, 30)
    }
  }

  /** Khách mua xong (vui, trả xu) hoặc chờ lâu quá bỏ về */
  leave(kind: 'happy' | 'angry', coins = 0) {
    const g = this.current()
    if (!g) return
    g.leaving = true
    g.bar.visible = false
    if (g.trait) g.trait.visible = false
    const head = this.headPos(g)

    if (kind === 'happy') {
      g.mood.text = '😄'
      const bag = new Text({ text: '🛍️', style: { fontFamily: EMOJI_FONT, fontSize: this.gh * 0.22 } })
      bag.anchor.set(0.5)
      bag.position.set(g.w.baseWidth * 0.42, g.w.top * 0.32)
      g.w.body.addChild(bag)
      this.hop(g.w, 16)
      if (coins > 0) {
        this.flyCoins(head.x, head.y + 30, Math.min(coins, 8))
        this.floatText(`+${coins}`, head.x, head.y - 24)
      }
      this.wait(650, () => this.walkOff(g, 1))
    } else {
      g.mood.text = '😤'
      this.popEmoji('💢', head.x + 28, head.y + 4, 32)
      this.tween(700, (p) => (g.w.hop = Math.abs(Math.sin(p * Math.PI * 4)) * 5), () => (g.w.hop = 0))
      this.wait(800, () => this.walkOff(g, 1.6))
    }
  }

  /** Sạp chợ: cập nhật số hàng còn trên kệ */
  setGoods(goods: MarketSlot[]) {
    this.opts.market = goods
    if (this.inited && this.W) this.drawGoods()
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
      height: host.clientHeight || 240,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: ['webgl', 'canvas'],
    })
    await Assets.load([...(opts.shop ? [opts.shop.image] : []), ...opts.walkers.flatMap((w) => (w.image ? [w.image] : []))])
    this.inited = true
    if (!this.alive) {
      this.app.destroy({ removeView: true }, { children: true })
      return false
    }

    const canvas = this.app.canvas
    canvas.style.display = 'block'
    // Vuốt lên cảnh vẫn cuộn được trang
    canvas.style.touchAction = 'pan-y'
    this.app.renderer.events.autoPreventDefault = false
    host.appendChild(canvas)

    this.town.alpha = 0.8
    this.app.stage.addChild(
      this.cloudLayer,
      this.town,
      this.ground,
      this.shopLayer,
      this.backLayer,
      this.frontLayer,
      this.fxLayer,
    )

    for (let i = 0; i < 3; i++) {
      const g = new Graphics().circle(0, 0, 14).circle(16, -6, 18).circle(34, 0, 13).fill({ color: 0xffffff, alpha: 0.9 })
      g.position.set(rand(0, host.clientWidth), rand(14, 46))
      g.scale.set(rand(0.7, 1.1))
      this.cloudLayer.addChild(g)
      this.clouds.push({ g, speed: rand(4, 9) })
    }

    const tapShop = (e: FederatedPointerEvent) => {
      const p = e.getLocalPosition(this.fxLayer)
      this.sparkle(p.x, p.y, 6)
      sfx.pop()
    }
    if (opts.shop) {
      const shop = new Sprite(Texture.from(opts.shop.image))
      shop.anchor.set(0.5, 1)
      shop.eventMode = 'static'
      shop.on('pointertap', tapShop)
      this.shopSprite = shop
      this.shopLayer.addChild(shop)
    } else {
      this.stall.eventMode = 'static'
      this.stall.on('pointertap', tapShop)
      this.shopLayer.addChild(this.stall, this.stallGoods)
    }

    opts.shop?.decor.forEach((d, i) => {
      const node = new Text({ text: d.emoji, style: { fontFamily: EMOJI_FONT, fontSize: 20 } })
      node.anchor.set(0.5)
      node.eventMode = 'static'
      node.cursor = 'pointer'
      const item: DecorNode = { node, d, i, baseY: 0, wiggle: 0 }
      node.on('pointertap', () => {
        item.wiggle = 700
        sfx.pop()
      })
      this.decor.push(item)
      this.shopLayer.addChild(node)
    })
    this.shopLayer.addChild(this.shutter)

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
    const W = (this.W = this.host.clientWidth || this.app.screen.width)
    const H = (this.H = this.host.clientHeight || this.app.screen.height)
    const top = H - SIDEWALK
    this.backY = top + 14
    this.frontY = H - 3
    this.gh = Math.min(H * 0.64, 156)

    const market = !this.opts.shop
    // Phía sau: đồng quê cho sạp chợ, dãy nhà phố cho tiệm
    const town = this.town.clear()
    if (market) this.drawCountry(W, top)
    else for (let x = -10, k = 0; x < W; k++) {
      const bw = 50 + ((k * 37) % 40)
      const bh = top * (0.35 + ((k * 53) % 30) / 100)
      town.rect(x, top - bh, bw - 4, bh).fill(BUILDING_COLORS[k % BUILDING_COLORS.length])
      for (let wy = top - bh + 10; wy < top - 18; wy += 22)
        for (let wx = x + 8; wx < x + bw - 16; wx += 16) town.rect(wx, wy, 8, 10).fill({ color: 0xffffff, alpha: 0.7 })
      x += bw
    }

    // Mặt tiền: cao vừa khung, chừa chỗ bên phải cho khách đứng quầy
    const ratio = this.opts.shop?.ratio ?? STALL_RATIO
    let h = top - 6
    let w = h * ratio
    const maxW = W * (this.opts.mode === 'shop' ? 0.8 : 0.94)
    if (w > maxW) {
      w = maxW
      h = w / ratio
    }
    const cx = this.opts.mode === 'shop' ? Math.max(w / 2 + 6, (W - 60) / 2) : W / 2
    this.shopRect = { x: cx - w / 2, y: top + 4 - h, w, h }
    const shop = this.shopSprite
    if (shop) {
      shop.width = w
      shop.height = h
      shop.position.set(cx, top + 4)
    } else {
      this.drawStall()
      this.drawGoods()
    }

    for (const it of this.decor) {
      it.node.style.fontSize = Math.max(10, (it.d.size / 100) * w)
      it.baseY = this.shopRect.y + (it.d.y / 100) * h
      it.node.position.set(this.shopRect.x + (it.d.x / 100) * w, it.baseY)
    }

    // Vỉa hè và bóng tiệm
    const ground = this.ground.clear()
    if (market) {
      // Đường đất có cỏ hai bên
      ground.rect(0, top, W, SIDEWALK).fill(0xd9b98a)
      ground.rect(0, top, W, 4).fill(0x7cb85a)
      for (let x = 8; x < W; x += 26) ground.ellipse(x + ((x * 7) % 11), top + 12 + ((x * 13) % 17), 4, 2).fill({ color: 0xb8925f, alpha: 0.6 })
    } else {
      ground.rect(0, top, W, SIDEWALK).fill(0xe6c79c)
      ground.rect(0, top, W, 3).fill(0xc9a275)
      for (let x = 14; x < W; x += 30) ground.rect(x, top + 3, 2, SIDEWALK).fill({ color: 0xc9a275, alpha: 0.45 })
      ground.rect(0, top + SIDEWALK / 2, W, 1.5).fill({ color: 0xc9a275, alpha: 0.35 })
    }
    ground.ellipse(cx, top + 5, w * 0.48, 6).fill({ color: 0x5a3a1a, alpha: 0.18 })

    this.drawShutter()
    for (const g of this.guests) {
      g.drawn = -1
      this.placeGuestUi(g)
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

    if (!calm) {
      for (const c of this.clouds) {
        c.g.x += (c.speed * dt) / 1000
        if (c.g.x > this.W + 20) c.g.x = -70
      }
    }

    this.updateDecor(dt)
    this.updatePassersby(dt)
    this.updateGuests(dt)
  }

  private updateDecor(dt: number) {
    const t = this.time
    for (const it of this.decor) {
      let rotation = 0
      let scale = 1
      let alpha = 1
      let dy = 0
      if (!calm) {
        switch (it.d.id) {
          case 'lantern':
            rotation = Math.sin(t * 0.0022 + it.i) * 0.15
            break
          case 'plant':
            rotation = Math.sin(t * 0.0016) * 0.05
            break
          case 'cat': {
            // Mèo thần tài vẫy tay từng đợt
            const k = (t % 3600) / 3600
            rotation = k < 0.25 ? Math.sin((k / 0.25) * Math.PI * 4) * 0.22 : 0
            break
          }
          case 'fan':
            rotation = t * 0.002
            break
          case 'sign':
            alpha = 0.7 + 0.3 * Math.sin(t * 0.005 + it.i * 2)
            scale = 1 + 0.08 * Math.sin(t * 0.005 + it.i * 2)
            break
          case 'radio':
            scale = 1 + 0.07 * Math.abs(Math.sin(t * 0.007))
            break
          case 'toys': {
            const k = (t % 4200) / 4200
            dy = k < 0.12 ? -Math.sin((k / 0.12) * Math.PI) * it.node.height * 0.18 : 0
            break
          }
        }
      }
      // Bé chạm vào món đồ: lắc và phồng lên
      if (it.wiggle > 0) {
        it.wiggle = Math.max(0, it.wiggle - dt)
        const k = it.wiggle / 700
        rotation += Math.sin(it.wiggle * 0.04) * 0.35 * k
        scale += 0.25 * k
      }
      it.node.rotation = rotation
      it.node.scale.set(scale)
      it.node.alpha = alpha
      it.node.y = it.baseY + dy
    }

    const radio = this.decor.find((d) => d.d.id === 'radio')
    if (radio && !calm) {
      this.noteIn -= dt
      if (this.noteIn <= 0) {
        this.noteIn = 900
        this.note(radio.node.x, radio.node.y - radio.node.height / 2)
      }
    }
  }

  private updatePassersby(dt: number) {
    if (calm) return
    const home = this.opts.mode === 'home'
    this.spawnIn -= dt
    if (this.spawnIn <= 0) {
      if (this.passersby.length < (home ? 3 : 2)) this.spawnPasserby()
      this.spawnIn = home ? rand(1800, 4000) : rand(2800, 6000)
    }
    for (const p of this.passersby) {
      if (p.state !== 'walk') continue
      p.w.walk(dt, p.pace)
      p.w.root.x += (p.dir * p.speed * dt) / 1000
      p.w.root.y = this.backY
      if (p.stopAt !== undefined && (p.w.root.x - p.stopAt) * p.dir >= 0) this.visitShop(p)
      if (p.w.root.x < -90 || p.w.root.x > this.W + 90) p.state = 'gone'
    }
    this.passersby = this.passersby.filter((p) => {
      if (p.state !== 'gone') return true
      p.w.root.destroy({ children: true })
      return false
    })
  }

  private updateGuests(dt: number) {
    for (const g of this.guests) {
      g.w.root.y = this.frontY
      if (g.state === 'stand') {
        g.w.root.x = this.counterX(g)
        // Sắp hết kiên nhẫn thì nhún chân sốt ruột
        const restless = !g.leaving && g.shown < 0.3
        g.w.stand(Math.abs(Math.sin(this.time * (restless ? 0.014 : 0.0025))) * (restless ? 3 : 1.5))
      } else {
        g.w.walk(dt, 0.009)
      }
      if (!g.leaving) this.updatePatience(g, dt)
    }
  }

  private updatePatience(g: Guest, dt: number) {
    const target = Math.max(0, Math.min(1, this.opts.getPatience?.() ?? 1))
    g.shown += (target - g.shown) * Math.min(1, dt / 160)
    if (Math.abs(g.shown - g.drawn) > 0.003) {
      g.drawn = g.shown
      const bw = 84
      const x = -bw / 2
      const y = g.w.top - 16
      const fw = bw * g.shown
      const color = g.shown > 0.6 ? 0x66bb6a : g.shown > 0.3 ? 0xffa726 : 0xef5350
      g.bar.clear().roundRect(x, y, bw, 10, 5).fill(0xeadbc6).stroke({ width: 2, color: 0xffffff })
      if (fw >= 2) g.bar.roundRect(x, y, fw, 10, Math.min(5, fw / 2)).fill(color)
    }
    const mood = g.shown > 0.6 ? '😊' : g.shown > 0.3 ? '😐' : '😠'
    if (g.mood.text !== mood) {
      g.mood.text = mood
      this.tween(300, (p) => g.mood.scale.set(0.6 + 0.4 * easeOut(p)))
    }
  }

  // ---------- Khách và người qua đường ----------

  private current() {
    const g = this.guests[this.guests.length - 1]
    return g && g.state === 'stand' && !g.leaving ? g : undefined
  }

  private counterX(g: Guest) {
    return this.W - g.w.baseWidth / 2 - 12
  }

  private headPos(g: Guest) {
    return { x: g.w.root.x, y: g.w.root.y + g.w.top }
  }

  private placeGuestUi(g: Guest) {
    g.mood.position.set(Math.min(g.w.baseWidth * 0.42, 46), g.w.top + 8)
    g.trait?.position.set(0, g.w.top - 20)
  }

  private walkOff(g: Guest, speed: number) {
    g.state = 'out'
    g.leaving = true
    const from = g.w.root.x
    const to = this.W + g.w.baseWidth
    this.tween(
      (calm ? 300 : 1300) / speed,
      (p) => (g.w.root.x = from + (to - from) * p),
      () => {
        g.w.root.destroy({ children: true })
        this.guests = this.guests.filter((x) => x !== g)
      },
    )
  }

  private spawnPasserby() {
    const busy = this.guests.find((g) => !g.leaving)?.w.figure
    const people = this.opts.walkers.filter((f) => !sameFigure(f, busy))
    const animal = people.length === 0 || Math.random() < 0.2
    const w = new Walker(animal ? pick(ANIMALS) : pick(people), this.gh * (animal ? 0.34 : 0.5))
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1
    if (animal) w.fig.scale.x = dir > 0 ? -1 : 1
    w.root.position.set(dir > 0 ? -40 : this.W + 40, this.backY)
    w.root.alpha = 0.95
    w.fig.eventMode = 'static'
    w.fig.cursor = 'pointer'
    w.fig.on('pointertap', () => {
      this.hop(w, 12)
      sfx.pop()
    })
    const speed = animal ? rand(55, 80) : rand(28, 45)
    const r = this.shopRect
    const stopAt = this.opts.mode === 'home' && !animal && Math.random() < 0.45 ? r.x + r.w * rand(0.35, 0.65) : undefined
    this.backLayer.addChild(w.root)
    this.passersby.push({ w, dir, speed, pace: animal ? 0.0125 : 0.0075, stopAt, state: 'walk' })
  }

  /** Người qua đường ghé vào tiệm, lát sau xách túi đi ra */
  private visitShop(p: Passerby) {
    p.state = 'inside'
    p.stopAt = undefined
    const root = p.w.root
    const y0 = this.backY
    p.w.stand(0)
    this.tween(
      350,
      (q) => {
        root.alpha = 0.95 * (1 - q)
        root.y = y0 - 8 * q
        root.scale.set(1 - 0.1 * q)
      },
      () =>
        this.wait(rand(1800, 3500), () => {
          const bag = new Text({ text: '🛍️', style: { fontFamily: EMOJI_FONT, fontSize: p.w.height * 0.3 } })
          bag.anchor.set(0.5)
          bag.position.set(p.w.baseWidth * 0.42, p.w.top * 0.32)
          p.w.body.addChild(bag)
          this.sparkle(root.x, y0 + p.w.top * 0.6, 5)
          this.tween(
            350,
            (q) => {
              root.alpha = 0.95 * q
              root.y = y0 - 8 * (1 - q)
              root.scale.set(0.9 + 0.1 * q)
            },
            () => (p.state = 'walk'),
          )
        }),
    )
  }

  // ---------- Hiệu ứng ----------

  private tween(dur: number, step: (p: number) => void, done?: () => void) {
    this.tweens.push({ elapsed: 0, dur, step, done })
  }

  private wait(ms: number, done: () => void) {
    this.tween(ms, () => {}, done)
  }

  private hop(w: Walker, height: number) {
    this.tween(380, (p) => (w.hop = Math.sin(p * Math.PI) * height))
  }

  private shake(w: Walker) {
    this.tween(420, (p) => (w.shakeX = Math.sin(p * Math.PI * 6) * 7 * (1 - p)))
  }

  private openShutter(): Promise<void> {
    this.shutterP = 1
    this.drawShutter()
    return new Promise((resolve) => {
      this.wait(calm ? 100 : 500, () => {
        sfx.shutter()
        this.tween(
          calm ? 200 : 900,
          (p) => {
            this.shutterP = 1 - easeOut(p)
            this.drawShutter()
          },
          () => {
            const r = this.shopRect
            this.sparkle(r.x + r.w / 2, r.y + r.h * 0.15, 14)
            this.wait(250, resolve)
          },
        )
      })
    })
  }

  /** Cửa cuốn che lòng tiệm, shutterP = 1 là đóng kín */
  private drawShutter() {
    const g = this.shutter.clear()
    if (this.shutterP <= 0) return
    const r = this.shopRect
    const x = r.x + r.w * 0.13
    const y = r.y + r.h * 0.32
    const w = r.w * 0.74
    const h = r.h * 0.64 * this.shutterP
    g.rect(x, y, w, h).fill(0xb4bdca)
    for (let sy = y + 7; sy < y + h - 4; sy += 8) g.rect(x, sy, w, 1.5).fill(0x8b96a8)
    g.rect(x - 2, y + h - 6, w + 4, 6).fill(0x6b7586)
    g.roundRect(x + w / 2 - 10, y + h - 12, 20, 5, 2).fill(0x4f5866)
  }

  /** Phía sau sạp chợ: đồi, ruộng luống, nhà kho, cây và hàng rào */
  private drawCountry(W: number, top: number) {
    const g = this.town
    g.ellipse(W * 0.2, top + 10, W * 0.5, top * 0.6).fill(0xb9e4a0)
    g.ellipse(W * 0.85, top + 14, W * 0.55, top * 0.5).fill(0xa5d98a)
    const fy = top - top * 0.24
    g.rect(0, fy, W, top - fy).fill(0x9ccc65)
    for (let y = fy + 5, i = 0; y < top - 2; y += 8, i++) g.rect(0, y, W, 4).fill(i % 2 ? 0x8bc34a : 0x7cb342)
    const bx = W * 0.06
    const bw = 44
    const bh = 32
    g.rect(bx, fy - bh, bw, bh).fill(0xd84d3f)
    g.poly([bx - 4, fy - bh, bx + bw / 2, fy - bh - 20, bx + bw + 4, fy - bh]).fill(0x8d3a2f)
    g.rect(bx + bw / 2 - 8, fy - 18, 16, 18).fill(0xfff3d6)
    for (const [x, s] of [
      [W * 0.3, 1],
      [W * 0.62, 0.8],
      [W * 0.93, 1.1],
    ]) {
      g.rect(x - 3 * s, fy - 24 * s, 6 * s, 24 * s).fill(0x8b5a2b)
      g.circle(x, fy - 36 * s, 17 * s).fill(0x5fa043)
      g.circle(x - 9 * s, fy - 28 * s, 11 * s).fill(0x6fb24f)
    }
    for (let x = 4; x < W; x += 18) g.rect(x, top - 16, 4, 16).fill(0xc48a52)
    g.rect(0, top - 12, W, 3).fill(0xc48a52)
    g.rect(0, top - 6, W, 3).fill(0xc48a52)
  }

  /** Hai tầng kệ (đáy hàng) trong khung sạp */
  private shelfYs() {
    const { y, h } = this.shopRect
    return [y + h * 0.5, y + h * 0.79]
  }

  /** Khung sạp gỗ: cột, vách sau, kệ, quầy, mái bạt sọc */
  private drawStall() {
    const { x, y, w, h } = this.shopRect
    const g = this.stall.clear()
    const awn = h * 0.2
    g.rect(x + w * 0.04, y + awn * 0.5, w * 0.045, h - awn * 0.5).fill(0x8b5a2b)
    g.rect(x + w * 0.915, y + awn * 0.5, w * 0.045, h - awn * 0.5).fill(0x8b5a2b)
    g.rect(x + w * 0.085, y + awn, w * 0.83, h * 0.6).fill(0xf3dcb0)
    for (let px = x + w * 0.085 + 18; px < x + w * 0.9; px += 18) g.rect(px, y + awn, 1.5, h * 0.6).fill({ color: 0xd9b98a, alpha: 0.7 })
    for (const sy of this.shelfYs()) {
      g.rect(x + w * 0.07, sy, w * 0.86, Math.max(5, h * 0.03)).fill(0xa86b37)
      g.rect(x + w * 0.07, sy + Math.max(5, h * 0.03), w * 0.86, 2).fill({ color: 0x5d3a1a, alpha: 0.3 })
    }
    const cy = y + h * 0.82
    g.rect(x + w * 0.02, cy, w * 0.96, h * 0.18).fill(0xc98d52)
    g.rect(x + w * 0.01, cy - 4, w * 0.98, 7).fill(0x9c6b3f)
    for (let px = x + w * 0.02 + w * 0.12; px < x + w * 0.97; px += w * 0.12) g.rect(px, cy + 3, 2, h * 0.18 - 3).fill({ color: 0x8b5a2b, alpha: 0.5 })
    // Mái bạt sọc đỏ trắng, mép dưới lượn sóng
    const n = 8
    const sw = (w * 1.02) / n
    for (let i = 0; i < n; i++) {
      const sx = x - w * 0.01 + i * sw
      const color = i % 2 ? 0xffffff : 0xe8473b
      g.rect(sx, y, sw, awn * 0.8).fill(color)
      g.circle(sx + sw / 2, y + awn * 0.8, sw / 2).fill(color)
    }
    g.rect(x - w * 0.02, y - 4, w * 1.04, 8).fill(0xb33a2e)
  }

  /** Hàng trên kệ: mỗi loại một sọt, chất đống theo số còn lại, có thẻ giá */
  private drawGoods() {
    for (const c of this.stallGoods.removeChildren()) c.destroy({ children: true })
    const slots = this.opts.market ?? []
    const { x, y, w, h } = this.shopRect
    const rows = slots.length > 3 ? 2 : 1
    const cols = Math.max(1, Math.ceil(slots.length / rows))
    const [b1, b2] = this.shelfYs()
    const bases = rows === 2 ? [b1, b2] : [b2]
    const innerX = x + w * 0.1
    const slotW = (w * 0.8) / cols
    const size = Math.min(slotW * 0.27, h * 0.11)
    const label = (text: string, fontSize: number, fill: number) =>
      new Text({ text, style: { fontFamily: TEXT_FONT, fontSize, fontWeight: '800', fill }, resolution: 2 })
    const plank = Math.max(5, h * 0.03)
    // Thẻ giá vẽ sau cùng để hàng tầng dưới không che
    const tags = new Container()

    slots.forEach((s, i) => {
      const base = bases[Math.floor(i / cols)]
      const cx = innerX + slotW * ((i % cols) + 0.5)
      const g = new Graphics()
      const crateW = slotW * 0.78
      const crateH = size * 0.55
      g.roundRect(cx - crateW / 2, base - crateH, crateW, crateH, 4).fill(s.count ? 0xb98352 : 0xd9c3a0)
      g.rect(cx - crateW / 2, base - crateH * 0.55, crateW, 2).fill({ color: 0x8b5a2b, alpha: 0.6 })
      this.stallGoods.addChild(g)
      // Đống hàng: hàng dưới 3, trên 2
      const shown = Math.min(s.count, 5)
      const spots = [
        [-1, 0], [0, 0], [1, 0], [-0.5, 1], [0.5, 1],
      ].slice(0, shown)
      for (const [dx, row] of spots) {
        const t = new Text({ text: s.emoji, style: { fontFamily: EMOJI_FONT, fontSize: size }, resolution: 2 })
        t.anchor.set(0.5, 1)
        t.position.set(cx + dx * size * 0.62, base - crateH * 0.45 - row * size * 0.55)
        this.stallGoods.addChild(t)
      }
      if (!s.count) {
        const out = label('Hết', Math.max(10, size * 0.42), 0x8a7460)
        out.anchor.set(0.5, 1)
        out.position.set(cx, base - crateH - 2)
        this.stallGoods.addChild(out)
      } else {
        const badge = label(`×${s.count}`, Math.max(10, size * 0.4), 0x3b2a1a)
        badge.anchor.set(0.5)
        const bx = cx + crateW / 2 - 4
        const by = base - crateH - size * 0.9
        const bw = badge.width + 8
        this.stallGoods.addChild(new Graphics().roundRect(bx - bw / 2, by - 9, bw, 18, 9).fill(0xffffff).stroke({ width: 1.5, color: 0xd9b98a }), badge)
        badge.position.set(bx, by)
      }
      // Thẻ giá dán trên mép kệ, ngay dưới sọt
      const price = label(`${s.price} xu`, Math.max(10, size * 0.42), 0x3b2a1a)
      price.anchor.set(0.5)
      const pw = price.width + 10
      const py = base + plank / 2
      tags.addChild(new Graphics().roundRect(cx - pw / 2, py - 9, pw, 18, 5).fill(0xffd54f).stroke({ width: 1.5, color: 0xd99400 }), price)
      price.position.set(cx, py)
    })
    this.stallGoods.addChild(tags)

    const sign = new Text({
      text: '🌾 Nông sản nhà trồng',
      style: { fontFamily: TEXT_FONT, fontSize: Math.max(11, h * 0.065), fontWeight: '800', fill: 0xfff3d6, stroke: { color: 0x8b5a2b, width: 3 } },
      resolution: 2,
    })
    sign.anchor.set(0.5)
    sign.position.set(x + w / 2, y + h * 0.91)
    this.stallGoods.addChild(sign)
  }

  private sparkle(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const g = new Graphics()
        .star(0, 0, 4, rand(4, 7), rand(1.5, 2.5))
        .fill(pick([0xffd54f, 0xffffff, 0xff8a65, 0x81d4fa]))
      g.position.set(x, y)
      const a = rand(0, Math.PI * 2)
      const speed = rand(40, 140)
      this.fxLayer.addChild(g)
      this.particles.push({ node: g, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 60, life: 0, max: rand(500, 800), spin: rand(-6, 6), gravity: 220 })
    }
  }

  private note(x: number, y: number) {
    const t = new Text({
      text: pick(['♪', '♫']),
      style: { fontFamily: TEXT_FONT, fontSize: 16, fontWeight: '800', fill: pick([0x7e57c2, 0xec407a, 0x42a5f5]) },
    })
    t.anchor.set(0.5)
    t.position.set(x, y)
    this.fxLayer.addChild(t)
    this.particles.push({ node: t, vx: rand(-12, 12), vy: -28, life: 0, max: 1500, spin: rand(-1, 1), gravity: 0 })
  }

  /** Xu bay từ khách lên góc trên bên phải (chỗ ô xu) */
  private flyCoins(x0: number, y0: number, n: number) {
    const x1 = this.W - 40
    const y1 = -16
    for (let i = 0; i < n; i++) {
      const c = new Graphics()
        .circle(0, 0, 8)
        .fill(0xffc107)
        .stroke({ width: 2, color: 0xe08e00 })
        .circle(-2.5, -2.5, 2.5)
        .fill({ color: 0xffffff, alpha: 0.7 })
      c.position.set(x0, y0)
      c.visible = false
      this.fxLayer.addChild(c)
      const mx = (x0 + x1) / 2 + rand(-50, 30)
      const my = Math.min(y0, y1) - rand(10, 50)
      this.wait(i * 70, () => {
        c.visible = true
        this.tween(
          650,
          (p) => {
            const q = p * p
            c.x = (1 - q) ** 2 * x0 + 2 * (1 - q) * q * mx + q * q * x1
            c.y = (1 - q) ** 2 * y0 + 2 * (1 - q) * q * my + q * q * y1
            c.scale.set(1 - 0.3 * q)
          },
          () => c.destroy(),
        )
      })
    }
  }

  private floatText(text: string, x: number, y: number) {
    const t = new Text({
      text,
      style: { fontFamily: TEXT_FONT, fontSize: 24, fontWeight: '800', fill: 0xffa000, stroke: { color: 0xffffff, width: 5 } },
    })
    t.anchor.set(0.5)
    t.position.set(x, y)
    this.fxLayer.addChild(t)
    this.tween(
      1000,
      (p) => {
        t.y = y - 30 * easeOut(p)
        t.alpha = 1 - p * p
      },
      () => t.destroy(),
    )
  }

  private popEmoji(emoji: string, x: number, y: number, size: number) {
    const t = new Text({ text: emoji, style: { fontFamily: EMOJI_FONT, fontSize: size } })
    t.anchor.set(0.5)
    t.position.set(x, y)
    this.fxLayer.addChild(t)
    this.tween(
      800,
      (p) => {
        t.scale.set(p < 0.25 ? 1.2 * easeOut(p / 0.25) : 1.2 - 0.2 * Math.min(1, (p - 0.25) / 0.2))
        t.y = y - 10 * p
        t.alpha = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1
      },
      () => t.destroy(),
    )
  }
}
