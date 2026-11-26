# Energy Data Platform

Energy Data Platform là project demo mô phỏng một công ty vận hành hạ tầng trạm sạc xe điện. Dự án được xây dựng để học và thực hành các công việc của **Chuyên viên Điều độ Năng lượng**: thu thập dữ liệu vận hành, giám sát phụ tải, phân bổ công suất, phân tích hiệu quả sử dụng năng lượng, xây dựng KPI và phối hợp cải tiến hệ thống CSMS/EMS.

> Đây là môi trường học tập và thử nghiệm kỹ thuật. Dự án chưa phải hệ thống sẵn sàng cho vận hành thương mại hoặc điều khiển thiết bị điện ngoài thực tế.

## Bối cảnh giả lập

Công ty giả lập quản lý nhiều địa điểm sạc, mỗi địa điểm có một hoặc nhiều trụ sạc và giới hạn công suất riêng. Trong quá trình vận hành, công ty cần:

- quản lý trạm, trụ sạc, khách hàng, phương tiện và các phiên sạc;
- tiếp nhận dữ liệu từ trụ sạc và các thiết bị đo đếm;
- theo dõi công suất tức thời, sản lượng điện, tải cực đại và mức khai thác trụ;
- phát hiện dữ liệu thiếu, trùng, sai lệch hoặc bất thường;
- giới hạn và phân bổ công suất giữa các trụ để tránh quá tải;
- phân tích xu hướng, dự báo nhu cầu và tối ưu khung giờ sạc;
- xây dựng dashboard, cảnh báo và báo cáo phục vụ vận hành;
- lưu trữ metadata và hỗ trợ các quy trình nghiệp vụ liên quan.

## Mục tiêu của project

Project hướng đến một quy trình demo hoàn chỉnh, từ thiết bị đến báo cáo:

1. Mô phỏng trạm sạc gửi sự kiện và số đo qua OCPP.
2. Thu nhận và quản lý phiên sạc bằng CSMS.
3. Đồng bộ dữ liệu năng lượng sang lớp EMS để giám sát và điều khiển.
4. Áp dụng giới hạn công suất, load balancing hoặc smart charging.
5. Lưu trữ dữ liệu vận hành có thể truy xuất và đối soát.
6. Tính KPI, phát hiện bất thường và trực quan hóa kết quả.
7. Quản lý metadata và quy trình nghiệp vụ trên Odoo.

## Kiến trúc tổng quan

```text
Trụ sạc / Bộ mô phỏng
          |
          | OCPP 1.6 / 2.0.1
          v
  CitrineOS (CSMS) --------> PostgreSQL / RabbitMQ / Redis
          |                              |
          | dữ liệu phiên sạc            | dữ liệu vận hành
          v                              v
  OpenEMS Backend <-------------- OpenEMS Edge
          |
          | metadata và nghiệp vụ
          v
      Odoo 18
          |
          v
 Dashboard / KPI / Cảnh báo / Báo cáo điều độ
```

Sơ đồ trên thể hiện kiến trúc mục tiêu của project. Một số luồng tích hợp vẫn cần được thiết kế và hiện thực trong các giai đoạn tiếp theo.

## Các repository thành phần

### `citrineos-core` - Charging Station Management System

[CitrineOS](./citrineos-core/README.md) là lớp CSMS quản lý hạ tầng sạc và giao tiếp với trụ sạc.

Vai trò dự kiến trong demo:

- nhận và định tuyến bản tin OCPP 1.6/2.0.1 qua WebSocket;
- quản lý trạm, EVSE, connector, giao dịch và phiên sạc;
- cung cấp API và giao diện Operator UI;
- lưu dữ liệu vào PostgreSQL/PostGIS;
- hỗ trợ luồng xử lý bất đồng bộ qua RabbitMQ và cache qua Redis;
- làm nền tảng thử nghiệm smart charging và power limitation.

Công nghệ chính: TypeScript, Node.js, Fastify, Next.js, Refine, PostgreSQL, Hasura, RabbitMQ và Redis.

### `openems` - Energy Management System

[OpenEMS](./openems/README.md) là lớp quản lý năng lượng, gồm Edge, Backend và UI.

Vai trò dự kiến trong demo:

- thu thập số đo và trạng thái từ thiết bị hoặc bộ mô phỏng;
- giám sát công suất tại trạm và trên toàn hệ thống;
- thực thi thuật toán điều khiển gần thời gian thực;
- áp dụng giới hạn công suất và cân bằng tải;
- tổng hợp dữ liệu năng lượng phục vụ phân tích và cảnh báo;
- mô phỏng phối hợp trạm sạc với pin lưu trữ, điện mặt trời hoặc biểu giá theo thời gian.

