import { useEffect, useState } from 'react'
import { loadProfile, newProfile, saveProfile, type Profile } from './game/storage'
import { setSoundEnabled } from './game/sound'
import {
  CHECKIN_REWARDS,
  CHEST_REWARD,
  addProgress,
  ensureDaily,
  rewardRunsLeft,
  spendRewardRun,
  today,
  yesterday,
} from './game/daily'
import { POND_COST, addStock, canFeed, cropOf, inField, isRipe, nextField, type Crop, type Plot } from './game/farm'
import { COOP, canFeedHen, coopOf, settleCoop, type Coop as CoopState } from './game/coop'
import Welcome from './screens/Welcome'
import ShopGame, { type DayResult } from './screens/ShopGame'
import GoldMiner from './screens/GoldMiner'
import FishPond from './screens/FishPond'
import Practice from './screens/Practice'
import Quests from './screens/Quests'
import Farm from './screens/Farm'
import StallSetup from './screens/StallSetup'
import Coop from './screens/Coop'
import CheckIn from './components/CheckIn'
import DevPanel from './components/DevPanel'
import { WarningHost } from './components/Warning'
import { TEST_COINS, TEST_MODE } from './game/testMode'

/** Chế độ test: nạp đủ xu mỗi lần mở app */
const topUp = (p: Profile | null) => (TEST_MODE && p && p.coins < TEST_COINS ? { ...p, coins: TEST_COINS } : p)
import { afterDay, type Op } from './game/levels'

