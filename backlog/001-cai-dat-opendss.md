# Backlog 001: Cài đặt OpenDSS vào Energy Data Platform

## Trạng thái

`Chưa thực hiện`

## Mục tiêu

Tích hợp OpenDSS vào môi trường học tập của Energy Data Platform để mô phỏng lưới điện phân phối và đánh giá ảnh hưởng của phụ tải trạm sạc lên điện áp, công suất, máy biến áp và tổn thất trên lưới.

OpenDSS chỉ được sử dụng cho mô phỏng và phân tích offline; không kết nối hoặc gửi lệnh đến thiết bị điện thực.

## Giá trị học tập

- Hiểu mô hình nguồn, đường dây, máy biến áp, bus và phụ tải trong lưới phân phối.
- Chạy power flow tại một thời điểm và theo chuỗi thời gian.
- Mô hình hóa trạm sạc EV như một phụ tải có công suất biến đổi.
- Đánh giá quá tải máy biến áp, sụt áp và tổn thất điện năng.
- So sánh kết quả trước và sau khi áp dụng giới hạn công suất hoặc smart charging.
- Kết hợp kết quả mô phỏng điện với dữ liệu vận hành từ CitrineOS và OpenEMS.

## Phạm vi đề xuất

1. Chọn phương thức chạy OpenDSS phù hợp với môi trường Linux và Docker hiện tại.
2. Ưu tiên API Python tương thích OpenDSS để có thể gọi mô phỏng từ script và notebook.
3. Tạo một feeder mẫu nhỏ gồm:
   - một nguồn điện;
   - một máy biến áp;
   - một đường dây phân phối;
   - một phụ tải nền;
   - một địa điểm sạc có ít nhất hai EVSE.
4. Tạo kịch bản phụ tải trạm sạc theo thời gian.
5. Xuất kết quả mô phỏng thành CSV hoặc Parquet để phân tích và trực quan hóa.
6. Viết tài liệu hướng dẫn chạy và giải thích các đại lượng đầu ra.

## Ngoài phạm vi của backlog này

- Điều khiển thiết bị điện thực.
- Mô phỏng bảo vệ hoặc sự cố phục vụ vận hành thực tế.
- Đồng bộ thời gian thực hoàn chỉnh với CitrineOS hoặc OpenEMS.
- Xây dựng mô hình lưới đại diện cho một hệ thống điện thực.
- Triển khai production hoặc Kubernetes.

## Thiết kế thư mục dự kiến

```text
opendss/
├── README.md
├── models/
│   └── demo_feeder/
├── profiles/
│   └── ev_charging_profile.csv
├── scripts/
│   ├── run_power_flow.py
│   └── export_results.py
├── notebooks/
│   └── analyze_demo_feeder.ipynb
└── output/                  # dữ liệu sinh ra, không commit nếu có dung lượng lớn
```

Cấu trúc cuối cùng cần được xác nhận sau khi chọn thư viện và cách đóng gói.

## Các bước thực hiện

- [ ] Khảo sát các lựa chọn chạy OpenDSS trên Linux và ghi lại lý do lựa chọn.
- [ ] Chọn và khóa phiên bản OpenDSS/API Python.
- [ ] Xác định chạy trực tiếp trong Python environment hay bằng Docker container riêng.
- [ ] Bổ sung dependency theo cách tái lập được, không cài đặt thủ công ngoài tài liệu.
- [ ] Tạo feeder demo và kiểm tra mô hình có thể compile.
- [ ] Chạy power flow cơ sở khi chưa có phụ tải sạc.
- [ ] Chạy kịch bản có một và nhiều EVSE hoạt động đồng thời.
- [ ] Xuất điện áp bus, công suất nhánh, tải máy biến áp và tổn thất.
- [ ] Thêm kiểm tra tự động cho các kết quả cơ bản.
- [ ] Viết hướng dẫn chạy, dừng, làm sạch output và xử lý lỗi thường gặp.
- [ ] Ghi rõ đơn vị đo, múi giờ và quy ước dấu của dữ liệu.

## Tiêu chí nghiệm thu

- Một người mới có thể làm theo README để dựng môi trường và chạy mô phỏng trên Linux.
- Mô hình feeder mẫu chạy thành công bằng một lệnh được tài liệu hóa.
- Có ít nhất hai kịch bản: tải cơ sở và nhiều EVSE sạc đồng thời.
- Kết quả bao gồm điện áp bus, công suất/tỷ lệ tải máy biến áp và tổn thất hệ thống.
- Output có timestamp, đơn vị đo và định danh địa điểm/EVSE rõ ràng.
- Có ít nhất một kiểm tra chứng minh rằng tăng phụ tải sạc làm thay đổi kết quả power flow theo kỳ vọng.
- File sinh tự động và dữ liệu dung lượng lớn không bị commit nhầm vào Git.
- Không làm thay đổi hành vi của stack CitrineOS/OpenEMS hiện tại.

## Rủi ro và lưu ý

- OpenDSS gốc có lịch sử tập trung vào Windows; cần xác minh lựa chọn runtime phù hợp cho Linux trước khi triển khai.
- Quy ước pha, điện áp dây/pha, công suất tác dụng/phản kháng và chiều công suất phải được ghi rõ.
- Dữ liệu OCPP không tự động cung cấp đầy đủ topology lưới điện; cần một lớp ánh xạ từ địa điểm/EVSE sang bus và load OpenDSS.
- Kết quả của feeder demo chỉ phục vụ học tập, không dùng để đưa ra quyết định vận hành lưới điện thực.

## Phụ thuộc với các backlog tương lai

- Chuẩn hóa mô hình định danh site, station, EVSE và connector.
- Pipeline xuất profile phụ tải từ CitrineOS/PostgreSQL.
- Notebook phân tích và so sánh các kịch bản điều độ.
- Tích hợp kết quả OpenDSS vào Grafana hoặc công cụ BI.
- Kịch bản smart charging phối hợp giữa CitrineOS, OpenEMS và OpenDSS.