Công nghệ chính: Java, OSGi, Gradle và Angular.

### `odoo-openems` - Metadata và nghiệp vụ doanh nghiệp

[Odoo for OpenEMS](./odoo-openems/README.md) cung cấp addon Odoo 18 để Odoo làm Metadata Provider cho OpenEMS Backend.

Vai trò dự kiến trong demo:

- quản lý khách hàng, đối tác, người dùng và thiết bị;
- lưu metadata của hệ thống OpenEMS;
- hỗ trợ quy trình lắp đặt, cấu hình và chăm sóc khách hàng;
- kết nối dữ liệu kỹ thuật với dữ liệu nghiệp vụ;
- tạo nền tảng mở rộng cho quản lý tài sản, bảo trì và báo cáo quản trị.

Công nghệ chính: Odoo 18, Python, PostgreSQL và XML views.

### Các bộ mô phỏng trạm sạc

Workspace hiện có ba bộ mô phỏng phục vụ các mục tiêu kiểm thử khác nhau:

- [`everest-demo`](./everest-demo/README.md): mô phỏng EV/EVSE, luồng sạc, OCPP 2.0.1 và ISO 15118; cấu hình Compose tổng sử dụng EVerest để kết nối với CitrineOS;
- [`sap-charging-stations-simulator`](./sap-charging-stations-simulator/README.md): sinh nhiều trạm và giao dịch OCPP tự động, phù hợp tạo dữ liệu vận hành liên tục; được bật bằng Compose profile `sap`;
- [`opencpo-charger-farm`](./opencpo-charger-farm/README.md): mô phỏng tải lớn, reconnect, lỗi mạng, sự cố, V2G và chaos test; được bật bằng Compose profile `opencpo`.

Các simulator là công cụ bổ sung cho nhau, không phải ba thành phần bắt buộc phải chạy đồng thời. Danh sách ứng viên, tiêu chí đánh giá và trạng thái xác minh được ghi tại [`energy_charging_simulator_repositories.md`](./energy_charging_simulator_repositories.md).

### Dịch vụ dữ liệu và quan sát

Stack Compose cấp workspace hiện khai báo:

- PostgreSQL/PostGIS, RabbitMQ và Hasura từ Compose của CitrineOS;
- InfluxDB để lưu dữ liệu chuỗi thời gian của OpenEMS;
- Grafana để xây dựng dashboard và quan sát dữ liệu;
- OpenEMS Edge, Backend, UI Edge và UI Backend.

Workspace cũng đang chứa source của `docker-postgis`, `graphql-engine`, `influxdb`, `rabbitmq-server` và `grafana` để nghiên cứu hoặc phát triển riêng. Việc source có mặt trong workspace không đồng nghĩa Compose tổng đang build các dịch vụ đó từ source local; cần kiểm tra [`docker-compose.yml`](./docker-compose.yml) và Compose của CitrineOS để biết image hoặc build context thực tế.

## Liên hệ với công việc Điều độ Năng lượng

| Nhóm công việc | Nội dung thực hành trong project | Thành phần chính |
|---|---|---|
| Quản trị dữ liệu vận hành | Thu thập, chuẩn hóa, đối soát và phát hiện dữ liệu thiếu/trùng/bất thường | CitrineOS, OpenEMS, PostgreSQL |
| Điều độ và kiểm soát phụ tải | Theo dõi tải, công suất cực đại, phân bổ giới hạn công suất và cân bằng tải | OpenEMS, CitrineOS |
| Phân tích và tối ưu năng lượng | Phân tích sản lượng, peak load, mức khai thác, chi phí điện và các kịch bản tăng trưởng | Kho dữ liệu và lớp phân tích sẽ bổ sung |
| KPI, dashboard và báo cáo | Theo dõi sản lượng, phiên sạc, mức khai thác trụ, cảnh báo và hiệu quả năng lượng | Operator UI, OpenEMS UI và công cụ BI sẽ bổ sung |
| Nghiệp vụ CSMS/EMS | Kiểm tra công suất yêu cầu, công suất phân bổ và công suất thực tế; thử nghiệm smart charging | CitrineOS, OpenEMS |
| Phối hợp xử lý vận hành | Mô phỏng truy vết sự cố giữa dữ liệu, trụ sạc, CSMS, EMS và nghiệp vụ | Cả ba repository |

## KPI dự kiến

Các chỉ số dưới đây sẽ được dùng làm dữ liệu đầu ra cho dashboard và báo cáo:

