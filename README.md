# 🎯 Hệ thống quản lý lấy số LaySo

## 📋 Tổng quan
Hệ thống quản lý hàng đợi thông minh cho các trung tâm phục vụ hành chính công. Hỗ trợ lấy số, gọi số, đánh giá dịch vụ và báo cáo thống kê.

## 🚀 Tính năng chính

### 👥 Khách hàng
- **Lấy số thứ tự**: Chọn dịch vụ và nhận số thứ tự
- **In tự động**: Tích hợp máy in POS để in phiếu số
- **Đánh giá dịch vụ**: Đánh giá chất lượng phục vụ sau khi hoàn thành

### 👤 Nhân viên
- **Gọi số tiếp theo**: Gọi khách hàng theo thứ tự
- **Gọi lại**: Gọi lại số vừa gọi nếu cần
- **Màn hình hiển thị**: Hiển thị số đang gọi cho khách hàng
- **Thống kê**: Xem số liệu hàng đợi realtime

### 👨‍💼 Quản trị viên
- **Báo cáo nâng cao**: Thống kê đánh giá chi tiết
- **Xuất Excel**: Xuất dữ liệu đánh giá ra file Excel
- **Quản lý tài khoản**: Tạo/xóa tài khoản nhân viên
- **Reset hệ thống**: Reset số thứ tự mỗi ngày

## 🛠️ Cấu trúc API

### 🔢 Quản lý số thứ tự
- `POST /get-number` - Lấy số mới
- `POST /call-next` - Gọi số tiếp theo
- `POST /recall-last` - Gọi lại số cuối
- `GET /current-numbers` - Số hiện tại các dịch vụ
- `POST /reset-numbers` - Reset tất cả số về 0

### ⭐ Quản lý đánh giá
- `POST /submit-rating` - Gửi đánh giá
- `GET /ratings-report` - Báo cáo chi tiết
- `GET /export-excel` - Xuất Excel tổng quát
- `GET /export-ratings-excel` - Xuất Excel đánh giá

### 👤 Quản lý người dùng
- `POST /login` - Đăng nhập
- `POST /create-account` - Tạo tài khoản
- `GET /users` - Danh sách tài khoản
- `DELETE /delete-account/:username` - Xóa tài khoản
- `POST /change-password` - Đổi mật khẩu

### 📊 Thống kê
- `GET /stats` - Thống kê tổng quan
- `GET /services` - Danh sách dịch vụ

## 🔧 Cài đặt & Chạy

### Yêu cầu
- Node.js ≥ 14.0.0
- MongoDB Atlas
- Máy in POS (tùy chọn)

### Cài đặt
```bash
npm install
npm start
```

## 🌟 Dịch vụ hỗ trợ
1. Đăng ký kinh doanh
2. Đăng ký đầu tư  
3. Quy hoạch - Xây dựng
4. Đất đai
5. Tài nguyên - Môi trường
6. Lao động - Thương binh xã hội
7. Y tế
8. Giáo dục
9. Nông nghiệp
10. Thuế
11. Hải quan
12. Tư pháp
13. Khác

---
*Phát triển bởi LaySo Team - Giải pháp quản lý hàng đợi thông minh* 🎯
