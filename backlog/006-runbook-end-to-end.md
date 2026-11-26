# Backlog 006: Xây dựng runbook end-to-end

## Trạng thái

`Chưa thực hiện`

## Mục tiêu

Tạo một bài lab có thể tái lập để chứng minh dữ liệu nghiệp vụ đi từ trạm sạc mô phỏng vào CitrineOS, được quan sát tại các lớp liên quan và tạo ra bằng chứng rõ ràng thay vì chỉ xác nhận container đang chạy.

## Phạm vi tối thiểu

1. Khởi động stack nền bằng quy trình chuẩn.
2. Provision một station ID, EVSE, connector và token thử nghiệm.
3. Kết nối một simulator tới CitrineOS.
4. Thực hiện một phiên sạc hoàn chỉnh: authorize/start, MeterValues và stop.
5. Xác minh transaction và số đo được lưu đúng trong CitrineOS.
6. Xác minh telemetry liên quan trên OpenEMS/InfluxDB/Grafana khi adapter hoặc datasource tương ứng đã có.
7. Ghi log, query, screenshot hoặc report cần thiết để người khác đối chiếu.
8. Dừng và chạy lại nhằm kiểm tra reconnect và tính tái lập.

## Các mức mở rộng

- Nhiều trạm sạc đồng thời và peak load.
- Remote start/stop.
- SetChargingProfile và xác minh simulator tuân thủ giới hạn.
- Mất kết nối/reconnect trong phiên.
- EMS thay đổi ngân sách công suất, CSMS phát lệnh và đo phản hồi.
- Odoo nhận sự kiện vận hành và tạo Activity theo quy tắc.

## Ngoài phạm vi ban đầu

- Chứng nhận tuân thủ OCPP chính thức.
- Điều khiển thiết bị điện thực.
- Benchmark production hoặc kiểm thử bảo mật toàn diện.
- Ghi trực tiếp database để giả lập một bước tích hợp thành công.

## Các bước thực hiện

- [ ] Chọn một simulator baseline và phiên bản OCPP cụ thể.
- [ ] Khóa version/tag theo Backlog 003.
- [ ] Chuẩn bị dữ liệu provision có thể tạo lại và xóa an toàn.
- [ ] Viết trình tự lệnh cùng kết quả mong đợi cho từng bước.
- [ ] Xác định query/API/UI dùng để kiểm tra station, transaction và MeterValues.
- [ ] Ghi tiêu chí đúng cho timestamp, energy delta, trạng thái và kết thúc phiên.
- [ ] Tự động hóa phần có thể tái lập bằng script/API thay vì phụ thuộc hoàn toàn vào UI.
- [ ] Chạy thử từ trạng thái sạch và ghi mọi workaround.
- [ ] Thu thập bằng chứng nhỏ gọn, loại bỏ secret và dữ liệu runtime không cần commit.
- [ ] Thêm negative case tối thiểu: token không hợp lệ hoặc mất kết nối.
- [ ] Liên kết runbook từ README gốc.

## Tiêu chí nghiệm thu

- Một người khác có thể chạy lại bài lab bằng tài liệu mà không cần kiến thức ngầm.
- Có transaction hoàn chỉnh với station/EVSE/connector và timestamp truy vết được.
- MeterValues thay đổi hợp lý, đúng đơn vị và tổng năng lượng không giảm trong phiên sạc thông thường.
- Bằng chứng chỉ rõ kiểm tra ở service nào, bằng API/query nào và kết quả mong đợi.
- Restart/reconnect không tạo transaction trùng ngoài quy tắc đã định nghĩa.
- Failure được ghi rõ ở bước nào; container healthy không được dùng thay cho bằng chứng nghiệp vụ.
- Phần OpenEMS, Odoo hoặc vòng điều khiển chưa có adapter phải được đánh dấu `chưa thực hiện`, không bỏ qua im lặng.

## Rủi ro và lưu ý

- Provisioning và URL WebSocket khác nhau giữa OCPP 1.6 và 2.0.1.
- Các simulator có thể dùng cùng station ID và tranh chấp kết nối; mỗi run cần namespace riêng.
- Clock drift, timezone và quy ước đơn vị có thể làm kết quả nhìn hợp lệ nhưng sai nghiệp vụ.
- Không lưu token, password hoặc certificate thật trong log/bằng chứng.

## Phụ thuộc

- Backlog 002 cung cấp hướng dẫn vận hành stack.
- Backlog 003 khóa baseline đã kiểm thử.
- Backlog 004 cung cấp định danh và data contract.
- Backlog 005 dùng kết quả runbook để cập nhật trạng thái kết nối.
