import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Tuning } from '../game/tuning'
import type { Kind, Tier } from '../game/levels'
import type { QuestKind } from '../game/daily'

// Trang cấu hình chỉ đọc/ghi tuning.json qua API (không import file JSON)
// để bấm Lưu không làm chính trang này tải lại.
// - Lúc dev (npm run config): API của Vite, chỉ mở từ localhost, không cần mật khẩu
// - Trên VPS: server/config-server.mjs, cần đăng nhập; lưu xong tự build lại bản web

const DEV = import.meta.env.DEV
const API = DEV ? '/__tuning' : '/config/api/tuning'

type Path = (string | number)[]

function setIn<T>(obj: T, path: Path, value: unknown): T {
  const copy = structuredClone(obj)
  let cur = copy as Record<string | number, unknown>
  for (const key of path.slice(0, -1)) cur = cur[key] as Record<string | number, unknown>
  cur[path[path.length - 1]] = value
  return copy
}

const KINDS: { kind: Kind; label: string }[] = [
  { kind: 'count', label: 'Đếm hàng' },
  { kind: 'total', label: 'Tính tổng tiền' },
  { kind: 'change', label: 'Thối tiền' },
  { kind: 'multiply', label: 'Nhân (số lượng × giá)' },
  { kind: 'divide', label: 'Đưa tiền, mua được mấy món (chia)' },
  { kind: 'share', label: 'Chia đều' },
  { kind: 'group', label: 'Đóng túi' },
  { kind: 'remainder', label: 'Chia có dư' },
]

const QUESTS: Record<QuestKind, string> = {
  serve: 'Bán hàng cho N khách',
  perfect: 'Trả lời đúng ngay cho N khách',
  gold: 'Gắp đúng N cục vàng',
  practice: 'Hoàn thành N lượt luyện riêng',
  stars: 'Được 3 sao trong một ngày bán hàng',
}

/** Tìm ô bỏ trống / sai trước khi lưu */
function problems(t: Tuning): string[] {
  const out: string[] = []
  const walk = (v: unknown, path: string) => {
    if (typeof v === 'number' && !Number.isFinite(v)) out.push(`Ô "${path}" đang trống hoặc không phải số`)
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k)
  }
  walk(t, '')
  t.tiers.forEach((tier) => {
    if (tier.kinds.length === 0) out.push(`Cấp ${tier.id}: chưa chọn loại câu hỏi nào`)
    if (tier.questions < 1) out.push(`Cấp ${tier.id}: số câu mỗi ngày phải từ 1`)
  })
  const [a, b, c] = t.day.stars
  if (!(a <= b && b <= c)) out.push('Ngưỡng sao phải tăng dần: 1 sao ≤ 2 sao ≤ 3 sao')
  for (const [age, row] of Object.entries(t.ages))
    if (row.startTier < 1 || row.startTier > t.tiers.length) out.push(`Tuổi ${age}: cấp khởi đầu phải từ 1 đến ${t.tiers.length}`)
  return out
}

// ---------- Ô nhập ----------

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

const toNum = (s: string) => (s.trim() === '' ? NaN : Number(s))

function Num(props: { label: string; hint?: string; value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return (
    <Field label={props.label} hint={props.hint}>
      <input
        type="number"
        value={Number.isFinite(props.value) ? props.value : ''}
        step={props.step ?? 1}
        min={props.min ?? 0}
        onChange={(e) => props.onChange(toNum(e.target.value))}
      />
    </Field>
  )
}

/** Lưu dạng tỉ lệ (0.2), hiện dạng phần trăm (20) */
function Pct(props: { label: string; hint?: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={`${props.label} (%)`} hint={props.hint}>
      <input
        type="number"
        value={Number.isFinite(props.value) ? Math.round(props.value * 1000) / 10 : ''}
        step={5}
        onChange={(e) => props.onChange(toNum(e.target.value) / 100)}
      />
    </Field>
  )
}

function Txt(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={props.label}>
      <input value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </Field>
  )
}

/** Danh sách số, gõ cách nhau bằng dấu phẩy */
function NumList(props: { label: string; hint?: string; value: number[]; onChange: (v: number[]) => void }) {
  const [text, setText] = useState(props.value.join(', '))
  useEffect(() => setText(props.value.join(', ')), [props.value.join(',')])
  return (
    <Field label={props.label} hint={props.hint}>
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const nums = e.target.value.split(/[,\s]+/).filter(Boolean).map(Number)
          if (nums.every(Number.isFinite)) props.onChange(nums)
        }}
      />
    </Field>
  )
}

