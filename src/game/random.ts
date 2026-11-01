export const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

export const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Các số gần đáp án (không âm, không trùng) để làm phương án nhiễu. */
export function distractors(answer: number, count: number): number[] {
  const spread = Math.max(3, Math.round(answer * 0.3))
  const out = new Set<number>()
  let guard = 0
  while (out.size < count && guard++ < 200) {
    const d = answer + rand(-spread, spread)
    if (d !== answer && d >= 0) out.add(d)
  }
  let n = answer + 1
  while (out.size < count) out.add(n++)
  return [...out]
}
