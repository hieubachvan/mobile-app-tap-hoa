import { useState } from 'react'
import { sfx } from '../game/sound'
import { SHOP_LEVELS } from '../game/shopLevels'
import ShopDecor from '../components/ShopDecor'

const AGES = [3, 4, 5, 6, 7, 8, 9, 10]

export default function Welcome({ onStart }: { onStart: (name: string, age: number) => void }) {
  const [name, setName] = useState('')
  const [age, setAge] = useState<number | null>(null)
  const ready = name.trim().length > 0 && age !== null

  return (
    <div className="app welcome">
      <div className="sign big">
        <div className="sign-sub">Tiệm Tạp Hóa</div>
        <div className="sign-title">Cậu Lớn</div>
      </div>
      <ShopDecor level={SHOP_LEVELS[0]} owned={[]} />
      <p className="welcome-text">Chào bé! Hôm nay bé làm chủ tiệm, bán hàng và tính tiền cho khách nhé!</p>

      <label className="field">
        <span>Bé tên là gì?</span>
        <input value={name} maxLength={16} placeholder="Tên của bé" onChange={(e) => setName(e.target.value)} />
      </label>

      <div className="field">
        <span>Bé mấy tuổi?</span>
        <div className="age-grid">
          {AGES.map((a) => (
            <button
              key={a}
              className={`age-btn ${age === a ? 'active' : ''}`}
              onClick={() => {
                sfx.tap()
                setAge(a)
              }}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <button className="btn btn-primary btn-xl" disabled={!ready} onClick={() => ready && onStart(name.trim(), age!)}>
        Mở tiệm thôi! 🚀
      </button>
    </div>
  )
}