- tổng điện năng tiêu thụ theo trạm, trụ và thời gian;
- công suất tức thời và công suất cực đại;
- hệ số phụ tải và tỷ lệ sử dụng công suất được cấp;
- số phiên sạc, thời lượng sạc và điện năng trung bình mỗi phiên;
- tỷ lệ khai thác trụ và tỷ lệ sẵn sàng của thiết bị;
- tỷ lệ phiên sạc thành công, thất bại hoặc gián đoạn;
- chênh lệch giữa công suất yêu cầu, được phân bổ và thực tế;
- số lượng và thời gian xử lý cảnh báo;
- chi phí điện và chi phí trên mỗi kWh hoặc mỗi phiên sạc;
- tỷ lệ dữ liệu đầy đủ, hợp lệ và được đối soát.

## Kịch bản demo mục tiêu

Một kịch bản hoàn chỉnh có thể gồm các bước:

1. Khởi tạo địa điểm, trạm, trụ sạc và giới hạn công suất.
2. Kết nối một hoặc nhiều trụ sạc mô phỏng với CitrineOS.
3. Phát sinh nhiều phiên sạc đồng thời vào giờ cao điểm.
4. Theo dõi tổng phụ tải và phát hiện nguy cơ vượt giới hạn của trạm.
5. Phân bổ lại công suất cho các phiên sạc theo chính sách ưu tiên.
6. So sánh công suất yêu cầu, được phân bổ và thực tế.
7. Ghi nhận cảnh báo, sự kiện gián đoạn hoặc dữ liệu bất thường.
8. Tổng hợp KPI theo ngày, tuần và tháng.
9. Đánh giá hiệu quả điều độ và đề xuất phương án tối ưu.

## Lộ trình triển khai đề xuất

### Giai đoạn 1 - Dựng các hệ thống nền

- chạy CitrineOS và kết nối trụ sạc mô phỏng;
- chạy OpenEMS bằng dữ liệu hoặc thiết bị mô phỏng;
- chạy Odoo 18 với addon `odoo-openems`;
- ghi lại cấu hình, cổng dịch vụ và tài khoản demo theo cách an toàn.

### Giai đoạn 2 - Chuẩn hóa mô hình dữ liệu

- xác định mã định danh thống nhất cho địa điểm, trạm, EVSE và connector;
- xây dựng data dictionary cho telemetry, phiên sạc, sự kiện và cảnh báo;
- quy định đơn vị đo, múi giờ, tần suất lấy mẫu và tiêu chí chất lượng dữ liệu;
- xác định nguồn dữ liệu gốc cho từng trường thông tin.

### Giai đoạn 3 - Tích hợp CSMS và EMS

- thiết kế luồng trao đổi dữ liệu giữa CitrineOS và OpenEMS;
- đồng bộ trạng thái, meter values và giới hạn công suất;
- thử nghiệm smart charging, load balancing và power limitation;
- xây dựng cơ chế retry, idempotency, logging và đối soát.

### Giai đoạn 4 - Phân tích và báo cáo

- xây dựng pipeline tổng hợp dữ liệu vận hành;
- định nghĩa công thức và nguồn dữ liệu cho từng KPI;
- tạo dashboard theo thời gian thực và báo cáo ngày/tuần/tháng;
- bổ sung phát hiện ngoại lệ và cảnh báo sớm.

### Giai đoạn 5 - Bài tập vận hành

- mô phỏng quá tải, mất kết nối và meter value bất thường;
- phân tích nguyên nhân và lập biên bản xử lý;
- đo hiệu quả trước và sau điều độ;
- xây dựng bộ test cho các kịch bản nghiệp vụ quan trọng.

## Cấu trúc thư mục

```text
Energy_DataPlatform/
├── backlog/                            # Backlog và tiêu chí nghiệm thu
├── citrineos-core/                     # CSMS, OCPP server và Operator UI
├── openems/                            # EMS: Edge, Backend và UI
├── odoo-openems/                       # Addon Odoo Metadata Provider
├── everest-demo/                       # Mô phỏng EV/EVSE và OCPP
├── sap-charging-stations-simulator/    # Simulator tạo giao dịch OCPP tự động
├── opencpo-charger-farm/               # Charger farm, stress và chaos test
├── grafana/                            # Source Grafana
├── influxdb/                           # Source InfluxDB
├── rabbitmq-server/                    # Source RabbitMQ
├── graphql-engine/                     # Source Hasura GraphQL Engine
├── docker-postgis/                     # Source image PostgreSQL/PostGIS
├── config/
│   └── sap-simulator/                  # Cấu hình SAP Simulator của lab
├── docker-compose.yml                  # Compose tổng của Energy Lab
├── citrineos.override.yml              # Override CitrineOS cho Compose tổng
├── energy_charging_simulator_repositories.md
│                                        # Khảo sát và tiêu chí chọn simulator
└── README.md                            # Giới thiệu và định hướng project
```

