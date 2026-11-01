import { useEffect, useState } from 'react'
import { loadProfile, newProfile, saveProfile, type Profile } from './game/storage'
import { setSoundEnabled } from './game/sound'
import { CHECKIN_REWARDS, CHEST_REWARD, addProgress, ensureDaily, today, yesterday } from './game/daily'
import type { Upgrade } from './game/upgrades'
import type { ShopLevel } from './game/shopLevels'
import Welcome from './screens/Welcome'
import Home from './screens/Home'
import ShopGame, { type DayResult } from './screens/ShopGame'
import GoldMiner from './screens/GoldMiner'
import Practice from './screens/Practice'
import Upgrades from './screens/Upgrades'
import Quests from './screens/Quests'
import CheckIn from './components/CheckIn'
import DevPanel from './components/DevPanel'
import { TEST_COINS, TEST_MODE } from './game/testMode'

/** Chế độ test: nạp đủ xu mỗi lần mở app */
const topUp = (p: Profile | null) => (TEST_MODE && p && p.coins < TEST_COINS ? { ...p, coins: TEST_COINS } : p)
import type { Op } from './game/levels'

export type Screen = 'home' | 'shop' | 'gold' | 'practice' | 'upgrades' | 'quests'

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(() => topUp(loadProfile()))
  const [screen, setScreen] = useState<Screen>('home')
  const [practice, setPractice] = useState<Op | null>(null)

  const play = (s: Screen, op: Op | null = null) => {
    setPractice(op)
    setScreen(s)
  }

  useEffect(() => {
    saveProfile(profile)
    setSoundEnabled(profile?.sound ?? true)
  }, [profile])

  if (!profile) {
    return <Welcome onStart={(name, age) => setProfile(topUp(newProfile(name, age)))} />
  }

  const update = (patch: Partial<Profile> | ((p: Profile) => Partial<Profile>)) =>
    setProfile((p) => (p ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch) } : p))

  const finishDay = (r: DayResult) =>
    update((p) => ({
      coins: p.coins + r.coins,
      stars: { ...p.stars, [p.day]: Math.max(p.stars[p.day] ?? 0, r.stars) },
      day: r.passed ? p.day + 1 : p.day,
      daily: addProgress(p.daily, { serve: r.served, perfect: r.perfect, stars: r.stars === 3 ? 1 : 0 }),
    }))

  /** Đang luyện riêng thì quay về màn chọn phép tính, không thì về tiệm */
  const exitGame = () => play(practice ? 'practice' : 'home')

  const finishPractice = (r: DayResult) =>
    update((p) => ({
      coins: p.coins + r.coins,
      daily: addProgress(p.daily, { serve: r.served, perfect: r.perfect, practice: 1 }),
    }))

  const finishGold = (correct: number, coins: number) =>
    update((p) => ({
      coins: p.coins + coins,
      goldBest: Math.max(p.goldBest, correct),
      daily: addProgress(p.daily, { gold: correct }),
    }))

  const buyUpgrade = (u: Upgrade) =>
    update((p) => (p.coins >= u.cost && !p.owned.includes(u.id) ? { coins: p.coins - u.cost, owned: [...p.owned, u.id] } : {}))

  const levelUp = (l: ShopLevel) =>
    update((p) => (p.coins >= l.cost && p.shopLevel === l.level - 1 ? { coins: p.coins - l.cost, shopLevel: l.level } : {}))

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
          <Home
            profile={profile}
            onPlay={(s) => play(s)}
            onToggleSound={() => update((p) => ({ sound: !p.sound }))}
            onReset={() => setProfile(null)}
          />
          {needCheckIn && <CheckIn nextStreak={nextStreak} onClaim={checkIn} />}
        </>
      )}
      {screen === 'shop' && (
        <ShopGame
          profile={profile}
          practice={practice}
          onFinish={practice ? finishPractice : finishDay}
          onExit={exitGame}
          onGoldBonus={() => play('gold', practice)}
        />
      )}
      {screen === 'gold' && (
        <GoldMiner profile={profile} practice={practice} onFinish={finishGold} onExit={exitGame} />
      )}
      {screen === 'practice' && <Practice onPlay={play} onExit={() => play('home')} />}
      {screen === 'upgrades' && <Upgrades profile={profile} onBuy={buyUpgrade} onLevelUp={levelUp} onExit={() => play('home')} />}
      {screen === 'quests' && (
        <Quests profile={profile} onClaimQuest={claimQuest} onClaimChest={claimChest} onExit={() => play('home')} />
      )}
      {/* Chỉ có khi chạy npm run dev:test; Vite bỏ hẳn khối này khỏi bản build */}
      {TEST_MODE && <DevPanel profile={profile} update={update} />}
    </div>
  )
}
