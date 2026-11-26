# Backlog 002: Viết hướng dẫn vận hành stack cấp workspace

## Trạng thái

`Chưa thực hiện`

## Mục tiêu

Tạo hướng dẫn chạy Energy Lab từ thư mục gốc để một người mới có thể khởi động, kiểm tra, quan sát và dừng stack mà không phải suy luận từ nhiều README upstream.

## Phạm vi

- Nêu dependency tối thiểu: hệ điều hành, kiến trúc CPU, Docker Engine và Docker Compose.
- Tài liệu hóa cách cấu hình biến môi trường mà không commit secret.
- Hướng dẫn chạy stack mặc định và các profile `sap`, `opencpo`.
- Liệt kê URL, port và mục đích của từng dịch vụ.
- Hướng dẫn kiểm tra health, log, container, network và volume.
- Hướng dẫn dừng stack, khởi động lại và làm sạch dữ liệu có cảnh báo rõ tác động.
- Ghi lại lỗi thường gặp và cách khoanh vùng.

## Ngoài phạm vi

- Chứng minh toàn bộ luồng nghiệp vụ end-to-end.
- Tự động provision dữ liệu nghiệp vụ trong CitrineOS, OpenEMS hoặc Odoo.
- Hướng dẫn triển khai production hoặc kết nối thiết bị điện thực.

## Các bước thực hiện

- [ ] Kiểm tra phiên bản Docker Compose tối thiểu cần cho cú pháp `include`.
- [ ] Xác định tập biến môi trường, giá trị mặc định và biến nào là secret.
- [ ] Viết lệnh khởi động stack mặc định từ thư mục gốc.
- [ ] Viết lệnh bật riêng profile `sap`, `opencpo` và cả hai profile khi phù hợp.
- [ ] Lập bảng service, container, port nội bộ, port host và URL truy cập.
- [ ] Viết lệnh kiểm tra health/status và thu thập log theo từng nhóm CSMS, EMS, simulator và observability.
- [ ] Viết quy trình dừng không mất dữ liệu và quy trình xóa volume có cảnh báo.
- [ ] Kiểm tra toàn bộ lệnh trên một môi trường sạch hoặc ghi rõ phần chưa kiểm thử.
- [ ] Liên kết hướng dẫn từ README gốc.

## Tiêu chí nghiệm thu

- Người mới có thể dựng stack mặc định chỉ bằng các bước trong tài liệu.
- Mọi lệnh đều ghi rõ thư mục chạy và kết quả mong đợi.
- Các profile tùy chọn không bị mô tả như dịch vụ bắt buộc.
- Có bảng port không mâu thuẫn với Compose hiện tại.
- Có cách xác định service nào chưa healthy và nơi xem log.
- Thao tác xóa volume được tách riêng, cảnh báo mất dữ liệu và không dùng làm bước mặc định.
- Mọi thông tin xác thực mẫu được đánh dấu chỉ dùng local; không có secret thực trong Git.

## Rủi ro và lưu ý

- Compose gốc include Compose của CitrineOS, vì vậy tên service, network và port có thể thay đổi theo phiên bản upstream.
- Các image EVerest hiện ưu tiên Linux/AMD64; cần ghi rõ giới hạn kiến trúc.
- Odoo 18 nằm ngoài stack này; tài liệu không được tạo thêm Odoo hoặc database Odoo.

## Phụ thuộc

- `docker-compose.yml` và `citrineos.override.yml` ổn định.
- Backlog 003 cung cấp phiên bản/tag đã được kiểm thử.
- Backlog 006 dùng runbook vận hành này làm nền.
