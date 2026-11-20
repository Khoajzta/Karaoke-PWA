# Karaoke Đồng Bộ Thời Gian Thực (Kara-Sync PWA)

Ứng dụng web Karaoke Đồng Bộ Thời Gian Thực (Real-time Sync Karaoke) đa nền tảng, cho phép Host (PC/Smart TV) và Member (Điện thoại/Tablet) cùng xem chung một video YouTube không độ trễ để hát song ca hoàn hảo.

---

## 🚀 Tính năng nổi bật

1. **Cơ chế Đồng bộ Video Siêu Chính Xác (Core Sync Engine):**
   - Sử dụng `.info/serverTimeOffset` của Firebase RTDB để đồng bộ mốc thời gian giữa mọi thiết bị.
   - Khi Host Play, lưu `anchorServerTime = (Date.now() + serverTimeOffset) - (T_video * 1000)`.
   - Vòng lặp Member kiểm tra mỗi `1000ms`:
     - Nếu độ lệch `|diff| > 0.4s`: Tự động gọi `player.seekTo(targetTime, true)` để nhảy mốc.
     - Nếu độ lệch `0.1s < |diff| <= 0.4s`: Tự động tinh chỉnh tốc độ `1.05x` hoặc `0.95x` trong `1.5 giây` để bắt kịp mượt mà mà không giật hình.
2. **Phân quyền chặt chẽ:**
   - **Tạo phòng (Host):** Bắt buộc tài khoản Google. Tự động sinh mã phòng 6 ký tự (VD: `KARA88`) và tạo liên kết kèm mã QR.
   - **Vào phòng (Member):** Hỗ trợ cả tài khoản Google hoặc tài khoản Khách (`signInAnonymously` kèm tên tuỳ chọn).
   - **Host:** Kéo thả đổi thứ tự bài hát (`@dnd-kit`), xóa bài, bấm "Phát ngay", Play / Pause / Seek.
   - **Member:** Tìm kiếm bài hát hoặc dán link YouTube để đưa vào hàng chờ (`queue`).
3. **Tối ưu Mobile & Trải nghiệm Hát Song Ca:**
   - **Chống vọng âm (Mute by default):** Tự động mute trên máy Member khi vào phòng để chống vọng tiếng với loa chính và vượt rào cản chặn Autoplay trên thiết bị di động. Có nút bật/tắt tiếng tức thì.
   - **Screen Wake Lock:** Tích hợp `navigator.wakeLock.request('screen')` giữ cho màn hình điện thoại luôn sáng khi đang hát.
   - **Responsive UX:**
     - Máy tính (Host): 70% bên trái là màn hình video + thanh điều khiển + mã QR; 30% bên phải là danh sách bài chờ và tìm kiếm.
     - Điện thoại (Member): Video được ghim cố định phía trên (Sticky Top) để luôn nhìn rõ lời bài hát khi cuộn chọn bài.
4. **Tìm kiếm & Dán link linh hoạt:**
   - Tìm kiếm bài hát qua **YouTube Data API v3** (tự động đính kèm từ khóa `"karaoke"`).
   - Hoặc dán trực tiếp **URL YouTube bất kỳ** (hỗ trợ trích xuất Regex `videoId` và tự lấy tiêu đề/ảnh thu nhỏ qua oEmbed mà không tốn quota API).

---

## 🛠️ Cài đặt & Khởi chạy

### 1. Cài đặt thư viện
```bash
npm install
```

### 2. Cấu hình Firebase & YouTube API
Bạn có thể cấu hình nhanh trực tiếp trên giao diện bằng nút **Cài đặt (biểu tượng bánh răng)** ở góc trên cùng bên phải, hoặc tạo file `.env` từ `.env.example`:

```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-app.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your-app-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=your-app
VITE_FIREBASE_STORAGE_BUCKET=your-app.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef...

# (Tùy chọn) YouTube Data API v3 Key cho tính năng tìm kiếm bài hát
VITE_YOUTUBE_API_KEY=AIzaSy...
```

### 3. Cấu hình Firebase Realtime Database Rules
Trong Firebase Console -> Realtime Database -> Rules, thiết lập quyền đọc ghi:
```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": "auth != null"
      }
    }
  }
}
```

### 4. Bật Authentication Providers
Trong Firebase Console -> Authentication -> Sign-in method:
- Bật **Google**
- Bật **Anonymous (Khách)**

### 5. Chạy môi trường Development
```bash
npm run dev
```

### 6. Build Production
```bash
npm run build
```

---

## Tiến độ cập nhật (19/11/2026)

- Tối ưu giao diện mobile cho danh sách chờ và tìm kiếm bài hát: tăng khả năng đọc, tránh tràn tiêu đề, thu gọn khoảng đệm và làm vùng chạm của các nút rõ ràng hơn.
- Tối ưu điều khiển video trên mobile: sắp xếp các nhóm nút host thành các hàng riêng, tăng vùng chạm để thao tác phát, tạm dừng và tua thuận tiện hơn.
- Tối ưu Navbar mobile cho member: ẩn nút QR của host, làm rõ mã phòng và tăng vùng chạm cho các nút sao chép, danh sách thành viên, rời phòng và cài đặt.
- Sửa xử lý khi video kết thúc mà hàng chờ trống: lưu vị trí cuối video vào `pausedAt` để player dừng tại khung hình cuối thay vì tua về đầu.
- Bổ sung nút **Đồng bộ host** trong `HostControls`: lấy thời gian thực từ YouTube player của host và cập nhật mốc đồng bộ Firebase để các thiết bị căn theo vị trí host.

### Trạng thái kiểm tra

- `npm run build` đã thành công ở lần chạy trước các cập nhật Navbar và đồng bộ host; Vite có cảnh báo bundle JavaScript lớn hơn 500 kB.
- Project chưa khai báo script `test`, vì vậy chưa có lệnh kiểm thử tự động.
- Cần chạy lại build sau các cập nhật mới nhất.
