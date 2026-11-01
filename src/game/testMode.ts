/** Bật khi chạy `npm run dev:test` (vite --mode test); bản build phát hành luôn là false */
export const TEST_MODE = import.meta.env.MODE === 'test'

/** Số xu tối thiểu mỗi lần mở app ở chế độ test, chỉnh trong file .env.test */
export const TEST_COINS = Number(import.meta.env.VITE_TEST_COINS) || 100000
