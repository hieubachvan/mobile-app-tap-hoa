# Khai báo Play Console – Tiệm Tạp Hóa Cậu Lớn

Cách trả lời các mục trong **Play Console → Policy and programs → App content**. Tên nút và câu hỏi
trong Play Console có thể khác đôi chút theo thời gian; chọn đáp án có ý nghĩa tương ứng.

## 0. Kiểm tra project Android trước khi khai

Data safety chỉ khai "không thu thập" được khi wrapper Android cũng sạch:

- [ ] Không có Firebase, Crashlytics, Analytics, AdMob hay SDK quảng cáo/theo dõi nào trong `build.gradle`.
- [ ] Manifest đã merge **không** có quyền `com.google.android.gms.permission.AD_ID`. Xem trong
      Android Studio → `AndroidManifest.xml` → tab *Merged Manifest*. Nếu có thư viện tự thêm vào, chặn bằng:
      ```xml
      <uses-permission android:name="com.google.android.gms.permission.AD_ID" tools:node="remove" />
      ```
- [ ] Chỉ xin quyền thật sự cần (thường chỉ `INTERNET`, hoặc không cần quyền nào nếu đã đóng gói font).
- [ ] WebView không cho mở link ra ngoài app (app hiện không có link nào).

## 1. Privacy policy

- File: [privacy-policy.html](privacy-policy.html). Điền `[TÊN NHÀ PHÁT TRIỂN]` và `[EMAIL LIÊN HỆ]` (2 chỗ: phần
  tiếng Việt và tiếng Anh).
- Đăng lên một URL công khai, ai cũng mở được, không cần đăng nhập. Ví dụ:
  - **GitHub Pages:** repo public → Settings → Pages → chọn branch `main`, thư mục `/docs`
    → URL dạng `https://<user>.github.io/<repo>/privacy-policy.html`
  - **Google Sites:** tạo trang mới và dán nội dung vào.
- Dán URL vào **App content → Privacy policy**.

## 2. Ads

- *Does your app contain ads?* → **No, my app does not contain ads**

## 3. App access

- → **All functionality in my app is available without any access restrictions**

## 4. Content rating (bảng câu hỏi IARC)

- Email: email liên hệ của bạn
- Category: **Game** (nếu chọn danh mục Giáo dục thì chọn *Reference, News, or Educational*; bảng câu hỏi chỉ khác chút ít)
- Trả lời **No** cho tất cả các nhóm câu hỏi:
  - Violence / Bạo lực: No
  - Fear / Sợ hãi: No
  - Sexuality / Tình dục: No
  - Gambling / Cờ bạc (kể cả mô phỏng): No. Xu trong game kiếm bằng cách giải toán, rương thưởng cố định, không ngẫu nhiên.
  - Language / Ngôn ngữ thô tục: No
  - Controlled substances / Chất cấm: No
  - Crude humor / Hài thô: No
  - *Users can interact or exchange content*: No
  - *Shares user's current location*: No
  - *Allows users to purchase digital goods*: No
  - *Web browser or search engine*: No
- Kết quả dự kiến: **3+ / Everyone / PEGI 3**.

## 5. Target audience and content

- Target age groups: tick **5 and under**, **6–8**, **9–12**. Không tick nhóm 13+.
  - Cũng có thể bỏ "5 and under" nếu muốn bớt chặt, nhưng app thiết kế cho 3 tuổi nên tick là đúng.
- Vì có nhóm dưới 13 tuổi nên app thuộc **Families Policy**. Play Console sẽ hỏi thêm:
  - *Could your app unintentionally appeal to children?* → không áp dụng, vì app dành cho trẻ em.
  - Ads: không có quảng cáo, nên không cần SDK quảng cáo được chứng nhận cho Families.
- Store listing phải phù hợp với trẻ em, không ghi "dành cho mọi lứa tuổi" theo kiểu gây hiểu nhầm.
- (Tuỳ chọn) Có thể đăng ký **Teacher Approved** sau khi app lên Production.

## 6. Data safety

- *Does your app collect or share any of the required user data types?* → **No**
  - Tên và tuổi của bé chỉ lưu trên máy và không rời khỏi thiết bị. Theo định nghĩa của Google, dữ liệu chỉ xử lý
    trên thiết bị thì **không** tính là "collected".
- Nếu được hỏi *Is all of the user data collected by your app encrypted in transit?* hoặc
  *Do you provide a way for users to request that their data is deleted?*: các câu này thường bị ẩn khi đã chọn
  "No". Nếu vẫn hiện thì trả lời theo thực tế (xóa bằng cách gỡ app hoặc *Xóa dữ liệu*).
- **Lưu ý:** nếu sau này thêm analytics, crash report, TTS online, đăng nhập hay quảng cáo thì phải khai lại mục này và
  cập nhật privacy policy.

## 7. Advertising ID

- *Does your app use advertising ID?* → **No** (nhớ kiểm tra Merged Manifest ở mục 0)

## 8. Các mục còn lại

| Mục | Trả lời |
|---|---|
| Government apps | No |
| Financial features | My app doesn't provide any financial features |
| Health | My app does not have any health features |
| News apps | No |
| COVID-19 apps (nếu còn hiện) | Not a publicly available COVID-19 app |
| Data deletion / Account | Không có tài khoản, nên không cần URL xóa tài khoản |

## Ghi chú kỹ thuật

- Request mạng duy nhất còn lại là **Google Fonts** (font Baloo 2 trong `index.html`). Việc tải font không tính là
  thu thập dữ liệu, nhưng nên đóng gói font vào app để vừa chạy offline vừa bỏ hẳn kết nối ra ngoài.
- Giọng đọc chỉ dùng giọng tiếng Việt có sẵn trên máy. Máy không có giọng Việt thì app im lặng.
