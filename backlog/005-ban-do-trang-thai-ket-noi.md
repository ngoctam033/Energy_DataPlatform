# Backlog 005: Xây dựng bản đồ trạng thái kết nối

## Trạng thái

`Chưa thực hiện`

## Mục tiêu

Mô tả trung thực kiến trúc hiện tại bằng cách phân biệt kết nối đã được kiểm thử, mới có cấu hình, được upstream hỗ trợ, cần adapter hoặc chỉ là định hướng tương lai.

## Phạm vi

- Lập inventory mọi đường kết nối giữa simulator, CitrineOS, OpenEMS, Odoo, database và dashboard.
- Ghi protocol, chiều dữ liệu, endpoint, auth và owner của từng kết nối.
- Gắn trạng thái và bằng chứng cho từng đường kết nối.
- Cập nhật sơ đồ kiến trúc README để dùng ký hiệu hoặc chú giải trạng thái.
- Ghi backlog/issue chịu trách nhiệm cho các kết nối chưa hoàn thiện.

## Bộ trạng thái đề xuất

- `Đã kiểm thử`: có bằng chứng runtime trong workspace hiện tại.
- `Đã cấu hình`: có endpoint/config nhưng chưa có bằng chứng end-to-end.
- `Upstream hỗ trợ`: có tài liệu hoặc code upstream, chưa xác nhận local.
- `Cần adapter`: chưa có connector trực tiếp đáp ứng data contract.
- `Kế hoạch`: mới là kiến trúc mục tiêu.
- `Không áp dụng`: không nằm trong phạm vi của stack.

## Các bước thực hiện

- [ ] Trích các đường kết nối được mô tả trong README và Compose.
- [ ] Kiểm tra endpoint, network và dependency thực tế trong cấu hình.
- [ ] Đối chiếu tài liệu upstream cho các tích hợp được tuyên bố.
- [ ] Thu thập bằng chứng runtime hiện có mà không suy diễn từ cấu hình.
- [ ] Tạo bảng connection matrix và sơ đồ có legend trạng thái.
- [ ] Liên kết từng khoảng trống với backlog hoặc issue cụ thể.
- [ ] Cập nhật README để không thể hiểu nhầm kiến trúc mục tiêu là kiến trúc đã chạy.
- [ ] Thiết lập quy tắc cập nhật trạng thái sau mỗi lần kiểm thử.

## Tiêu chí nghiệm thu

- Mọi mũi tên trong sơ đồ kiến trúc có trạng thái giải thích được.
- Bảng ghi rõ source, destination, protocol, direction và bằng chứng.
- “Đã cấu hình” không bị trình bày thành “đã kiểm thử”.
- Các kết nối CitrineOS - OpenEMS và OpenEMS Backend - Odoo được đánh dấu theo đúng bằng chứng hiện có.
- Mỗi kết nối cần phát triển thêm có owner hoặc backlog kế tiếp.
- README và connection matrix không mâu thuẫn với Compose hiện tại.

## Rủi ro và lưu ý

- Container healthy chỉ chứng minh process/service sẵn sàng, không chứng minh dữ liệu nghiệp vụ đi xuyên suốt.
- Kết nối OCPP WebSocket thành công chưa chứng minh transaction, MeterValues hoặc Smart Charging đúng.
- Upstream có ví dụ tích hợp không đồng nghĩa phiên bản/tag local tương thích.

## Phụ thuộc

- Backlog 003 cung cấp phiên bản và mức kiểm chứng.
- Backlog 004 cung cấp contract cho các đường dữ liệu.
- Backlog 006 tạo bằng chứng để nâng trạng thái kết nối.
