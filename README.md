# TOEIC Practice Cloudflare Pages

## Cấu trúc
- `index.html`: trang chủ + đăng nhập học viên.
- `toeic-part5-word-form-practice-100.html`: bài 100 câu từ loại.
- `results.html`: giáo viên xem/tải JSON kết quả.
- `functions/api/login.js`: kiểm tra email whitelist + mật khẩu học viên/admin.
- `functions/api/results.js`: lưu/xem kết quả qua Cloudflare KV.
- `functions/_shared/admin-auth.js`: helper dùng chung mật khẩu admin.
- `student_result/`: placeholder. Cloudflare Pages tĩnh không thể ghi file trực tiếp vào thư mục này sau khi deploy.

## Cơ chế đăng nhập học viên
Không cần tạo tài khoản riêng cho từng học viên.

Học viên đăng nhập bằng:
- Email riêng của học viên.
- Một mật khẩu chung của lớp.

API sẽ kiểm tra:
1. Email có nằm trong biến `ALLOWED_STUDENT_EMAILS` không.
2. Mật khẩu có đúng `STUDENT_PASSWORD` không.

Nếu `ALLOWED_STUDENT_EMAILS` để trống, mọi email hợp lệ đều có thể vào bằng mật khẩu học viên.
Nếu `ALLOWED_STUDENT_EMAILS` có danh sách email, chỉ các email trong danh sách mới vào được.

## Mật khẩu mặc định
- Học viên: `toeic123`
- Giáo viên: `admin123`

Trang chủ `index.html` dùng cùng mật khẩu giáo viên/admin này cho chức năng lock/unlock bài học. Không cần đặt thêm mật khẩu admin riêng trong frontend.

Nên đổi bằng Environment Variables trong Cloudflare Pages:
- `STUDENT_PASSWORD`
- `ADMIN_PASSWORD`
- `ALLOWED_STUDENT_EMAILS`

Ví dụ:

```txt
STUDENT_PASSWORD = toeic123
ADMIN_PASSWORD = admin123
ALLOWED_STUDENT_EMAILS = hocsinh01@gmail.com,hocsinh02@gmail.com,hocsinh03@gmail.com
```

Lưu ý: danh sách email phân tách bằng dấu phẩy, không cần xuống dòng.

## KV binding bắt buộc
Tạo KV namespace, ví dụ `STUDENT_RESULTS`, rồi vào Cloudflare Pages > Settings > Functions > KV namespace bindings:
- Variable name: `STUDENT_RESULTS`
- KV namespace: namespace bạn vừa tạo

## Kết quả học viên
Khi học viên làm xong 100 câu, bài sẽ tự gửi kết quả lên `/api/results`.

Câu nào học viên không chọn đáp án sẽ được lưu là:

```json
{
  "selected": null,
  "isCorrect": false
}
```

Giáo viên mở:

```txt
/results.html
```

nhập mật khẩu giáo viên để xem danh sách và tải JSON từng học viên.

## Vì sao không ghi JSON trực tiếp vào thư mục student_result?
Cloudflare Pages sau khi deploy là môi trường read-only cho static assets. Function có thể xử lý POST nhưng không được ghi file vào thư mục project. Vì vậy kết quả được lưu vào KV và `results.html` cho phép tải ra JSON với tên dạng `student_result/<id>.json`.
