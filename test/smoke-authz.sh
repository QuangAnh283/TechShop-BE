#!/usr/bin/env bash
# Kiểm thử ma trận phân quyền (2026-10-20) — gọi API thật trên server đang chạy.
# Yêu cầu: backend chạy (npm run start:dev) + DB đã migrate & seed.
# Chạy: bash test/smoke-authz.sh
#
# Mỗi khối dưới đây gắn với một lỗ hổng đã vá hoặc một ràng buộc đã chốt; nếu có ca
# nào FAIL thì đó là hồi quy thật, đừng sửa kỳ vọng cho qua.
set -u
B="${BASE_URL:-http://localhost:3001/api/v1}"
PASS=0; FAIL=0
jget(){ python -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }
chk(){ if [ "$2" = "$3" ]; then echo "  PASS [$3] $1"; PASS=$((PASS+1)); else echo "  FAIL exp $2 got $3 : $1"; FAIL=$((FAIL+1)); fi; }
code(){ local m=$1 u=$2 d=$3 t=$4; local a=(-s -o /dev/null -w "%{http_code}" -X "$m" "$u"); [ -n "$d" ] && a+=(-H 'Content-Type: application/json' -d "$d"); [ -n "$t" ] && a+=(-H "Authorization: Bearer $t"); curl "${a[@]}"; }
body(){ local m=$1 u=$2 d=$3 t=$4; local a=(-s -X "$m" "$u"); [ -n "$d" ] && a+=(-H 'Content-Type: application/json' -d "$d"); [ -n "$t" ] && a+=(-H "Authorization: Bearer $t"); curl "${a[@]}"; }

