# Backlog 003: Xây dựng ma trận cấu hình đã kiểm thử

## Trạng thái

`Chưa thực hiện`

## Mục tiêu

Tạo nguồn sự thật về phiên bản, commit, image, môi trường và mức độ kiểm chứng của từng thành phần trong Energy Lab.

## Phạm vi

- Ghi tag hoặc commit của từng repository nguồn.
- Ghi image và digest nếu dịch vụ chạy bằng image dựng sẵn.
- Ghi Docker/Docker Compose, OS, CPU architecture và tài nguyên thử nghiệm.
- Ghi trạng thái build, start, health và scenario đã chạy.
- Phân biệt rõ: chưa thử, kiểm tra tĩnh, khởi động được, kiểm thử thành phần và kiểm thử end-to-end.
- Liên kết log hoặc báo cáo kiểm thử có thể tái tạo, không commit secret hay output quá lớn.

## Đầu ra đề xuất

Một tài liệu `docs/tested-configurations.md` có tối thiểu các cột:

| Thành phần | Nguồn chạy | Tag/commit/digest | Môi trường | Mức xác minh | Scenario | Ngày kiểm tra | Bằng chứng |
|---|---|---|---|---|---|---|---|

## Các bước thực hiện

- [ ] Thống kê tất cả repository, image và build context được Compose sử dụng.
- [ ] Định nghĩa các mức xác minh và tiêu chí chuyển trạng thái.
- [ ] Ghi phiên bản hiện tại mà không suy diễn từ tên thư mục.
- [ ] Chạy hoặc thu thập bằng chứng cho từng mức xác minh được tuyên bố.
- [ ] Ghi tài nguyên CPU/RAM và thời gian khởi động cho stack cơ sở.
- [ ] Ghi các incompatibility, workaround và issue upstream liên quan.
- [ ] Tạo quy tắc cập nhật ma trận khi nâng tag, commit hoặc Compose.
- [ ] Liên kết ma trận từ README và runbook.

## Tiêu chí nghiệm thu

- Mọi thành phần trong Compose có phiên bản hoặc digest truy xuất được.
- Không dùng các từ “hoạt động”, “tương thích” nếu chưa có mức kiểm chứng tương ứng.
- Có ít nhất một cấu hình nền được ghi đầy đủ từ môi trường đến kết quả.
- Người khác có thể dùng thông tin trong bảng để tái tạo cùng phiên bản.
- Bằng chứng không chứa password, token, certificate hoặc dữ liệu nhạy cảm.
- Trạng thái cũ không bị ghi đè mơ hồ; ngày kiểm tra và phạm vi được giữ rõ.

## Rủi ro và lưu ý

- Tag nổi như `latest` làm giảm khả năng tái lập và cần được thay bằng version/digest khi chốt baseline.
- Source có mặt trong workspace không chứng minh source đó là nguồn build của container.
- Kết quả chạy một simulator không được suy rộng sang simulator hoặc phiên bản OCPP khác.

## Phụ thuộc

- Backlog 002 xác định quy trình chạy chuẩn.
- Backlog 006 cung cấp scenario end-to-end để nâng mức xác minh.
