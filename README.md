# Tiệm Tạp Hóa Cậu Lớn

Web app mobile-first giúp trẻ 3–10 tuổi luyện tính toán qua trò chơi bán hàng: bé làm chủ tiệm tạp hóa, tính tiền và thối tiền cho khách, chơi mini game Đào vàng, tích xu để nâng cấp tiệm.

## Chạy dự án

Cần Node.js 18 trở lên.

```bash
npm install        # cài thư viện (lần đầu)
npm run dev        # chạy như bé chơi thật
npm run dev:test   # chế độ test: sẵn 100.000 xu và nút 🛠 Dev
npm run build      # build bản phát hành vào thư mục dist/
npm run preview    # xem thử bản build
```

Mở http://localhost:5173. Trên điện thoại cùng wifi, dùng địa chỉ **Network** mà terminal in ra.

Số xu của chế độ test chỉnh trong `.env.test`. Chế độ test lưu dữ liệu riêng và không có trong bản build.

## Tính năng

- **Bán hàng theo ngày:** 9 cấp độ khó, từ đếm hàng đến cộng trừ nhân chia (có chia có dư). Cấp khởi đầu theo tuổi, cứ 2 ngày lên một cấp.
- **Khách có độ kiên nhẫn:** chờ lâu quá thì khách bỏ về, tiệm mất sao.
- **Gợi ý trực quan:** chấm tròn cho phép cộng/trừ, túi chia đều cho phép chia. Câu hỏi được đọc bằng giọng tiếng Việt.
- **Luyện riêng** từng phép tính ➕ ➖ ✖️ ➗.
- **Đào vàng:** gắp cục vàng có đúng kết quả.
- **Nâng cấp tiệm:** 5 cấp mặt tiền và 11 món đồ, mở thêm hàng mới, thêm tiền lời và khách.
- **Điểm danh mỗi ngày:** chuỗi 7 ngày và 3 nhiệm vụ hằng ngày.

Tiến độ của bé lưu trong trình duyệt (localStorage).

## Cấu trúc

```
src/
  game/        logic: cấp độ, sinh câu hỏi, nâng cấp, nhiệm vụ, lưu trữ, âm thanh
  screens/     các màn hình: Chào, Tiệm, Bán hàng, Đào vàng, Luyện riêng, Nâng cấp, Nhiệm vụ
  components/  thành phần dùng chung
public/img/    hình đã xử lý (tách nền, cắt sát) dùng trong game
*.png          hình gốc (ở thư mục gốc)
```

Các con số chỉnh độ khó và kinh tế xu nằm trong `src/game/levels.ts`, `src/game/upgrades.ts`, `src/game/shopLevels.ts` và `src/game/daily.ts`.
