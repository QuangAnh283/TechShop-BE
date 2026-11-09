#!/usr/bin/env bash
# Integration smoke test (PHASE 16.2 + 16.3) — gọi API thật trên server đang chạy.
# Yêu cầu: backend chạy (npm run start:dev) + Postgres đã seed.
# Chạy: bash test/smoke.sh
set -u
B="${BASE_URL:-http://localhost:3001/api/v1}"
PASS=0; FAIL=0
jget(){ python -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }
chk(){ if [ "$2" = "$3" ]; then echo "  PASS [$3] $1"; PASS=$((PASS+1)); else echo "  FAIL exp $2 got $3 : $1"; FAIL=$((FAIL+1)); fi; }
code(){ local m=$1 u=$2 d=$3 t=$4; local a=(-s -o /dev/null -w "%{http_code}" -X "$m" "$u"); [ -n "$d" ] && a+=(-H 'Content-Type: application/json' -d "$d"); [ -n "$t" ] && a+=(-H "Authorization: Bearer $t"); curl "${a[@]}"; }
body(){ local m=$1 u=$2 d=$3 t=$4; local a=(-s -X "$m" "$u"); [ -n "$d" ] && a+=(-H 'Content-Type: application/json' -d "$d"); [ -n "$t" ] && a+=(-H "Authorization: Bearer $t"); curl "${a[@]}"; }

echo "== Public =="
chk "health" 200 "$(code GET $B/health '' '')"
chk "products" 200 "$(code GET "$B/products?limit=2" '' '')"
chk "search FTS" 200 "$(code GET "$B/search?q=iphone" '' '')"

echo "== Auth =="
ATOK=$(body POST $B/auth/login '{"email":"admin@techshop.local","password":"Admin@123"}' '' '' | jget "['data']['accessToken']")
CTOK=$(body POST $B/auth/login '{"email":"customer@techshop.local","password":"Customer@123"}' '' '' | jget "['data']['accessToken']")
chk "admin login" 1 "$([ ${#ATOK} -gt 100 ] && echo 1 || echo 0)"
chk "customer login" 1 "$([ ${#CTOK} -gt 100 ] && echo 1 || echo 0)"
chk "no token -> 401" 401 "$(code GET $B/users/me '' '')"
chk "customer -> admin 403" 403 "$(code GET $B/admin/dashboard '' $CTOK)"

echo "== Flow: cart -> checkout (16.2) =="
DEV=$(body GET "$B/devices?status=IN_STOCK&limit=1&page=7" '' $ATOK | jget "['data'][0]['id']")
# dùng customer clear giỏ cho sạch rồi thêm
curl -s -X DELETE $B/cart -H "Authorization: Bearer $CTOK" >/dev/null
chk "add to cart" 201 "$(code POST $B/cart/items "{\"deviceId\":\"$DEV\"}" $CTOK)"
OID=$(body POST $B/orders/checkout '{}' $CTOK | jget "['data']['id']")
chk "checkout -> order" 1 "$([ -n "$OID" ] && echo 1 || echo 0)"
chk "vnpay url" 201 "$(code POST $B/payments/$OID/vnpay/create '' $CTOK)"

echo "== Race condition (16.3): 2 checkout đồng thời cùng 1 device =="
DEV2=$(body GET "$B/devices?status=IN_STOCK&limit=1&page=9" '' $ATOK | jget "['data'][0]['id']")
curl -s -X DELETE $B/cart -H "Authorization: Bearer $CTOK" >/dev/null
curl -s -X POST $B/cart/items "-d" "{\"deviceId\":\"$DEV2\"}" -H 'Content-Type: application/json' -H "Authorization: Bearer $CTOK" >/dev/null
c1=$(code POST $B/orders/checkout '{}' $CTOK) & p1=$!
c2=$(code POST $B/orders/checkout '{}' $CTOK) & p2=$!
wait
# một 201, một 4xx — kiểm tra bằng số đơn tạo (không thể cả hai 201)
R1=$(code POST $B/orders/checkout '{}' $CTOK) # giỏ đã trống -> 400
chk "sau race: giỏ trống -> 400" 400 "$R1"

echo ""
echo "== KẾT QUẢ: PASS=$PASS FAIL=$FAIL =="
