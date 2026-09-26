#!/usr/bin/env bash
# Issue #7 (BQ8) integration checks against a running local backend.
# Prereqs: migrations + seed:auth + seed:restaurants + seed:inventory, API on :3000.
# PASSWORD must match DEMO_USER_PASSWORD / DEMO_ANALYST_PASSWORD in your .env.
set -u
B=${API_URL:-http://localhost:3000/api/v1}
PASSWORD=${PASSWORD:-DemoPass123!}
TMP=$(mktemp)

login() {
  curl -s -X POST "$B/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}" |
    python3 -c 'import json,sys;print(json.load(sys.stdin)["accessToken"])'
}
uuid() { python3 -c 'import uuid;print(uuid.uuid4())'; }
compare() {
  curl -s -X POST "$B/meal-decisions/compare" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' \
    -d "{\"location\":{\"latitude\":4.6025,\"longitude\":-74.0653},\"availableMinutes\":$2,\"maximumBudget\":$3,\"dietaryPreferences\":[],\"includeDelivery\":true,\"requestedAt\":\"2026-09-24T17:30:00Z\"}" |
    python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["recommendationId"])'
}
event() {
  local code
  code=$(curl -s -o "$TMP" -w "%{http_code}" -X POST "$B/analytics/events" \
    -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d "$2")
  echo "  HTTP $code $(python3 -c 'import json,sys;s=open(sys.argv[1]).read();print((json.loads(s)["code"]+": "+json.loads(s)["message"][:90]) if s else "(sin cuerpo)")' "$TMP")"
}
impression() { echo "{\"clientEventId\":\"$1\",\"recommendationId\":\"$2\",\"eventType\":\"RECOMMENDATION_IMPRESSION\",\"selectedAlternative\":null,\"platform\":\"IOS\",\"occurredAt\":\"$3\"}"; }
selection() { echo "{\"clientEventId\":\"$1\",\"recommendationId\":\"$2\",\"eventType\":\"RECOMMENDATION_SELECTED\",\"selectedAlternative\":\"$4\",\"platform\":\"ANDROID\",\"occurredAt\":\"$3\"}"; }
bq8() { curl -s -w "\n  HTTP %{http_code}\n" "$B/analytics/explanation-selection?$2" -H "Authorization: Bearer $1"; }

USER_TOKEN=$(login demo@campusmeal.local)
ANALYST_TOKEN=$(login analyst@campusmeal.local)
curl -s -o /dev/null -X POST "$B/auth/register" -H 'Content-Type: application/json' \
  -d "{\"fullName\":\"Other User\",\"email\":\"other@campusmeal.local\",\"password\":\"$PASSWORD\"}"
OTHER_TOKEN=$(login other@campusmeal.local)

R1=$(compare "$USER_TOKEN" 45 20000)
R2=$(compare "$USER_TOKEN" 45 20000)
R3=$(compare "$USER_TOKEN" 30 15000)
R_OTHER=$(compare "$OTHER_TOKEN" 45 20000)
echo "recommendations: R1=$R1 R2=$R2 R3=$R3"

E1=$(uuid)
echo "1 impression R1 (202)";                event "$USER_TOKEN" "$(impression "$E1" "$R1" 2026-09-24T17:30:05Z)"
echo "2 retry same clientEventId (202, no new row)"; event "$USER_TOKEN" "$(impression "$E1" "$R1" 2026-09-24T17:30:05Z)"
echo "3 selection R1 COOK (202)";            event "$USER_TOKEN" "$(selection "$(uuid)" "$R1" 2026-09-24T17:30:20Z COOK)"
echo "4 impression R2 (202)";                event "$USER_TOKEN" "$(impression "$(uuid)" "$R2" 2026-09-24T17:31:00Z)"
echo "5 second impression R2, new id (202, counted once)"; event "$USER_TOKEN" "$(impression "$(uuid)" "$R2" 2026-09-24T17:31:30Z)"
echo "6 impression R3 (202)";                event "$USER_TOKEN" "$(impression "$(uuid)" "$R3" 2026-09-24T17:32:00Z)"
echo "7 selection without selectedAlternative (400)"
event "$USER_TOKEN" "{\"clientEventId\":\"$(uuid)\",\"recommendationId\":\"$R1\",\"eventType\":\"RECOMMENDATION_SELECTED\",\"selectedAlternative\":null,\"platform\":\"IOS\",\"occurredAt\":\"2026-09-24T17:30:20Z\"}"
echo "8 another user's recommendation (404)"; event "$USER_TOKEN" "$(impression "$(uuid)" "$R_OTHER" 2026-09-24T17:30:05Z)"
echo "9 unknown recommendation (404)";       event "$USER_TOKEN" "$(impression "$(uuid)" 00000000-0000-4000-8000-000000000000 2026-09-24T17:30:05Z)"
echo "10 client sends explanationType (400)"
event "$USER_TOKEN" "{\"clientEventId\":\"$(uuid)\",\"recommendationId\":\"$R1\",\"eventType\":\"RECOMMENDATION_IMPRESSION\",\"platform\":\"IOS\",\"occurredAt\":\"2026-09-24T17:30:05Z\",\"explanationType\":\"TIME_PRIORITY\"}"
echo "11 client sends coordinates (400)"
event "$USER_TOKEN" "{\"clientEventId\":\"$(uuid)\",\"recommendationId\":\"$R1\",\"eventType\":\"RECOMMENDATION_IMPRESSION\",\"platform\":\"IOS\",\"occurredAt\":\"2026-09-24T17:30:05Z\",\"latitude\":4.6}"
echo "12 occurredAt without Z (400)";        event "$USER_TOKEN" "$(impression "$(uuid)" "$R1" 2026-09-24T12:30:05-05:00)"
echo "13 invalid platform (400)"
event "$USER_TOKEN" "{\"clientEventId\":\"$(uuid)\",\"recommendationId\":\"$R1\",\"eventType\":\"RECOMMENDATION_IMPRESSION\",\"platform\":\"WEB\",\"occurredAt\":\"2026-09-24T17:30:05Z\"}"
echo "14 no token (401)";                    event "invalid" "$(impression "$(uuid)" "$R1" 2026-09-24T17:30:05Z)"
echo "15 impression R3 in October (202, outside September range)"; event "$USER_TOKEN" "$(impression "$(uuid)" "$R3" 2026-10-02T17:30:05Z)"

echo "16 BQ8 as analyst, September (200)";   bq8 "$ANALYST_TOKEN" "from=2026-09-01&to=2026-09-30"
echo "17 BQ8 as regular user (403)";         bq8 "$USER_TOKEN" "from=2026-09-01&to=2026-09-30"
echo "18 BQ8 inverted range (400)";          bq8 "$ANALYST_TOKEN" "from=2026-09-30&to=2026-09-01"
echo "19 BQ8 malformed date (400)";          bq8 "$ANALYST_TOKEN" "from=2026-9-1&to=2026-09-30"
echo "20 BQ8 range without events (200, [])"; bq8 "$ANALYST_TOKEN" "from=2025-01-01&to=2025-01-31"
echo "21 BQ8 October only (200)";            bq8 "$ANALYST_TOKEN" "from=2026-10-01&to=2026-10-31"
rm -f "$TMP"
