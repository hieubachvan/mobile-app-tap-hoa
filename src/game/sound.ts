let ctx: AudioContext | null = null
let enabled = true

export function setSoundEnabled(on: boolean) {
  enabled = on
  if (!on) stopSpeaking()
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.18) {
  if (!enabled) return
  ctx ??= new AudioContext()
  const t0 = ctx.currentTime + start
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  gain.gain.setValueAtTime(vol, t0)
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  osc.connect(gain).connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + dur)
}

export const sfx = {
  tap: () => tone(660, 0, 0.06, 'triangle', 0.1),
  correct: () => [523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.18, 'triangle')),
  wrong: () => [220, 180].forEach((f, i) => tone(f, i * 0.12, 0.2, 'sawtooth', 0.08)),
  coin: () => [988, 1319].forEach((f, i) => tone(f, i * 0.07, 0.25, 'square', 0.06)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle')),
  shoot: () => tone(300, 0, 0.12, 'square', 0.05),
  /** Chuông cửa khi khách bước vào tiệm */
  bell: () => [1568, 1319].forEach((f, i) => tone(f, i * 0.16, 0.5, 'sine', 0.12)),
  /** Cửa cuốn kéo lên */
  shutter: () => [0, 1, 2, 3, 4, 5, 6, 7].forEach((i) => tone(140 + i * 18, i * 0.09, 0.07, 'square', 0.035)),
  /** Bé chạm vào đồ vật, người đi đường */
  pop: () => tone(880, 0, 0.08, 'sine', 0.1),
}

// ---------- Đọc tiếng Việt ----------

const hasSynth = typeof window !== 'undefined' && 'speechSynthesis' in window
let viVoice: SpeechSynthesisVoice | null = null
let voicesLoaded = false

/** Ưu tiên giọng tự nhiên (Edge "HoaiMy Online", Google, iOS "Linh") */
function pickVietnameseVoice() {
  if (!hasSynth) return
  const voices = window.speechSynthesis.getVoices()
  if (voices.length === 0) return
  voicesLoaded = true
  const vi = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('vi'))
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|online|neural/i.test(v.name) ? 4 : 0) + (/google/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1)
  viVoice = vi.sort((a, b) => score(b) - score(a))[0] ?? null
}

if (hasSynth) {
  pickVietnameseVoice()
  window.speechSynthesis.addEventListener('voiceschanged', pickVietnameseVoice)
}

function stopSpeaking() {
  if (hasSynth) window.speechSynthesis.cancel()
}

/** Đọc to câu hỏi bằng giọng tiếng Việt (cho bé chưa biết đọc) */
export function speak(text: string) {
  if (!enabled) return
  stopSpeaking()
  if (!voicesLoaded) pickVietnameseVoice()
  if (!hasSynth || !viVoice) {
    // Không có giọng Việt trên máy: im lặng, không để giọng tiếng Anh đọc chữ Việt.
    // Không dùng TTS online để app không gửi lời thoại (có tên bé) ra ngoài.
    return
  }
  const u = new SpeechSynthesisUtterance(text)
  u.voice = viVoice
  u.lang = viVoice.lang
  u.rate = 0.9
  u.pitch = 1.1
  window.speechSynthesis.speak(u)
}
