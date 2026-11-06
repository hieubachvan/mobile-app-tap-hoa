import { exprToSpeech, genDrill, makeChoices } from './questions'
import { pick } from './random'

/** Một câu hỏi đuổi chuột (bài tư duy hình học) */
export interface CoopQuestion {
  /** Lớp 1–5 */
  grade: number
  /** Đề bài hiện trên màn hình */
  prompt: string
  /** Ảnh minh hoạ (đặt trong public/img/coop/q/...), không bắt buộc */
  image?: string
  /** Các đáp án để bé chọn: chữ hoặc số */
  choices: string[]
  /** Chỉ số đáp án đúng trong `choices` (đếm từ 0) */
  answer: number
  /** Câu đọc to; bỏ trống thì đọc `prompt` */
  speech?: string
}

/**
 * Bộ câu hỏi soạn tay. Mỗi lớp chưa có câu nào thì game tạm dùng phép tính theo cấp của bé.
 * Ví dụ:
 * { grade: 1, prompt: 'Hình nào có 3 cạnh?', image: '/img/coop/q/g1-tamgiac.png',
 *   choices: ['Hình vuông', 'Hình tam giác', 'Hình tròn'], answer: 1 },
 */
export const COOP_QUESTIONS: CoopQuestion[] = []

/** Lớp theo tuổi: 6 tuổi lớp 1 … 10 tuổi lớp 5 (bé chưa đi học tính như lớp 1) */
export const gradeOf = (age: number) => Math.max(1, Math.min(5, age - 5))

/** Câu tạm khi lớp chưa có câu soạn tay */
function placeholder(grade: number, tier: number): CoopQuestion {
  const d = genDrill(tier)
  const choices = makeChoices(d.answer, 3)
  return {
    grade,
    prompt: `${d.expr} = ?`,
    choices: choices.map(String),
    answer: choices.indexOf(d.answer),
    speech: exprToSpeech(d.expr),
  }
}

/** `skip`: câu vừa hỏi, để không hỏi lại ngay */
export function pickCoopQuestion(grade: number, tier: number, skip?: CoopQuestion): CoopQuestion {
  const pool = COOP_QUESTIONS.filter((q) => q.grade === grade)
  if (!pool.length) return placeholder(grade, tier)
  const rest = pool.length > 1 ? pool.filter((q) => q !== skip) : pool
  return pick(rest)
}