ATOK=$(body POST $B/auth/login '{"email":"admin@techshop.local","password":"Admin@123"}' '' | jget "['data']['accessToken']")
TTOK=$(body POST $B/auth/login '{"email":"tech@techshop.local","password":"Tech@123"}' '' | jget "['data']['accessToken']")
CTOK=$(body POST $B/auth/login '{"email":"customer@techshop.local","password":"Customer@123"}' '' | jget "['data']['accessToken']")
[ ${#ATOK} -gt 100 ] || { echo "Không đăng nhập được admin -> dừng"; exit 1; }

echo "== Nhóm quyền =="
chk "admin xem danh mục quyền" 200 "$(code GET $B/admin/permissions '' $ATOK)"
chk "admin xem danh sách nhóm" 200 "$(code GET $B/admin/permission-groups '' $ATOK)"
chk "nhân viên KHÔNG xem được nhóm quyền" 403 "$(code GET $B/admin/permission-groups '' $TTOK)"
chk "khách KHÔNG xem được nhóm quyền" 403 "$(code GET $B/admin/permission-groups '' $CTOK)"
# Chống leo thang đặc quyền: không được nhét quyền chỉ-Admin vào nhóm.
chk "tạo nhóm chứa permission.manage -> 400" 400 \
  "$(code POST $B/admin/permission-groups '{"code":"EVIL","name":"Thử leo thang","permissions":["permission.manage"]}' $ATOK)"
chk "tạo nhóm chứa user.manage -> 400" 400 \
  "$(code POST $B/admin/permission-groups '{"code":"EVIL2","name":"Thử leo thang","permissions":["user.manage"]}' $ATOK)"
SYSID=$(body GET $B/admin/permission-groups '' "$ATOK" | python -c "
import sys,json
for g in json.load(sys.stdin)['data']:
    if g['isSystem']: print(g['id']); break" 2>/dev/null)
chk "xóa nhóm hệ thống -> 409" 409 "$(code DELETE $B/admin/permission-groups/$SYSID '' $ATOK)"

echo "== Nhân viên: quyền được cấp =="
chk "xem yêu cầu thu cũ -> 200" 200 "$(code GET "$B/trade-in/manage/requests?limit=1" '' $TTOK)"
chk "xem kho -> 200" 200 "$(code GET $B/inventory/summary '' $TTOK)"
chk "xem thiết bị -> 200" 200 "$(code GET "$B/devices?limit=1" '' $TTOK)"

echo "== Nhân viên: quyền KHÔNG được cấp =="
chk "xem tổng quan/báo cáo -> 403" 403 "$(code GET $B/admin/dashboard '' $TTOK)"
chk "xem toàn bộ đơn hàng -> 403" 403 "$(code GET "$B/orders/all?limit=1" '' $TTOK)"
chk "quản lý tài khoản -> 403" 403 "$(code GET $B/admin/users '' $TTOK)"
chk "sửa danh mục -> 403" 403 "$(code POST $B/categories '{"name":"Thử","slug":"thu-nghiem"}' $TTOK)"
chk "tạo sản phẩm -> 403" 403 "$(code POST $B/products '{"name":"Thử","categoryId":"x","brandId":"y"}' $TTOK)"

echo "== Chặn sửa giá ở mức field =="
# Ghi lại chính giá trị `condition` đang có -> PATCH thành no-op, không làm bẩn dữ liệu
# demo. (Đừng gửi chuỗi tiếng Việt trong body: curl trên Windows làm hỏng UTF-8.)
DEV=$(body GET "$B/devices?limit=1" '' "$ATOK" | jget "['data'][0]['id']")
COND=$(body GET $B/devices/$DEV '' "$ATOK" | jget "['data']['condition']")
chk "nhân viên sửa thiết bị KHÔNG kèm giá -> 200" 200 \
  "$(code PATCH $B/devices/$DEV "{\"condition\":\"$COND\"}" $TTOK)"
chk "nhân viên sửa thiết bị KÈM giá bán -> 403" 403 \
  "$(code PATCH $B/devices/$DEV '{"sellingPrice":1}' $TTOK)"
chk "nhân viên nhập kho (DTO mang giá) -> 403" 403 \
  "$(code POST $B/inventory/import '{"productId":"x","serialImei":"T1","condition":"GOOD","sellingPrice":1}' $TTOK)"
chk "admin sửa thiết bị -> 200" 200 "$(code PATCH $B/devices/$DEV "{\"condition\":\"$COND\"}" $ATOK)"

echo "== Quyền sở hữu đơn hàng =="
OID=$(body GET "$B/orders/all?limit=1" '' "$ATOK" | jget "['data'][0]['id']")
if [ -n "$OID" ]; then
  chk "nhân viên xem đơn người khác -> 403" 403 "$(code GET $B/orders/$OID '' $TTOK)"
  chk "nhân viên hủy đơn người khác -> 403" 403 "$(code PATCH $B/orders/$OID/cancel '' $TTOK)"
else
  echo "  (bỏ qua: chưa có đơn hàng nào trong DB)"
fi

echo "== Rào an toàn tài khoản =="
AID=$(body GET $B/users/me '' "$ATOK" | jget "['data']['id']")
chk "admin tự đổi vai trò mình -> 400" 400 "$(code PATCH $B/admin/users/$AID/role '{"role":"CUSTOMER"}' $ATOK)"
chk "admin tự khóa mình -> 400" 400 "$(code PATCH $B/admin/users/$AID/status '{"status":"BANNED"}' $ATOK)"
chk "tạo tài khoản role CUSTOMER -> 400" 400 \
  "$(code POST $B/admin/users '{"email":"x@y.z","password":"Pass@1234","fullName":"X","role":"CUSTOMER"}' $ATOK)"

echo "== Thu hồi quyền có hiệu lực NGAY (lỗ hổng token mang quyền cũ) =="
EMAIL="authz$(date +%s)@techshop.local"
NEWID=$(body POST $B/admin/users "{\"email\":\"$EMAIL\",\"password\":\"Test@1234\",\"fullName\":\"Authz Tester\",\"role\":\"TECHNICIAN\"}" "$ATOK" | jget "['data']['id']")
NTOK=$(body POST $B/auth/login "{\"email\":\"$EMAIL\",\"password\":\"Test@1234\"}" '' | jget "['data']['accessToken']")
NRT=$(body POST $B/auth/login "{\"email\":\"$EMAIL\",\"password\":\"Test@1234\"}" '' | jget "['data']['refreshToken']")
chk "nhân viên mới đọc được hồ sơ mình" 200 "$(code GET $B/users/me '' $NTOK)"
# Khóa tài khoản -> access token CŨ phải chết ngay, không chờ 15 phút.
body PATCH $B/admin/users/$NEWID/status '{"status":"BANNED"}' "$ATOK" >/dev/null
chk "sau khi BỊ KHÓA: access token cũ -> 401" 401 "$(code GET $B/users/me '' $NTOK)"
chk "sau khi BỊ KHÓA: refresh token cũ -> 401" 401 \
  "$(code POST $B/auth/refresh "{\"refreshToken\":\"$NRT\"}" '')"
# Dọn tài khoản test.
body PATCH $B/admin/users/$NEWID/status '{"status":"INACTIVE"}' "$ATOK" >/dev/null

echo
echo "== KẾT QUẢ: PASS=$PASS FAIL=$FAIL =="
[ "$FAIL" = "0" ] || exit 1