/** home: nông trại; stall: bày hàng lên kệ trước khi mở sạp */
export type Screen = 'home' | 'stall' | 'shop' | 'gold' | 'fish' | 'practice' | 'quests' | 'coop'

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(() => topUp(loadProfile()))
  const [screen, setScreen] = useState<Screen>('home')
  const [practice, setPractice] = useState<Op | null>(null)
  /** Hàng bé bày lên kệ cho lượt bán hôm nay */
  const [shelf, setShelf] = useState<Record<string, number>>({})

  const play = (s: Screen, op: Op | null = null) => {
    setPractice(op)
    setScreen(s)
  }

  useEffect(() => {
    document.title = profile ? `Nông trại ${profile.name}` : 'Nông trại nhí'
  }, [profile?.name])

  useEffect(() => {
    saveProfile(profile)
    setSoundEnabled(profile?.sound ?? true)
  }, [profile])

  // Màn nông trại chính vừa khít màn hình (không có nội dung cuộn), khóa scroll để tránh
  // trình duyệt mobile cuộn lố làm lệch hình hoặc che mất nút bấm. Màn khác vẫn cho cuộn bình thường.
  useEffect(() => {
    const locked = !!profile && screen === 'home'
    document.documentElement.classList.toggle('scroll-locked', locked)
    document.body.classList.toggle('scroll-locked', locked)
    return () => {
      document.documentElement.classList.remove('scroll-locked')
      document.body.classList.remove('scroll-locked')
    }
  }, [screen, profile])

  if (!profile) {
    return (
      <>
        <Welcome onStart={(name, age) => setProfile(topUp(newProfile(name, age)))} />
        <WarningHost />
      </>
    )
  }

  const update = (patch: Partial<Profile> | ((p: Profile) => Partial<Profile>)) =>
    setProfile((p) => (p ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch) } : p))

  const finishDay = (r: DayResult) =>
    update((p) => ({
      coins: p.coins + r.coins,
      stars: { ...p.stars, [p.day]: Math.max(p.stars[p.day] ?? 0, r.stars) },
      day: r.passed ? p.day + 1 : p.day,
      ...afterDay(p, r.stars, r.counted),
      runs: p.runs + 1,
      farm: { ...p.farm, stock: addStock(p.farm.stock, r.sold, -1) },
      daily: addProgress(p.daily, { serve: r.served, perfect: r.perfect, stars: r.stars === 3 ? 1 : 0 }),
    }))

  /** Đang luyện riêng thì quay về màn chọn phép tính, không thì về nông trại */
  const exitGame = () => play(practice ? 'practice' : 'home')

  // Hết lượt thưởng thì vẫn tính nhiệm vụ và kỷ lục, chỉ không cộng xu
  const finishPractice = (r: DayResult) =>
    update((p) => {
      const rewarded = rewardRunsLeft(p.daily, 'practice') > 0
      const daily = addProgress(p.daily, { serve: r.served, perfect: r.perfect, practice: 1 })
      return {
        coins: p.coins + (rewarded ? r.coins : 0),
        runs: p.runs + 1,
        daily: rewarded ? spendRewardRun(daily, 'practice') : daily,
      }
    })

  const finishGold = (correct: number, coins: number) =>
    update((p) => {
      const rewarded = rewardRunsLeft(p.daily, 'gold') > 0
      const daily = addProgress(p.daily, { gold: correct })
      return {
        coins: p.coins + (rewarded ? coins : 0),
        goldBest: Math.max(p.goldBest, correct),
        runs: p.runs + 1,
        daily: rewarded ? spendRewardRun(daily, 'gold') : daily,
      }
    })

  /** Cá trong xô vào kho (chỉ lượt có thưởng mới giữ cá) */
  const finishFish = (_correct: number, fish: Record<string, number>) =>
    update((p) => {
      const rewarded = rewardRunsLeft(p.daily, 'fish') > 0
      return {
        runs: p.runs + 1,
        farm: rewarded ? { ...p.farm, stock: addStock(p.farm.stock, fish) } : p.farm,
        daily: rewarded ? spendRewardRun(p.daily, 'fish') : p.daily,
      }
    })

  const digPond = () =>
    update((p) => (p.farm.pond || p.coins < POND_COST ? {} : { coins: p.coins - POND_COST, farm: { ...p.farm, pond: true } }))

  /** Đổi cây ở ô `key`; trả về null thì giữ nguyên */
  const setTile = (
    key: string,
    fn: (plot: Plot | undefined, p: Profile) => { plot: Plot | null; coins?: number; stock?: Record<string, number> } | null,
  ) =>
    update((p) => {
      if (!inField(p.farm, key)) return {}
      const r = fn(p.farm.tiles[key], p)
      if (!r) return {}
      const { [key]: _old, ...rest } = p.farm.tiles
      return {
        coins: r.coins ?? p.coins,
        farm: { ...p.farm, tiles: r.plot ? { ...rest, [key]: r.plot } : rest, stock: r.stock ?? p.farm.stock },
      }
    })

  const plant = (key: string, c: Crop) =>
    setTile(key, (plot, p) => (plot || p.day < c.unlockDay ? null : { plot: { crop: c.id, fed: 0, lastFed: -1 } }))

  const feed = (key: string) =>
    setTile(key, (plot, p) => {
      const cost = plot && cropOf(plot.crop).fertilizer
      if (!plot || !cost || !canFeed(plot, p.runs) || p.coins < cost) return null
      return { plot: { ...plot, fed: plot.fed + 1, lastFed: p.runs }, coins: p.coins - cost }
    })

  const harvest = (key: string) =>
    setTile(key, (plot, p) =>
      plot && isRipe(plot) ? { plot: null, stock: addStock(p.farm.stock, { [plot.crop]: cropOf(plot.crop).harvest }) } : null,
    )

  const expandField = () =>
    update((p) => {
      const next = nextField(p.farm)
      if (!next || p.coins < next.cost) return {}
      return { coins: p.coins - next.cost, farm: { ...p.farm, size: p.farm.size + 1 } }
    })

  /** Đổi chuồng gà (đã dồn trứng của gà no từ lượt trước); trả về null thì giữ nguyên */
  const setCoop = (fn: (c: CoopState, p: Profile) => { coop: CoopState; coins?: number; stock?: Record<string, number> } | null) =>
    update((p) => {
      const r = fn(settleCoop(coopOf(p.farm.coop), p.runs), p)
      if (!r) return {}
      return { coins: r.coins ?? p.coins, farm: { ...p.farm, coop: r.coop, stock: r.stock ?? p.farm.stock } }
    })

  const feedHen = (i: number) =>
    setCoop((c, p) => {
      const h = c.hens[i]
      if (!h || !canFeedHen(h, p.runs) || p.coins < COOP.feedCost) return null
      const hens = c.hens.map((x, j) => (j === i ? { fed: x.fed + 1, lastFed: p.runs } : x))
      return { coop: { ...c, hens }, coins: p.coins - COOP.feedCost }
    })

  const collectEggs = () =>
    setCoop((c, p) => (c.nest ? { coop: { ...c, nest: 0 }, stock: addStock(p.farm.stock, { egg: c.nest }) } : null))

  const stealEgg = () => setCoop((c) => (c.nest ? { coop: { ...c, nest: c.nest - 1 } } : null))

  const raidDone = () => setCoop((c) => ({ coop: { ...c, raidDate: today() } }))

  // Điểm danh: hôm qua có vào thì nối chuỗi, không thì bắt đầu lại từ 1
  const needCheckIn = profile.lastCheckIn !== today()
  const nextStreak = profile.lastCheckIn === yesterday() ? profile.streak + 1 : 1
  const checkIn = () =>
    update((p) => {
      if (p.lastCheckIn === today()) return {}
      const streak = p.lastCheckIn === yesterday() ? p.streak + 1 : 1
      return { coins: p.coins + CHECKIN_REWARDS[(streak - 1) % CHECKIN_REWARDS.length], streak, lastCheckIn: today() }
    })

  const claimQuest = (i: number) =>
    update((p) => {
      const d = ensureDaily(p.daily)
      const q = d.quests[i]
      if (!q || q.claimed || q.progress < q.target) return {}
      return {
        coins: p.coins + q.reward,
        daily: { ...d, quests: d.quests.map((x, j) => (j === i ? { ...x, claimed: true } : x)) },
      }
    })

  const claimChest = () =>
    update((p) => {
      const d = ensureDaily(p.daily)
      if (d.chestClaimed || !d.quests.every((q) => q.claimed)) return {}
      return { coins: p.coins + CHEST_REWARD, daily: { ...d, chestClaimed: true } }
    })

  return (
    <div className="app">
      {screen === 'home' && (
        <>
          <Farm
            profile={profile}
            onPlant={plant}
            onFeed={feed}
            onHarvest={harvest}
            onExpand={expandField}
            onDigPond={digPond}
            onPlay={(s) => play(s)}
            onSetAge={(age) => update({ age })}
            onToggleSound={() => update((p) => ({ sound: !p.sound }))}
            onReset={() => setProfile(null)}
          />
          {needCheckIn && <CheckIn nextStreak={nextStreak} onClaim={checkIn} />}
        </>
      )}
      {screen === 'stall' && (
        <StallSetup
          profile={profile}
          onOpen={(s) => {
            setShelf(s)
            play('shop')
          }}
          onExit={() => play('home')}
        />
      )}
      {screen === 'shop' && (
        <ShopGame
          profile={profile}
          shelf={shelf}
          practice={practice}
          rewarded={!practice || rewardRunsLeft(profile.daily, 'practice') > 0}
          onFinish={practice ? finishPractice : finishDay}
          onExit={exitGame}
          onGoldBonus={() => play('gold', practice)}
        />
      )}
      {screen === 'gold' && (
        <GoldMiner
          profile={profile}
          practice={practice}
          rewardLeft={rewardRunsLeft(profile.daily, 'gold')}
          onFinish={finishGold}
          onExit={exitGame}
        />
      )}
      {screen === 'fish' && (
        <FishPond
          profile={profile}
          rewardLeft={rewardRunsLeft(profile.daily, 'fish')}
          onFinish={finishFish}
          onSell={() => play('stall')}
          onExit={() => play('home')}
        />
      )}
      {screen === 'practice' && (
        <Practice rewardLeft={rewardRunsLeft(profile.daily, 'practice')} onPlay={play} onExit={() => play('home')} />
      )}
      {screen === 'coop' && (
        <Coop
          profile={profile}
          onFeed={feedHen}
          onCollect={collectEggs}
          onSteal={stealEgg}
          onRaidDone={raidDone}
          onSell={() => play('stall')}
          onExit={() => play('home')}
        />
      )}
      {screen === 'quests' && (
        <Quests profile={profile} onClaimQuest={claimQuest} onClaimChest={claimChest} onExit={() => play('home')} />
      )}
      {/* Chỉ có khi chạy npm run dev:test; Vite bỏ hẳn khối này khỏi bản build */}
      {TEST_MODE && <DevPanel profile={profile} update={update} />}
      <WarningHost />
    </div>
  )
}