function Section({ id, title, desc, children }: { id: string; title: string; desc?: string; children: ReactNode }) {
  return (
    <section id={id} className="section">
      <h2>{title}</h2>
      {desc && <p className="desc">{desc}</p>}
      {children}
    </section>
  )
}

// ---------- Cấp độ ----------

function TierCard({ tier, set }: { tier: Tier; set: (path: Path, v: unknown) => void }) {
  const f = (key: keyof Tier) => (v: unknown) => set([key], v)
  const weight = (k: Kind) => tier.kinds.filter((x) => x === k).length
  const setWeight = (k: Kind, n: number) => {
    const others = tier.kinds.filter((x) => x !== k)
    set(['kinds'], [...others, ...Array.from({ length: Math.max(0, n || 0) }, () => k)])
  }
  return (
    <details className="tier">
      <summary>
        <b>Cấp {tier.id}: {tier.name}</b>
        <span>
          {tier.questions} câu · {tier.patience} giây/câu · {tier.input === 'pad' ? 'bàn phím số' : 'chọn đáp án'}
        </span>
      </summary>
      <div className="grid">
        <Txt label="Tên cấp" value={tier.name} onChange={f('name')} />
        <Txt label="Mô tả cho bé" value={tier.desc} onChange={f('desc')} />
        <Num label="Số câu mỗi ngày" value={tier.questions} onChange={f('questions')} min={1} />
        <Num label="Giây chờ mỗi câu" hint="Trước khi nhân hệ số tuổi và khách" value={tier.patience} onChange={f('patience')} />
        <Field label="Cách trả lời">
          <select value={tier.input} onChange={(e) => set(['input'], e.target.value)}>
            <option value="choice">Chọn 1 trong 3 đáp án</option>
            <option value="pad">Bàn phím số</option>
          </select>
        </Field>
      </div>

      <h4>Loại câu hỏi (số lần xuất hiện, càng lớn càng hay gặp)</h4>
      <div className="grid">
        {KINDS.map(({ kind, label }) => (
          <Num key={kind} label={label} value={weight(kind)} onChange={(n) => setWeight(kind, n)} />
        ))}
      </div>

      <h4>Giá và số lượng</h4>
      <div className="grid">
        <Num label="Hệ số giá" hint="Giá trên bảng = giá gốc nông sản × số này" value={tier.priceScale} onChange={f('priceScale')} min={1} />
        <Num label="Số loại hàng tối đa / lượt" value={tier.maxTypes} onChange={f('maxTypes')} min={1} />
        <Num label="Số lượng tối đa mỗi loại" hint="Khi tính tổng tiền" value={tier.qtyMax} onChange={f('qtyMax')} min={1} />
        <Num label="Đếm tối đa" hint="Câu đếm hàng" value={tier.countMax} onChange={f('countMax')} min={1} />
        <Num label="Tổng tiền tối đa" value={tier.maxTotal} onChange={f('maxTotal')} min={1} />
      </div>

      <h4>Thối tiền</h4>
      <div className="grid">
        <NumList label="Tờ tiền khách đưa" hint="Cách nhau dấu phẩy, vd 10, 20" value={tier.bills} onChange={f('bills')} />
        <Field label="Cách hỏi">
          <select value={tier.changeSteps} onChange={(e) => set(['changeSteps'], Number(e.target.value))}>
            <option value={1}>Cho sẵn tổng, chỉ hỏi thối</option>
            <option value={2}>Hỏi tổng trước, rồi hỏi thối</option>
          </select>
        </Field>
      </div>

      <h4>Nhân, chia</h4>
      <div className="grid">
        <Num label="Số lượng tối đa (nhân)" value={tier.mulQty} onChange={f('mulQty')} min={1} />
        <Num label="Số túi tối đa (chia đều)" value={tier.shareDiv} onChange={f('shareDiv')} min={1} />
        <Num label="Số món mỗi túi tối đa" value={tier.shareQuot} onChange={f('shareQuot')} min={1} />
        <Field label="Viết số lượng">
          <select value={tier.useMul ? '1' : '0'} onChange={(e) => set(['useMul'], e.target.value === '1')}>
            <option value="0">Cộng lặp (5 + 5)</option>
            <option value="1">Phép nhân (2 × 5)</option>
          </select>
        </Field>
      </div>
    </details>
  )
}

