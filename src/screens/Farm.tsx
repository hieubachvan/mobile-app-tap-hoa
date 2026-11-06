import { useRef, useState } from 'react'
import { callName, type Profile } from '../game/storage'
import { CROPS, FISHES, POND_COST, PRODUCE, canFeed, cropOf, fieldOf, isRipe, nextField, produceItem, stockCount, tileKeys, type Crop, type PlaceId, type TileFx } from '../game/farm'
import { unitOf } from '../game/items'
import { DAYS_PER_TIER, MAX_LEVEL, dayInLevel, levelOf, tierAt } from '../game/levels'
import { TUNING } from '../game/tuning'
import { claimable, dayDone, ensureDaily, rewardRunsLeft } from '../game/daily'
import { sfx, speak } from '../game/sound'
import FarmMap from '../components/FarmMap'
import { warn } from '../components/Warning'

/** Các màn đi ra từ nông trại */
export type FarmExit = 'stall' | 'gold' | 'fish' | 'practice' | 'quests' | 'coop'

interface Props {
  profile: Profile
  onPlant: (tile: string, crop: Crop) => void
  onFeed: (tile: string) => void
  onHarvest: (tile: string) => void
  onExpand: () => void
  onDigPond: () => void
  onPlay: (screen: FarmExit) => void
  onSetAge: (age: number) => void
  onToggleSound: () => void
  onReset: () => void
}

type Tool = 'seed' | 'feed' | 'harvest'

const TOOLS: { tool: Tool; emoji: string; name: string }[] = [
  { tool: 'seed', emoji: '🌱', name: 'Gieo hạt' },
  { tool: 'feed', emoji: '✨', name: 'Bón phân' },
  { tool: 'harvest', emoji: '🧺', name: 'Thu hoạch' },
]

/** Tuổi phụ huynh chọn được trong cài đặt */
const AGES = Object.keys(TUNING.ages).map(Number)

/** Bảng nhỏ mở ra trên bản đồ */
type Panel = 'stock' | 'expand' | 'pond' | 'menu' | null

const unit = (c: Crop) => unitOf(produceItem(c))

/** Nút tròn nổi trên bản đồ */
function MapButton(props: { emoji: string; label: string; badge?: string | number; locked?: boolean; main?: boolean; onClick: () => void }) {
  return (
    <button className={`map-btn ${props.main ? 'main' : ''} ${props.locked ? 'locked' : ''}`} onClick={props.onClick}>
      <span className="map-btn-icon">{props.emoji}</span>
      <span className="map-btn-label">{props.label}</span>
      {props.locked && <span className="map-btn-lock">🔒</span>}
      {props.badge !== undefined && <span className="badge">{props.badge}</span>}
    </button>
  )
}

