# Backlog 004: Chuẩn hóa hợp đồng tích hợp và từ điển dữ liệu

## Trạng thái

`Chưa thực hiện`

## Mục tiêu

Xây dựng data contract thống nhất để dữ liệu trạm sạc, năng lượng và nghiệp vụ có thể ánh xạ giữa simulator, CitrineOS, OpenEMS, Odoo và lớp phân tích mà không mất nghĩa hoặc sai đơn vị.

## Phạm vi

- Chuẩn hóa định danh `site`, `station`, `EVSE`, `connector`, meter, Edge và đối tượng Odoo.
- Xác định nguồn dữ liệu gốc và khóa ánh xạ giữa các hệ thống.
- Quy định timestamp, timezone, độ chính xác và xử lý dữ liệu đến trễ.
- Quy định đại lượng, đơn vị và chiều dấu cho W, kW, Wh, kWh, V, A, SoC và công suất phản kháng.
- Định nghĩa schema tối thiểu cho telemetry, transaction, trạng thái thiết bị, giới hạn công suất và cảnh báo.
- Định nghĩa idempotency, retry, duplicate detection và versioning của message/schema.
- Ghi rõ validation rule và tiêu chí chất lượng dữ liệu.

## Ngoài phạm vi

- Triển khai toàn bộ adapter tích hợp.
- Thiết kế mô hình kho dữ liệu BI hoàn chỉnh.
- Ánh xạ vào một hệ thống điện thực hoặc dữ liệu khách hàng thật.

## Đầu ra đề xuất

```text
docs/data-contract/
├── identifiers.md
├── measurements.md
├── events-and-status.md
├── mappings.md
└── schemas/
```

## Các bước thực hiện

- [ ] Lập inventory field từ OCPP, CitrineOS, OpenEMS channels và model Odoo liên quan.
- [ ] Chọn quy tắc định danh canonical và cách lưu external ID.
- [ ] Chọn UTC làm chuẩn trao đổi và quy tắc hiển thị theo múi giờ nghiệp vụ.
- [ ] Tạo bảng đại lượng, kiểu dữ liệu, đơn vị, chiều dấu và khoảng hợp lệ.
- [ ] Định nghĩa schema cho meter sample, session/transaction, power limit và alarm/event.
- [ ] Mô tả lifecycle và trạng thái chuyển đổi của station, EVSE, connector và transaction.
- [ ] Xác định khóa idempotency và chính sách xử lý trùng/lệch thứ tự.
- [ ] Tạo fixture hợp lệ và không hợp lệ để kiểm tra contract.
- [ ] Review contract với các scenario trong runbook end-to-end.

## Tiêu chí nghiệm thu

- Một station/EVSE/connector có thể truy vết nhất quán qua các hệ thống liên quan.
- Mọi measurement bắt buộc có timestamp, đơn vị, nguồn và định danh tài sản.
- Quy ước dấu công suất và chuyển đổi W/kW/Wh/kWh có ví dụ kiểm chứng.
- Có quy tắc rõ cho timestamp thiếu timezone, dữ liệu trùng, đến trễ và mất mẫu.
- Schema có version và thay đổi breaking được quản lý.
- Có fixture/test chứng minh validation chấp nhận và từ chối đúng trường hợp.

## Rủi ro và lưu ý

- Khái niệm station, EVSE và connector khác nhau giữa OCPP 1.6 và 2.0.1.
- OpenEMS và hệ thống điện có thể dùng chiều dấu công suất khác với dữ liệu OCPP.
- Không nên dùng database ID nội bộ của một hệ thống làm định danh liên hệ toàn nền tảng.

## Phụ thuộc

- Cần chọn phạm vi scenario tối thiểu trong Backlog 006.
- Là đầu vào cho adapter CitrineOS - OpenEMS - Odoo và pipeline phân tích.
- OpenDSS Backlog 001 cần ánh xạ site/EVSE sang bus/load từ contract này.
