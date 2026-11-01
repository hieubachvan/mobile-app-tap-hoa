# Tiệm Tạp Hóa Cậu Lớn

Web app mobile-first giúp trẻ 3–10 tuổi luyện tính toán qua trò chơi bán hàng: bé làm chủ tiệm tạp hóa, tính tiền và thối tiền cho khách, chơi mini game Đào vàng, tích xu để nâng cấp tiệm.

## Chạy dự án

Cần Node.js 18 trở lên.

```bash
npm install        # cài thư viện (lần đầu)
npm run dev        # chạy như bé chơi thật
npm run dev:test   # chế độ test: sẵn 100.000 xu và nút 🛠 Dev
npm run config     # mở trang cấu hình thông số game (chỉ trên máy này)
npm run build      # build bản phát hành vào thư mục dist/
npm run preview    # xem thử bản build
```

Mở http://localhost:5173. Trên điện thoại cùng wifi, dùng địa chỉ **Network** mà terminal in ra.

Số xu của chế độ test chỉnh trong `.env.test`. Chế độ test lưu dữ liệu riêng và không có trong bản build.

## Tính năng

- **Bán hàng theo ngày:** 9 cấp độ khó, từ đếm hàng đến cộng trừ nhân chia (có chia có dư). Cấp khởi đầu theo tuổi, cứ 2 ngày lên một cấp.
- **Phố sống động:** mở tiệm thì cửa cuốn kéo lên; khách đi dọc vỉa hè vào quầy, mua xong xách túi đi, xu bay về ô xu; người qua đường ghé tiệm; bé chạm vào đồ trang trí, người đi đường thì chúng nhún nhảy.
- **Khách có độ kiên nhẫn:** chờ lâu quá thì khách bỏ về, tiệm mất sao. Khách đi tới quầy rồi mới bắt đầu tính giờ.
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
  scene/       cảnh phố trước tiệm vẽ bằng PixiJS: người qua đường, khách vào quầy, cửa cuốn, hiệu ứng
  components/  thành phần dùng chung (StreetScene bọc cảnh PixiJS cho React)
public/img/    hình đã xử lý (tách nền, cắt sát) dùng trong game
*.png          hình gốc (ở thư mục gốc)
```

## Cấu hình thông số game

Mọi con số chỉnh độ khó và kinh tế xu nằm trong `src/game/tuning.json`: số câu mỗi ngày, thời gian chờ, ngưỡng sao, 9 cấp độ, xu thưởng, nhiệm vụ, giá nâng cấp, tên gọi và độ kiên nhẫn của khách.

Chạy `npm run config` để sửa bằng giao diện (http://localhost:5173/config.html). Bấm **Lưu** sẽ ghi vào file JSON, tab game đang mở tự tải lại để thử ngay.

- Trang cấu hình chỉ có khi chạy dev server và chỉ mở được từ chính máy đó. Điện thoại cùng wifi bị chặn (403).
- Trang không có trong bản build, nên người chơi không bao giờ thấy.
- Người chơi chỉ nhận thông số mới khi build lại và phát hành bản mới.

## Deploy lên VPS

Bản web chạy ở VPS bằng Docker, trong thư mục `/opt/tap-hoa`:

- `tap-hoa-web` (Nginx, cổng 8080): phục vụ game và chuyển `/config/` sang container cấu hình.
- `tap-hoa-config` (`server/config-server.mjs`): trang cấu hình có mật khẩu. Bấm Lưu thì ghi `/opt/tap-hoa/data/tuning.json` và build lại bản web ngay.

Deploy lại sau khi push code lên GitHub:

```bash
ssh root@<ip-vps> sh /opt/tap-hoa/app/deploy/deploy.sh
```

Thông số đã chỉnh trên VPS nằm ở `/opt/tap-hoa/data`, nên deploy lại không bị mất. Mật khẩu trang cấu hình chỉ lưu dạng băm trong `/opt/tap-hoa/config.env` (`CONFIG_PASS_HASH=scrypt:<salt>:<hash>`). App Android không đổi theo trang cấu hình trên VPS: bấm **Tải JSON**, chép vào `src/game/tuning.json` rồi build app.