/** Màn chính: nông trại, từ đây đi bán hàng, đào mỏ, luyện riêng… */
export default function Farm({ profile, onPlant, onFeed, onHarvest, onExpand, onDigPond, onPlay, onSetAge, onToggleSound, onReset }: Props) {
  const { farm, runs } = profile
  const [tool, setTool] = useState<Tool>('seed')
  const [seed, setSeed] = useState<Crop>(CROPS[0])
  const [toast, setToast] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const toastTimer = useRef<number>()
  /** Trong một lần kéo tay: xu còn lại, số ô đã làm, nông sản hái được, ô chạm mà không làm được gì */
  const stroke = useRef({ coins: 0, hits: 0, picked: 0, broke: false, miss: null as string | null })

  const field = fieldOf(farm)
  const next = nextField(farm)
  const plots = Object.values(farm.tiles)
  const stocked = PRODUCE.filter((c) => (farm.stock[c.id] ?? 0) > 0)
  const level = levelOf(profile)
  const easing = profile.slump >= TUNING.day.slumpDays
  const totalStars = Object.values(profile.stars).reduce((a, b) => a + b, 0)
  const daily = ensureDaily(profile.daily)
  const questsDone = daily.quests.filter((q) => q.claimed).length
  const toClaim = claimable(profile.daily)

  const say = (text: string, voice = true) => {
    setToast(text)
    if (voice) speak(text)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3000)
  }

  const play = (s: FarmExit) => {
    sfx.tap()
    onPlay(s)
  }

  const onTile = (key: string): TileFx | null => {
    const p = farm.tiles[key]
    const s = stroke.current
    // Cây chín thì chạm là hái, công cụ nào cũng được
    if (p && isRipe(p)) {
      const c = cropOf(p.crop)
      onHarvest(key)
      sfx.correct()
      s.hits++
      s.picked += c.harvest
      return { action: 'harvest', label: `${c.emoji}+${c.harvest}` }
    }
    if (tool === 'seed' && !p) {
      onPlant(key, seed)
      sfx.tap()
      s.hits++
      return { action: 'plant', label: '🌱' }
    }
    if (tool === 'feed' && p && canFeed(p, runs)) {
      const cost = cropOf(p.crop).fertilizer
      if (s.coins < cost) {
        s.broke = true
        return null
      }
      s.coins -= cost
      onFeed(key)
      sfx.coin()
      s.hits++
      return { action: 'feed', label: `−🪙${cost}` }
    }
    s.miss = key
    return null
  }

  const onStrokeEnd = () => {
    const s = stroke.current
    if (s.picked) {
      sfx.win()
      say(`Thu hoạch được ${s.picked} nông sản! Bày lên sạp bán thôi!`)
    } else if (s.broke) {
      warn('Hết xu mua phân rồi! Bán hàng hoặc đào mỏ để kiếm thêm xu nhé!')
    } else if (!s.hits && s.miss) {
      // Cả lần chạm không làm được gì: nói rõ vì sao
      const p = farm.tiles[s.miss]
      if (!p) warn('Chọn 🌱 Gieo hạt rồi chạm vào đất trống để trồng cây nhé!')
      else if (canFeed(p, runs)) warn('Chọn ✨ Bón phân để cây mau lớn nhé!')
      else if (dayDone(profile.daily, !!farm.pond)) warn('Cây đã được bón rồi. Mai bé quay lại bón tiếp nhé!')
      else warn('Cây đã được bón rồi. Chơi một lượt bán hàng hay đào mỏ rồi quay lại bón tiếp nhé!')
    }
  }

  const chatter = () => {
    if (plots.some(isRipe)) return 'Có cây chín rồi, hái đi con!'
    if (plots.some((p) => canFeed(p, runs))) return 'Cây đói rồi, bón phân nhé!'
    if (plots.length < tileKeys(farm).length) return 'Còn đất trống, gieo hạt đi!'
    if (stockCount(farm) > 0) return 'Kho có hàng rồi, ra sạp bán đi con!'
    return null
  }

  const onPlace = (place: PlaceId) => {
    switch (place) {
      case 'shop':
        return play('stall')
      case 'gold':
        return play('gold')
      case 'fish':
        return farm.pond ? play('fish') : openPanel('pond')
      case 'coop':
        return play('coop')
      case 'house':
        return say(`Chào mừng ${callName(profile.name)} về nông trại!`)
      case 'expand':
        return openPanel('expand')
    }
  }

  /** Phụ huynh đổi tuổi: cấp tính lại ngay, giữ nguyên tiến độ, xu và nông trại */
  const changeAge = (age: number) => {
    if (age === profile.age) return
    const to = tierAt(levelOf({ ...profile, age }))
    const msg = `Đổi tuổi của bé thành ${age}? Phép tính sẽ chuyển sang cấp ${to.id}: ${to.name}. Xu và nông trại giữ nguyên.`
    if (confirm(msg)) onSetAge(age)
  }

  const openPanel = (p: Panel) => {
    sfx.tap()
    setPanel((cur) => (cur === p ? null : p))
  }

  const expand = () => {
    if (!next) return
    if (profile.coins < next.cost) return warn(`Còn thiếu ${next.cost - profile.coins} xu để mở rộng ruộng. Bán hàng hoặc đào mỏ thêm nhé!`)
    sfx.win()
    speak('Ruộng rộng hơn rồi! Trồng thêm thật nhiều cây nhé!')
    setPanel(null)
    onExpand()
  }

  const digPond = () => {
    if (farm.pond) return
    if (profile.coins < POND_COST) return warn(`Còn thiếu ${POND_COST - profile.coins} xu để đào ao. Bán hàng hoặc đào mỏ thêm nhé!`)
    speak('Ao cá đào xong rồi! Ra câu cá thôi!')
    setPanel(null)
    onDigPond()
  }

  const choose = (t: Tool) => {
    sfx.tap()
    setTool(t)
    if (t === 'feed') say('Chạm hoặc kéo tay qua các cây có ✨ để bón phân.', false)
    if (t === 'harvest') say('Chạm vào cây chín để hái nhé!', false)
  }

  const pickSeed = (c: Crop) => {
    sfx.tap()
    setSeed(c)
    say(`${c.emoji} ${c.name}: bón ${c.feeds} lần × 🪙${c.fertilizer}, thu ${c.harvest} ${unit(c)}. Kéo tay qua đất trống để gieo.`, false)
  }

  const goldLeft = rewardRunsLeft(profile.daily, 'gold')
  const practiceLeft = rewardRunsLeft(profile.daily, 'practice')
  const fishLeft = rewardRunsLeft(profile.daily, 'fish')
  const shopLeft = rewardRunsLeft(profile.daily, 'shop')

  return (
    <div className="farm-home">
      <header className="topbar">
        <div className="chip name-chip">👦 {profile.name}</div>
        <div className="chip">🪙 {profile.coins}</div>
        <div className="chip">⭐ {totalStars}</div>
        <button className="icon-btn quest-btn" onClick={() => play('quests')} aria-label={`Nhiệm vụ ${questsDone}/${daily.quests.length}`}>
          📋
          {toClaim > 0 && <span className="badge">{toClaim}</span>}
        </button>
        <button className="icon-btn" onClick={() => openPanel('menu')} aria-label="Cài đặt">
          ⚙️
        </button>
      </header>

      <div className="yard">
        <FarmMap
          farm={farm}
          runs={runs}
          onStrokeStart={() => {
            setPanel(null)
            stroke.current = { coins: profile.coins, hits: 0, picked: 0, broke: false, miss: null }
          }}
          onTile={onTile}
          onStrokeEnd={onStrokeEnd}
          chatter={chatter}
          onPlace={onPlace}
        />

        <div className="map-hud">
          <div className="hud-chip">
            📅 Ngày {profile.day} · Cấp {level}
            <small>
              {easing
                ? '📖 Đang ôn lại cấp dễ hơn'
                : level >= MAX_LEVEL
                  ? '👑 Cấp cao nhất'
                : `Lên cấp sau ${DAYS_PER_TIER - dayInLevel(profile)} ngày ${'⭐'.repeat(TUNING.day.starsToAdvance)}`}
            </small>
          </div>
          <button className="hud-chip" onClick={() => openPanel('stock')}>
            🧺 Kho: {stockCount(farm)}
            <small>{stocked.length ? stocked.map((c) => c.emoji).join('') : 'Trống'}</small>
          </button>
          {dayDone(profile.daily, !!farm.pond) && (
            <div className="hud-chip day-done">
              🌙 Hôm nay chơi đủ rồi!
              <small>Cây và gà lớn tiếp khi mai bé quay lại</small>
            </div>
          )}
        </div>

        <div className="map-side">
          <MapButton main emoji="🛒" label="Bán hàng" badge={shopLeft || undefined} onClick={() => play('stall')} />
          <MapButton emoji="⛏️" label="Đào mỏ" badge={goldLeft || undefined} onClick={() => play('gold')} />
          <MapButton emoji="🎯" label="Luyện" badge={practiceLeft || undefined} onClick={() => play('practice')} />
          {farm.pond ? (
            <MapButton emoji="🎣" label="Câu cá" badge={fishLeft || undefined} onClick={() => play('fish')} />
          ) : (
            <MapButton
              locked
              emoji="🎣"
              label="Câu cá"
              badge={profile.coins >= POND_COST ? '⬆' : undefined}
              onClick={() => openPanel('pond')}
            />
          )}
          <MapButton emoji="🐔" label="Cho gà" onClick={() => play('coop')} />
          <MapButton
            emoji="🚜"
            label="Mở rộng"
            badge={next && profile.coins >= next.cost ? '⬆' : undefined}
            onClick={() => openPanel('expand')}
          />
        </div>

        {toast && <div className="farm-toast">{toast}</div>}

        {panel && (
          <div className="map-panel">
            <button className="panel-close" onClick={() => setPanel(null)} aria-label="Đóng">
              ✕
            </button>
            {panel === 'stock' && (
              <>
                <b>🧺 Kho nông sản</b>
                {stocked.length ? (
                  <div className="farm-stock-list">
                    {stocked.map((c) => (
                      <span key={c.id} className="chip">
                        {c.emoji} {farm.stock[c.id]}
                      </span>
                    ))}
                  </div>
                ) : (
                  <small>Kho trống. Thu hoạch cây chín rồi đem ra sạp bán nhé.</small>
                )}
                <button className="btn btn-primary" onClick={() => play('stall')}>
                  🛒 Bày hàng lên sạp
                </button>
              </>
            )}
            {panel === 'expand' && (
              <>
                <b>
                  🚜 Ruộng {field.cols}×{field.rows}
                </b>
                {next ? (
                  <>
                    <small>
                      Mở rộng lên {next.cols}×{next.rows}: thêm {next.cols * next.rows - field.cols * field.rows} ô đất
                    </small>
                    <button className={`btn btn-gold ${profile.coins < next.cost ? 'locked' : ''}`} onClick={expand}>
                      Mở rộng 🪙 {next.cost}
                    </button>
                  </>
                ) : (
                  <small>Ruộng đã rộng nhất rồi!</small>
                )}
              </>
            )}
            {panel === 'pond' && (
              <>
                <b>🎣 Ao cá</b>
                <small>
                  Đào ao để câu cá bằng phép tính. Cá càng to càng đắt nhưng vùng vẫy càng dữ ({FISHES.map((f) => `${f.emoji} lời 🪙${f.bonus}`).join(', ')}). Cá cất vào kho, đem ra sạp bán như nông sản.
                </small>
                <button className={`btn btn-gold ${profile.coins < POND_COST ? 'locked' : ''}`} onClick={digPond}>
                  Đào ao 🪙 {POND_COST}
                </button>
                {profile.coins < POND_COST && <small>Còn thiếu 🪙 {POND_COST - profile.coins} xu. Bán hàng hoặc đào mỏ thêm nhé!</small>}
              </>
            )}
            {panel === 'menu' && (
              <>
                <b>⚙️ Cài đặt</b>
                <div className="age-setting">
                  <small>Tuổi của bé (độ khó phép tính đi theo tuổi)</small>
                  <div className="age-grid">
                    {AGES.map((a) => (
                      <button key={a} className={`age-btn ${a === profile.age ? 'on' : ''}`} onClick={() => changeAge(a)}>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
                <button className="btn btn-gold" onClick={onToggleSound}>
                  {profile.sound ? '🔊 Âm thanh: bật' : '🔇 Âm thanh: tắt'}
                </button>
                <button
                  className="link-btn"
                  onClick={() => {
                    if (confirm('Chơi lại từ đầu? Tiến độ hiện tại sẽ bị xóa.')) onReset()
                  }}
                >
                  Đổi người chơi / chơi lại từ đầu
                </button>
              </>
            )}
          </div>
        )}

        <div className="map-bottom">
          {tool === 'seed' && (
            <div className="seed-tray">
              {CROPS.map((c) => {
                const locked = profile.day < c.unlockDay
                return (
                  <button
                    key={c.id}
                    className={`seed ${seed.id === c.id ? 'on' : ''} ${locked ? 'locked' : ''}`}
                    onClick={() =>
                      locked ? warn(`Hạt ${c.name.toLowerCase()} mở từ ngày ${c.unlockDay}. Bán hàng mỗi ngày để mở thêm hạt giống nhé!`) : pickSeed(c)
                    }
                    aria-label={locked ? `${c.name}: mở từ ngày ${c.unlockDay}` : c.name}
                  >
                    <span className="seed-emoji">{locked ? '🔒' : c.emoji}</span>
                    <span>{locked ? `Ngày ${c.unlockDay}` : c.name}</span>
                  </button>
                )
              })}
            </div>
          )}
          <div className="farm-tools">
            {TOOLS.map((t) => (
              <button key={t.tool} className={`farm-tool ${tool === t.tool ? 'on' : ''}`} onClick={() => choose(t.tool)}>
                <span>{t.tool === 'seed' ? seed.emoji : t.emoji}</span>
                {t.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
