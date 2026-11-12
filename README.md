# Weekplan

Lịch tuần và tổng quan kỳ học. Kéo chọn thời gian, đặt giờ riêng cho từng ngày và tạo lịch lặp theo tuần. Lịch tuần mặc định từ 06:00 đến 24:00.

## Chạy trên máy

Dùng Node.js 22 trở lên và Bash.

```sh
npm run build
npm run validate
npm run dev
```

Mở http://localhost:5173. Lịch tạo thủ công được lưu trong trình duyệt. M có thể nhập lịch từ file .ics.

## Đồng bộ Canvas và triển khai

Bản đang chạy trên ChatGPT Sites dùng xác thực của nền tảng để bảo vệ nguồn Canvas cá nhân. Bản mã nguồn này cần cấu hình xác thực và endpoint phía máy chủ tương ứng nếu chuyển sang một dịch vụ hosting khác. Đặt đường dẫn feed trong biến môi trường phía máy chủ. Mỗi địa chỉ website có vùng lưu trữ trình duyệt riêng.