Các dự án nguồn vẫn giữ README, giấy phép và hướng dẫn cài đặt riêng. `docker-compose.yml` ở thư mục gốc là điểm ghép stack Energy Lab; Odoo 18 được vận hành bên ngoài Compose này và không được khởi tạo thêm database Odoo.

## Backlog

- [`001-cai-dat-opendss.md`](./backlog/001-cai-dat-opendss.md): bổ sung mô phỏng lưới điện phân phối bằng OpenDSS;
- [`002-huong-dan-van-hanh-stack.md`](./backlog/002-huong-dan-van-hanh-stack.md): viết hướng dẫn chạy stack cấp workspace;
- [`003-ma-tran-cau-hinh-da-kiem-thu.md`](./backlog/003-ma-tran-cau-hinh-da-kiem-thu.md): quản lý phiên bản và bằng chứng cấu hình đã kiểm thử;
- [`004-hop-dong-tich-hop-va-tu-dien-du-lieu.md`](./backlog/004-hop-dong-tich-hop-va-tu-dien-du-lieu.md): chuẩn hóa định danh, đơn vị và hợp đồng tích hợp;
- [`005-ban-do-trang-thai-ket-noi.md`](./backlog/005-ban-do-trang-thai-ket-noi.md): phân biệt kết nối đã chạy, đã cấu hình và còn cần phát triển;
- [`006-runbook-end-to-end.md`](./backlog/006-runbook-end-to-end.md): xây dựng bài lab và bằng chứng chạy xuyên suốt.

## Kiến thức và kỹ năng hướng đến

- nguyên lý CSMS/EMS và luồng giao tiếp với trụ sạc;
- OCPP, Modbus, REST API và mô hình tích hợp hệ thống;
- quản lý và phân tích dữ liệu vận hành từ nhiều nguồn;
- điều độ công suất, load balancing và smart charging;
- SQL, kiểm soát chất lượng dữ liệu và truy vết sai lệch;
- xây dựng KPI, dashboard và báo cáo quản trị;
- phân tích sự cố dựa trên log, sự kiện và telemetry;
- phối hợp giữa vận hành, điện lực, nhà cung cấp thiết bị và đội IT.

## Nguyên tắc phát triển

- Dữ liệu và kết quả tính toán phải có nguồn, công thức và khả năng truy xuất.
- Mọi timestamp phải quy định rõ múi giờ; mọi đại lượng phải có đơn vị đo.
- Không đưa mật khẩu, API key hoặc thông tin nhạy cảm vào Git.
- Tách dữ liệu mô phỏng khỏi dữ liệu thực tế.
- Mỗi chức năng điều độ cần có kịch bản kiểm thử và tiêu chí đánh giá.
- Không kết nối hoặc gửi lệnh đến thiết bị điện thực khi chưa có đánh giá an toàn và cơ chế bảo vệ phù hợp.

## Trạng thái hiện tại

Workspace đã tập hợp ba nền tảng chính, ba bộ mô phỏng trạm sạc, source của các dịch vụ dữ liệu/quan sát và một Compose tổng để bắt đầu dựng Energy Lab. Compose hiện ghép CitrineOS, OpenEMS, EVerest, InfluxDB và Grafana; SAP Simulator và OpenCPO Charger Farm là các profile tùy chọn.

Sự hiện diện của source hoặc cấu hình chưa được xem là bằng chứng hệ thống đã chạy thành công. Vòng tích hợp xuyên suốt CitrineOS - OpenEMS - Odoo, kho dữ liệu phân tích, dashboard KPI, data contract và bộ kịch bản điều độ có thể tái lập vẫn cần được triển khai và xác minh theo các backlog.

## Tài liệu tham khảo trong workspace

- Mô tả công việc Chuyên viên Điều độ Năng lượng được dùng để xác định mục tiêu học tập và các nhóm nghiệp vụ của project.
- Hướng dẫn kỹ thuật chi tiết nằm trong README và tài liệu của từng repository thành phần.

## Giấy phép

Mỗi repository thành phần có giấy phép riêng. Hãy kiểm tra file `LICENSE` và manifest của từng dự án trước khi sử dụng, chỉnh sửa hoặc phân phối lại.
