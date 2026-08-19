# Chi tiêu cá nhân (Web App)

App quản lý chi tiêu cá nhân chạy trong trình duyệt, hỗ trợ **Firebase Firestore** làm database chính.

## Cách chạy nhanh
1. Cấu hình Firebase (xem bên dưới).
2. Mở `index.html` bằng trình duyệt hoặc chạy server tĩnh (Live Server).
3. Vào tab **Cài đặt** để kiểm tra trạng thái kết nối Firestore.

---

## Setup Firebase Firestore (bắt buộc để dùng cloud database)

### Bước 1: Tạo Web App trong Firebase
1. Vào [Firebase Console](https://console.firebase.google.com/) → project **quanlychitieu**
2. Bấm biểu tượng **Web** (`</>`) để thêm app web (nếu chưa có)
3. Copy đoạn config (có `apiKey`, `projectId`, `appId`, ...)

### Bước 2: Bật Authentication (Anonymous)
1. Sidebar → **Authentication** (hoặc tìm "Authentication")
2. **Get started** → tab **Sign-in method**
3. Bật **Anonymous** → Save

> App dùng đăng nhập ẩn danh để Firestore cho phép đọc/ghi theo rules.

### Bước 3: Cấu hình Firestore Rules
1. Vào **Firestore Database** → tab **Rules**
2. Dán rules sau:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /appData/{docId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

3. **Publish**

### Bước 4: Điền config vào project
Mở file `firebase-config.js` và thay các giá trị `YOUR_*` bằng config từ Firebase Console:

```js
window.FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "quanlychitieu.firebaseapp.com",
  projectId: "quanlychitieu",
  storageBucket: "quanlychitieu.firebasestorage.app",
  messagingSenderId: "...",
  appId: "...",
};
```

### Bước 5: Chạy app
- Mở `index.html` (hoặc Live Server)
- Lần đầu: app tự tạo document `appData/main` trên Firestore với dữ liệu mẫu
- Mỗi lần thêm/sửa/xóa: app tự ghi lên Firestore

### Cấu trúc dữ liệu trên Firestore
```
appData (collection)
  └── main (document)
        ├── version
        ├── settings
        ├── accounts[]
        ├── categories[]
        ├── transactions[]
        └── budgets[]
```

---

## Các màn hình
- **Dashboard**: Tổng thu/chi, biểu đồ, số dư tài khoản, ngân sách
- **Giao dịch**: CRUD + lọc/tìm kiếm
- **Danh mục**: Quản lý danh mục Thu/Chi
- **Ngân sách**: Giới hạn chi tiêu theo tháng
- **Cài đặt**: Tiền tệ, tài khoản, trạng thái Firebase

## Export / Import
- **Xuất JSON / data.json / CSV**: backup hoặc mở bằng Excel
- **Import JSON/CSV**: nạp dữ liệu vào app (và sync lên Firestore nếu đã kết nối)

## Fallback (nếu chưa cấu hình Firebase)
App vẫn chạy với thứ tự ưu tiên:
1. Firebase Firestore (nếu `firebase-config.js` hợp lệ)
2. Backend Node (`node server.js` + `/api/data`)
3. File `data.json` tĩnh
4. `localStorage` trình duyệt

## Deploy lên web
- **Firebase Hosting** (khuyên dùng): deploy folder này, Firestore đã sẵn trong cùng project
- **GitHub Pages**: chỉ chạy frontend; Firestore vẫn hoạt động nếu config đúng

## Lưu ý bảo mật
- Rules trên chỉ cho user đã auth (anonymous) đọc/ghi `appData/*`
- Với app cá nhân 1 người dùng thì ổn; nếu public nhiều người, nên thêm Email/Google sign-in và rules theo `uid`