// ---------- Đăng nhập (chỉ trên VPS) ----------

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await fetch('/config/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }).catch(() => null)
    setBusy(false)
    if (res?.ok) return onDone()
    const body = await res?.json().catch(() => null)
    if (res?.status === 429) setError(`Sai quá nhiều lần. Thử lại sau ${body?.minutes ?? 15} phút.`)
    else if (res?.status === 401) setError(body?.left ? `Sai mật khẩu. Còn ${body.left} lần thử.` : 'Sai mật khẩu. Tạm khóa 15 phút.')
    else setError('Không kết nối được máy chủ.')
  }

  return (
    <form className="login" onSubmit={submit}>
      <h1>⚙️ Cấu hình game</h1>
      <label className="field">
        <span className="label">Mật khẩu</span>
        <input type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="status bad">{error}</p>}
      <button className="primary" disabled={busy || !password}>
        {busy ? 'Đang kiểm tra…' : 'Vào trang cấu hình'}
      </button>
    </form>
  )
}

// ---------- Trang ----------

export default function ConfigApp() {
  const [t, setT] = useState<Tuning | null>(null)
  const [saved, setSaved] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [allQuestions, setAllQuestions] = useState(10)
  const [needLogin, setNeedLogin] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const res = await fetch(API)
    if (res.status === 401) {
      setNeedLogin(true)
      return
    }
    const data = (await res.json()) as Tuning
    setT(data)
    setSaved(JSON.stringify(data))
    setStatus(null)
  }

  useEffect(() => {
    load().catch((e) => setStatus({ ok: false, text: `Không đọc được cấu hình: ${e}` }))
  }, [])

  const dirty = t !== null && JSON.stringify(t) !== saved

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  if (needLogin) {
    return (
      <Login
        onDone={() => {
          setNeedLogin(false)
          // Hết phiên giữa chừng: giữ nguyên chỗ đang sửa, không tải lại
          if (!t) load().catch((e) => setStatus({ ok: false, text: `Không đọc được cấu hình: ${e}` }))
        }}
      />
    )
  }

  if (!t) return <div className="page">{status?.text ?? 'Đang tải…'}</div>

  const set = (path: Path) => (v: unknown) => setT((cur) => (cur ? setIn(cur, path, v) : cur))

  const save = async () => {
    const errs = problems(t)
    if (errs.length) {
      setStatus({ ok: false, text: errs.join('\n') })
      return
    }
    setSaving(true)
    setStatus({ ok: true, text: DEV ? 'Đang lưu…' : 'Đang lưu và build lại bản web, chờ chút…' })
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tuning': '1' },
      body: JSON.stringify(t),
    }).catch(() => null)
    setSaving(false)
    if (res?.status === 401) {
      setStatus(null)
      setNeedLogin(true)
      return
    }
    if (!res?.ok) {
      const body = await res?.text().catch(() => '')
      let msg = body
      try {
        msg = JSON.parse(body ?? '').error ?? body
      } catch {
        /* lỗi dạng chữ */
      }
      setStatus({ ok: false, text: `Lưu thất bại: ${msg || 'không kết nối được máy chủ'}` })
      return
    }
    setSaved(JSON.stringify(t))
    if (DEV) setStatus({ ok: true, text: 'Đã lưu vào src/game/tuning.json. Tab game đang mở sẽ tự tải lại.' })
    else {
      const { seconds } = (await res.json()) as { seconds: number }
      setStatus({ ok: true, text: `Đã lưu và cập nhật bản web (build ${Math.round(seconds)} giây). Người chơi mở lại game là nhận thông số mới.` })
    }
  }

  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(t, null, 2) + '\n'], { type: 'application/json' }))
    a.download = 'tuning.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const logout = async () => {
    await fetch('/config/api/logout', { method: 'POST' }).catch(() => null)
    setT(null)
    setNeedLogin(true)
  }

  return (
    <div className="page">
      <header className="bar">
        <h1>⚙️ Cấu hình game</h1>
        <nav>
          <a href="#day">Ngày chơi</a>
          <a href="#ages">Theo tuổi</a>
          <a href="#tiers">Cấp độ</a>
          <a href="#coins">Xu</a>
          <a href="#quests">Nhiệm vụ</a>
          <a href="#shop">Tiệm</a>
          <a href="#farm">Nông trại</a>
          <a href="#customers">Khách</a>
        </nav>
        <div className="actions">
          <span className={dirty ? 'dirty' : 'clean'}>{dirty ? 'Có thay đổi chưa lưu' : 'Đã lưu'}</span>
          <button onClick={() => load()} disabled={!dirty || saving}>
            Hoàn tác
          </button>
          <button className="primary" onClick={save} disabled={!dirty || saving}>
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
          <button onClick={download} title="Tải file tuning.json để chép vào repo khi build app Android">
            Tải JSON
          </button>
          {!DEV && <button onClick={logout}>Đăng xuất</button>}
        </div>
      </header>

      {status && <pre className={`status ${status.ok ? 'ok' : 'bad'}`}>{status.text}</pre>}

      {DEV ? (
        <p className="note">
          Thay đổi được ghi vào <code>src/game/tuning.json</code>. Để người chơi nhận được, cần build lại app và phát hành
          bản mới. Tiến độ đã lưu của bé (xu, ngày, đồ đã mua) không bị ảnh hưởng.
        </p>
      ) : (
        <p className="note">
          Lưu ở đây sẽ cập nhật ngay <b>bản web</b> trên máy chủ. App Android đóng gói sẵn thông số nên không đổi theo: bấm{' '}
          <b>Tải JSON</b>, chép vào <code>src/game/tuning.json</code> trong repo rồi build app. Tiến độ của bé không bị ảnh
          hưởng.
        </p>
      )}

      <Section id="day" title="Ngày bán hàng" desc="Áp dụng cho mọi cấp. Số câu mỗi ngày đặt riêng từng cấp ở phần Cấp độ.">
        <div className="grid">
          <Num label="Số ngày tiến bộ để lên cấp" value={t.day.daysPerTier} onChange={set(['day', 'daysPerTier'])} min={1} />
          <Num
            label="Số sao để tính là ngày tiến bộ"
            hint="Ít sao hơn vẫn sang ngày mới nhưng không tiến gần lên cấp"
            value={t.day.starsToAdvance}
            onChange={set(['day', 'starsToAdvance'])}
            min={1}
          />
          <Num
            label="Số ngày liền 3 sao để lên nhanh"
            hint="Đủ thì tính thêm 1 ngày tiến bộ"
            value={t.day.fastTrackDays}
            onChange={set(['day', 'fastTrackDays'])}
            min={1}
          />
          <Num
            label="Số ngày liền 0 sao để ôn lại"
            hint="Đủ thì tạm hạ 1 cấp tới khi bé đạt lại từ 1 sao"
            value={t.day.slumpDays}
            onChange={set(['day', 'slumpDays'])}
            min={1}
          />
          <Num
            label="Qua cấp cuối: số to thêm mỗi bậc"
            hint="Vd 1.25 = giá và phạm vi số nhân 1,25 lần mỗi bậc"
            value={t.day.beyondGrowth}
            onChange={set(['day', 'beyondGrowth'])}
            step={0.05}
          />
          <Num label="Số bậc tối đa sau cấp cuối" value={t.day.beyondLevels} onChange={set(['day', 'beyondLevels'])} />
          <Num label="Số câu mỗi lượt Luyện riêng" value={t.day.practiceQuestions} onChange={set(['day', 'practiceQuestions'])} min={1} />
          <Num
            label="Giây chờ thêm khi khách vừa tới"
            hint="Khách đang nói câu hỏi, chưa trừ kiên nhẫn"
            value={t.day.graceSeconds}
            onChange={set(['day', 'graceSeconds'])}
            step={0.5}
          />
          <Pct label="Trả lời sai trừ kiên nhẫn" value={t.day.wrongPenalty} onChange={set(['day', 'wrongPenalty'])} />
          <Pct label="Đúng ngay lần đầu để được 1 sao" value={t.day.stars[0]} onChange={set(['day', 'stars', 0])} />
          <Pct label="… để được 2 sao" value={t.day.stars[1]} onChange={set(['day', 'stars', 1])} />
          <Pct label="… để được 3 sao" value={t.day.stars[2]} onChange={set(['day', 'stars', 2])} />
        </div>
      </Section>

      <Section id="ages" title="Theo tuổi" desc="Cấp bắt đầu khi bé tạo hồ sơ, và khách chờ lâu gấp mấy lần cho bé nhỏ.">
        <table>
          <thead>
            <tr>
              <th>Tuổi</th>
              <th>Cấp khởi đầu</th>
              <th>Hệ số kiên nhẫn</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(t.ages).map(([age, row]) => (
              <tr key={age}>
                <td>{age} tuổi</td>
                <td>
                  <input type="number" min={1} max={t.tiers.length} value={row.startTier} onChange={(e) => set(['ages', age, 'startTier'])(toNum(e.target.value))} />
                </td>
                <td>
                  <input type="number" step={0.05} value={row.patience} onChange={(e) => set(['ages', age, 'patience'])(toNum(e.target.value))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section id="tiers" title="Cấp độ" desc="Bấm vào từng cấp để mở. Bé lên cấp tự động theo số ngày chơi.">
        <div className="inline">
          <span>Đặt số câu mỗi ngày cho mọi cấp:</span>
          <input type="number" min={1} value={allQuestions} onChange={(e) => setAllQuestions(toNum(e.target.value))} />
          <button
            disabled={!(allQuestions >= 1)}
            onClick={() => setT({ ...t, tiers: t.tiers.map((tier) => ({ ...tier, questions: allQuestions })) })}
          >
            Áp dụng
          </button>
        </div>
        {t.tiers.map((tier, i) => (
          <TierCard key={tier.id} tier={tier} set={(path, v) => set(['tiers', i, ...path])(v)} />
        ))}
      </Section>

      <Section id="coins" title="Xu thưởng">
        <div className="grid">
          <Num label="Xu mỗi khách mua xong" value={t.coins.perCustomer} onChange={set(['coins', 'perCustomer'])} />
          <Num label="Thưởng thêm nếu đúng ngay mọi câu" value={t.coins.perfectBonus} onChange={set(['coins', 'perfectBonus'])} />
          <Num label="Đào vàng: xu mỗi cục đúng" value={t.coins.goldPerCorrect} onChange={set(['coins', 'goldPerCorrect'])} />
          <Num label="Đào vàng: số giây mỗi lượt" value={t.coins.goldSeconds} onChange={set(['coins', 'goldSeconds'])} min={10} />
          <Num
            label="Lượt có thưởng mỗi ngày"
            hint="Riêng cho Đào vàng và Luyện riêng"
            value={t.coins.rewardRunsPerDay}
            onChange={set(['coins', 'rewardRunsPerDay'])}
          />
          <Num label="Rương xong 3 nhiệm vụ" value={t.coins.chest} onChange={set(['coins', 'chest'])} />
          <Num
            label="Trả lời sai bị trừ (xu)"
            hint="Trừ vào tiền lời của lượt đang chơi, không xuống dưới 0. 0 = không trừ"
            value={t.coins.mistakeCost}
            onChange={set(['coins', 'mistakeCost'])}
          />
          <Num label="Bé từ tuổi này mới bị trừ" value={t.coins.mistakeFromAge} onChange={set(['coins', 'mistakeFromAge'])} min={3} />
        </div>
        <h4>Quà điểm danh 7 ngày</h4>
        <div className="grid seven">
          {t.coins.checkin.map((v, i) => (
            <Num key={i} label={`Ngày ${i + 1}`} value={v} onChange={set(['coins', 'checkin', i])} />
          ))}
        </div>
      </Section>

      <Section id="quests" title="Nhiệm vụ hằng ngày" desc="Mỗi ngày chọn ngẫu nhiên 3 nhiệm vụ. Thay đổi áp dụng từ ngày hôm sau.">
        <table>
          <thead>
            <tr>
              <th>Nhiệm vụ</th>
              <th>Mục tiêu (N)</th>
              <th>Thưởng (xu)</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(t.quests) as QuestKind[]).map((k) => (
              <tr key={k}>
                <td>{QUESTS[k]}</td>
                <td>
                  <input type="number" min={1} value={t.quests[k].target} disabled={k === 'stars'} onChange={(e) => set(['quests', k, 'target'])(toNum(e.target.value))} />
                </td>
                <td>
                  <input type="number" value={t.quests[k].reward} onChange={(e) => set(['quests', k, 'reward'])(toNum(e.target.value))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section id="shop" title="Nâng cấp tiệm" desc="Tiền lời và thời gian chờ tính theo %, cộng dồn với nhau.">
        <h4>Cấp mặt tiền</h4>
        <table>
          <thead>
            <tr>
              <th>Cấp</th>
              <th>Tên</th>
              <th>Giá (xu)</th>
              <th>Tiền lời +%</th>
              <th>Khách chờ lâu hơn +%</th>
              <th>Thêm khách/ngày</th>
            </tr>
          </thead>
          <tbody>
            {t.shopLevels.map((l, i) => (
              <tr key={l.level}>
                <td>
                  <img className="thumb" src={`/img/shop-lv${l.level}.webp`} alt="" /> {l.level}
                </td>
                <td>
                  <input value={l.name} onChange={(e) => set(['shopLevels', i, 'name'])(e.target.value)} />
                </td>
                <td>
                  <input type="number" value={l.cost} disabled={l.level === 1} onChange={(e) => set(['shopLevels', i, 'cost'])(toNum(e.target.value))} />
                </td>
                <td>
                  <input type="number" step={5} value={Math.round(l.coins * 100)} onChange={(e) => set(['shopLevels', i, 'coins'])(toNum(e.target.value) / 100)} />
                </td>
                <td>
                  <input type="number" step={5} value={Math.round(l.patience * 100)} onChange={(e) => set(['shopLevels', i, 'patience'])(toNum(e.target.value) / 100)} />
                </td>
                <td>
                  <input type="number" value={l.customers} onChange={(e) => set(['shopLevels', i, 'customers'])(toNum(e.target.value))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h4>Đồ trang trí</h4>
        <table>
          <thead>
            <tr>
              <th>Tên</th>
              <th>Giá (xu)</th>
              <th>Tiền lời +%</th>
              <th>Khách chờ lâu hơn +%</th>
              <th>Thêm khách/ngày</th>
            </tr>
          </thead>
          <tbody>
            {t.upgrades.map((u, i) => (
              <tr key={u.id}>
                <td>
                  <input value={u.name} onChange={(e) => set(['upgrades', i, 'name'])(e.target.value)} />
                </td>
                <td>
                  <input type="number" value={u.cost} onChange={(e) => set(['upgrades', i, 'cost'])(toNum(e.target.value))} />
                </td>
                <td>
                  <input type="number" step={5} value={Math.round(u.coins * 100)} onChange={(e) => set(['upgrades', i, 'coins'])(toNum(e.target.value) / 100)} />
                </td>
                <td>
                  <input type="number" step={5} value={Math.round(u.patience * 100)} onChange={(e) => set(['upgrades', i, 'patience'])(toNum(e.target.value) / 100)} />
                </td>
                <td>
                  <input type="number" value={u.customers} onChange={(e) => set(['upgrades', i, 'customers'])(toNum(e.target.value))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        id="farm"
        title="Nông trại"
        desc="Mỗi lần mở cửa bán hàng, mỗi cây được bón thêm 1 lần. Cây chín cho nông sản; khách ở tiệm mua nông sản thì bé được thêm xu mỗi món."
      >
        <div className="grid">
          <Num label="Ít nhất bấy nhiêu món trên kệ mới mở sạp" value={t.farm.minShelf} onChange={set(['farm', 'minShelf'])} min={1} />
          {t.farm.crops.map((c) => (
            <Num
              key={c.id}
              label={`Có sẵn khi mới chơi: ${c.name}`}
              value={t.farm.starter[c.id] ?? 0}
              onChange={set(['farm', 'starter', c.id])}
            />
          ))}
        </div>
        <h4>Ao cá</h4>
        <div className="grid">
          <Num label="Giá đào ao (xu)" value={t.farm.pond.cost} onChange={set(['farm', 'pond', 'cost'])} />
          <Num label="Số giây một lượt câu" value={t.farm.pond.seconds} onChange={set(['farm', 'pond', 'seconds'])} min={10} />
          <Num label="Xô đựng tối đa (con mỗi lượt)" value={t.farm.pond.bucket} onChange={set(['farm', 'pond', 'bucket'])} min={1} />
          <Num label="Sai / hết giờ bấy nhiêu lần thì cá sổng" value={t.farm.pond.misses} onChange={set(['farm', 'pond', 'misses'])} min={1} />
        </div>
        <table>
          <thead>
            <tr>
              <th>Loại cá</th>
              <th>Số con trong ao</th>
              <th>Số phép khi vùng vẫy</th>
              <th>Giây mỗi phép</th>
              <th>Độ khó (± cấp)</th>
              <th>Giá gốc</th>
              <th>Xu lời mỗi con</th>
            </tr>
          </thead>
          <tbody>
            {t.farm.pond.fish.map((f, i) => (
              <tr key={f.id}>
                <td>{f.name}</td>
                {(['count', 'questions', 'seconds', 'tierShift', 'price', 'bonus'] as const).map((k) => (
                  <td key={k}>
                    <input
                      type="number"
                      value={f[k]}
                      min={k === 'tierShift' ? -5 : k === 'bonus' ? 0 : 1}
                      onChange={(e) => set(['farm', 'pond', 'fish', i, k])(toNum(e.target.value))}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <h4>Cỡ ruộng theo từng lần mở rộng</h4>
        <table>
          <thead>
            <tr>
              <th>Lần</th>
              <th>Số cột</th>
              <th>Số hàng</th>
              <th>Giá (xu)</th>
            </tr>
          </thead>
          <tbody>
            {t.farm.fields.map((f, i) => (
              <tr key={i}>
                <td>{i === 0 ? 'Có sẵn' : `Mở rộng ${i}`}</td>
                <td>
                  <input type="number" min={1} value={f.cols} onChange={(e) => set(['farm', 'fields', i, 'cols'])(toNum(e.target.value))} />
                </td>
                <td>
                  <input type="number" min={1} value={f.rows} onChange={(e) => set(['farm', 'fields', i, 'rows'])(toNum(e.target.value))} />
                </td>
                <td>
                  <input type="number" value={f.cost} disabled={i === 0} onChange={(e) => set(['farm', 'fields', i, 'cost'])(toNum(e.target.value))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h4>Cây trồng (tính cho mỗi ô)</h4>
        <table>
          <thead>
            <tr>
              <th>Tên</th>
              <th>Mở từ ngày</th>
              <th>Giá 1 lần bón (xu)</th>
              <th>Số lần bón</th>
              <th>Thu được</th>
              <th>Giá gốc trên bảng (xu)</th>
              <th>Lời thêm xu/món</th>
            </tr>
          </thead>
          <tbody>
            {t.farm.crops.map((c, i) => (
              <tr key={c.id}>
                <td>
                  <input value={c.name} onChange={(e) => set(['farm', 'crops', i, 'name'])(e.target.value)} />
                </td>
                <td>
                  <input type="number" min={1} value={c.unlockDay} onChange={(e) => set(['farm', 'crops', i, 'unlockDay'])(toNum(e.target.value))} />
                </td>
                <td>
                  <input type="number" value={c.fertilizer} onChange={(e) => set(['farm', 'crops', i, 'fertilizer'])(toNum(e.target.value))} />
                </td>
                <td>
                  <input type="number" min={1} value={c.feeds} onChange={(e) => set(['farm', 'crops', i, 'feeds'])(toNum(e.target.value))} />
                </td>
                <td>
                  <input type="number" min={1} value={c.harvest} onChange={(e) => set(['farm', 'crops', i, 'harvest'])(toNum(e.target.value))} />
                </td>
                <td>
                  <input type="number" min={1} value={c.price} onChange={(e) => set(['farm', 'crops', i, 'price'])(toNum(e.target.value))} />
                </td>
                <td>
                  <input type="number" value={c.bonus} onChange={(e) => set(['farm', 'crops', i, 'bonus'])(toNum(e.target.value))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        id="customers"
        title="Khách hàng"
        desc="Tên gọi dùng trong lời thoại (vd “Bà mua 1 kẹo…”). Kiên nhẫn ≥ 1.3 hiện nhãn Thong thả, ≤ 0.8 hiện Vội vàng."
      >
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Tên gọi</th>
              <th>Hệ số kiên nhẫn</th>
            </tr>
          </thead>
          <tbody>
            {t.customers.map((c, i) => (
              <tr key={c.id}>
                <td>
                  <img className="thumb" src={`/img/cust-${c.id}.webp`} alt="" />
                </td>
                <td>
                  <input value={c.title} onChange={(e) => set(['customers', i, 'title'])(e.target.value)} />
                </td>
                <td>
                  <input type="number" step={0.05} value={c.patience} onChange={(e) => set(['customers', i, 'patience'])(toNum(e.target.value))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  )
}
