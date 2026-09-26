#!/usr/bin/env bash
# Issue #5 (BQ4) integration checks against a running local backend.
# Prereqs: migrations + seed:auth + seed:restaurants, API on :3000.
# PASSWORD must match DEMO_USER_PASSWORD in your .env.
PASSWORD=${PASSWORD:-DemoPass123!}
RESP=$(mktemp)
B=${API_URL:-http://localhost:3000/api/v1}
TOK=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"demo@campusmeal.local","password":"'"$PASSWORD"'"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["accessToken"])')
s(){ echo "--- $1"; curl -s -o $RESP -w "HTTP %{http_code}\n" -X POST $B/restaurants/search -H "Authorization: Bearer ${3-$TOK}" -H 'Content-Type: application/json' -d "$2"; python3 -c '
import json,sys;d=json.load(open(sys.argv[1]))
if "restaurants" in d: print(d["routeProviderStatus"], [(r["name"],r.get("openingStatus"),r.get("minimumMealPrice"),r.get("walkingMinutes"),r.get("estimatedTotalMinutes")) for r in d["restaurants"]])
else: print(d.get("code"), d.get("message")[:120])' "$RESP"; }
LOC='"location":{"latitude":4.6025,"longitude":-74.0653}'
s "1 base mediodía" "{$LOC,\"availableMinutes\":45,\"maximumBudget\":20000,\"dietaryPreferences\":[],\"includeDelivery\":true,\"requestedAt\":\"2026-09-24T17:30:00Z\"}"
s "2 vegetariano" "{$LOC,\"availableMinutes\":45,\"maximumBudget\":20000,\"dietaryPreferences\":[\"VEGETARIAN\"],\"includeDelivery\":true,\"requestedAt\":\"2026-09-24T17:30:00Z\"}"
s "3 vegano+GF" "{$LOC,\"availableMinutes\":45,\"maximumBudget\":20000,\"dietaryPreferences\":[\"VEGAN\",\"GLUTEN_FREE\"],\"includeDelivery\":true,\"requestedAt\":\"2026-09-24T17:30:00Z\"}"
s "4 presupuesto 14000" "{$LOC,\"availableMinutes\":45,\"maximumBudget\":14000,\"dietaryPreferences\":[],\"includeDelivery\":true,\"requestedAt\":\"2026-09-24T17:30:00Z\"}"
s "5 poco tiempo (16 min)" "{$LOC,\"availableMinutes\":16,\"maximumBudget\":20000,\"dietaryPreferences\":[],\"includeDelivery\":true,\"requestedAt\":\"2026-09-24T17:30:00Z\"}"
s "6 3am Bogotá (cerrado)" "{$LOC,\"availableMinutes\":45,\"maximumBudget\":20000,\"dietaryPreferences\":[],\"includeDelivery\":true,\"requestedAt\":\"2026-09-24T08:00:00Z\"}"
s "7 presupuesto 0 -> vacío 200" "{$LOC,\"availableMinutes\":45,\"maximumBudget\":0,\"dietaryPreferences\":[],\"includeDelivery\":true,\"requestedAt\":\"2026-09-24T17:30:00Z\"}"
s "8 con campusId" "{$LOC,\"campusId\":\"campus-001\",\"availableMinutes\":45,\"maximumBudget\":20000,\"dietaryPreferences\":[],\"includeDelivery\":true,\"requestedAt\":\"2026-09-24T17:30:00Z\"}"
s "9 lat inválida" "{\"location\":{\"latitude\":95,\"longitude\":-74},\"availableMinutes\":45,\"maximumBudget\":20000,\"dietaryPreferences\":[],\"includeDelivery\":true,\"requestedAt\":\"2026-09-24T17:30:00Z\"}"
s "10 requestedAt sin Z" "{$LOC,\"availableMinutes\":45,\"maximumBudget\":20000,\"dietaryPreferences\":[],\"includeDelivery\":true,\"requestedAt\":\"2026-09-24T12:30:00-05:00\"}"
s "11 tag inválido" "{$LOC,\"availableMinutes\":45,\"maximumBudget\":20000,\"dietaryPreferences\":[\"KETO\"],\"includeDelivery\":true,\"requestedAt\":\"2026-09-24T17:30:00Z\"}"
s "12 campo desconocido" "{$LOC,\"foo\":1,\"availableMinutes\":45,\"maximumBudget\":20000,\"dietaryPreferences\":[],\"includeDelivery\":true,\"requestedAt\":\"2026-09-24T17:30:00Z\"}"
s "13 availableMinutes 0" "{$LOC,\"availableMinutes\":0,\"maximumBudget\":20000,\"dietaryPreferences\":[],\"includeDelivery\":true,\"requestedAt\":\"2026-09-24T17:30:00Z\"}"
s "14 sin token" "{$LOC,\"availableMinutes\":45,\"maximumBudget\":20000,\"dietaryPreferences\":[],\"includeDelivery\":true,\"requestedAt\":\"2026-09-24T17:30:00Z\"}" "x"
ID=$(curl -s -X POST $B/restaurants/search -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "{$LOC,\"availableMinutes\":45,\"maximumBudget\":20000,\"dietaryPreferences\":[],\"includeDelivery\":true,\"requestedAt\":\"2026-09-24T17:30:00Z\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["restaurants"][0]["id"])')
echo "--- 15 detalle"; curl -s -w "\nHTTP %{http_code}\n" $B/restaurants/$ID -H "Authorization: Bearer $TOK" | cut -c1-400
echo "--- 16 detalle id inválido"; curl -s -w "\nHTTP %{http_code}\n" $B/restaurants/abc -H "Authorization: Bearer $TOK"
echo "--- 17 detalle uuid inexistente"; curl -s -w "\nHTTP %{http_code}\n" $B/restaurants/00000000-0000-4000-8000-000000000000 -H "Authorization: Bearer $TOK"
echo "--- 18 ejemplo de 1 resultado completo"; curl -s -X POST $B/restaurants/search -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "{$LOC,\"availableMinutes\":45,\"maximumBudget\":20000,\"dietaryPreferences\":[],\"includeDelivery\":true,\"requestedAt\":\"2026-09-24T17:30:00Z\"}" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(json.dumps(d["restaurants"][0],indent=1,ensure_ascii=False))'
