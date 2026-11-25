#!/usr/bin/env bash
# Sprint 4 / S4-03 (reviews + BQ13) checks against a running backend.
# Prereqs: migrations + seed:auth + seed:restaurants + seed:bq13 (BQ13_SEED_DATE default 2026-11-20).
# Uses node (not python) to read JSON. PASSWORD / ANALYST_PASSWORD must match the demo accounts.
#   PASSWORD=… ANALYST_PASSWORD=… bash scripts/verify-s4-03.sh
#   API_URL=https://campusmeal-api.onrender.com/api/v1 … bash scripts/verify-s4-03.sh
set -u
B=${API_URL:-http://localhost:3000/api/v1}
PASSWORD=${PASSWORD:?set PASSWORD (demo user)}
ANALYST_PASSWORD=${ANALYST_PASSWORD:-$PASSWORD}
SEED_DATE=${BQ13_SEED_DATE:-2026-11-20}
TMP=$(mktemp)

json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);const f=new Function("o","return ("+process.argv[1]+")");const v=f(o);console.log(typeof v==="string"?v:JSON.stringify(v));})' "$1"; }
uuid() { node -e 'console.log(require("crypto").randomUUID())'; }
iso_days_ago() { DAYS="$1" node -e 'const d=new Date(Date.now()-Number(process.env.DAYS)*864e5);console.log(d.toISOString().replace(/\.\d{3}Z$/,"Z"))'; }
# Bogotá is UTC-5 all year (no daylight saving).
bogota_tomorrow() { node -e 'const t=new Date(Date.now()-5*36e5+864e5);console.log(t.toISOString().slice(0,10))'; }
login() {
  curl -s -X POST "$B/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | json 'o.accessToken'
}
# call METHOD PATH TOKEN [BODY] -> prints "HTTP <code>" and keeps the body in $TMP
call() {
  local code
  if [ $# -ge 4 ]; then
    code=$(curl -s -o "$TMP" -w "%{http_code}" -X "$1" "$B$2" -H "Authorization: Bearer $3" -H 'Content-Type: application/json' -d "$4")
  else
    code=$(curl -s -o "$TMP" -w "%{http_code}" -X "$1" "$B$2" -H "Authorization: Bearer $3")
  fi
  echo "  HTTP $code $(head -c 160 "$TMP")"
}
body() { json "$1" < "$TMP"; }
review() { echo "{\"clientReviewId\":\"$1\",\"overall\":$2,\"portion\":4,\"taste\":4,\"freshness\":4,\"value\":3,\"waitMinutes\":12,\"occurredAt\":\"$3\"$4}"; }
day() { node -e 'const [y,m,d]=process.argv[1].split("-").map(Number);const t=new Date(Date.UTC(y,m-1,d)-Number(process.argv[2])*864e5);console.log(t.toISOString().slice(0,10))' "$SEED_DATE" "$1"; }

# Reviews are limited to one per user/restaurant/day, so each run uses its own reviewer:
# REVIEW_EMAIL/REVIEW_PASSWORD if given, otherwise a freshly registered local account.
if [ -n "${REVIEW_EMAIL:-}" ]; then
  USER_TOKEN=$(login "$REVIEW_EMAIL" "${REVIEW_PASSWORD:?set REVIEW_PASSWORD}")
else
  REVIEW_EMAIL="s4-03-$(uuid | cut -c1-8)@campusmeal.local"
  curl -s -o /dev/null -X POST "$B/auth/register" -H 'Content-Type: application/json'     -d "{\"fullName\":\"S4-03 verification\",\"email\":\"$REVIEW_EMAIL\",\"password\":\"$PASSWORD\"}"
  USER_TOKEN=$(login "$REVIEW_EMAIL" "$PASSWORD")
fi
echo "reviewer: $REVIEW_EMAIL"
ANALYST_TOKEN=$(login analyst@campusmeal.local "$ANALYST_PASSWORD")
A_FROM=$(day 6); A_TO=$(day 0); B_FROM=$(day 13); B_TO=$(day 7)

call GET "/analytics/partner-health?from=$A_FROM&to=$A_TO" "$ANALYST_TOKEN" >/dev/null
GREEN=$(body 'o.restaurants.find(r=>r.name==="Green Bowl").restaurantId')
SUSHI=$(body 'o.restaurants.find(r=>r.name==="Sushi Rápido").restaurantId')
echo "Green Bowl=$GREEN Sushi Rápido=$SUSHI"
NOW=$(iso_days_ago 0)
ID1=$(uuid)

echo "1 create review (201)";                          call POST "/restaurants/$GREEN/reviews" "$USER_TOKEN" "$(review "$ID1" 5 "$NOW" "")"
FIRST=$(body 'o.reviewId')
echo "2 replay same id and body (200, same reviewId)"; call POST "/restaurants/$GREEN/reviews" "$USER_TOKEN" "$(review "$ID1" 5 "$NOW" "")"
echo "  same reviewId: $([ "$(body 'o.reviewId')" = "$FIRST" ] && echo yes || echo NO)"
echo "3 same id, different score (409 CLIENT_REVIEW_ID_CONFLICT)"; call POST "/restaurants/$GREEN/reviews" "$USER_TOKEN" "$(review "$ID1" 2 "$NOW" "")"
echo "4 new id, same restaurant and day (409 REVIEW_ALREADY_SUBMITTED_TODAY)"; call POST "/restaurants/$GREEN/reviews" "$USER_TOKEN" "$(review "$(uuid)" 4 "$NOW" "")"
echo "5 score 6 (400)";                                call POST "/restaurants/$SUSHI/reviews" "$USER_TOKEN" "$(review "$(uuid)" 6 "$NOW" "")"
echo "6 free-text field (400)";                        call POST "/restaurants/$SUSHI/reviews" "$USER_TOKEN" "$(review "$(uuid)" 4 "$NOW" ",\"comment\":\"great\"")"
echo "7 occurredAt 40 days ago (400)";                 call POST "/restaurants/$SUSHI/reviews" "$USER_TOKEN" "$(review "$(uuid)" 4 "$(iso_days_ago 40)" "")"
echo "8 occurredAt 1 day in the future (400)";         call POST "/restaurants/$SUSHI/reviews" "$USER_TOKEN" "$(review "$(uuid)" 4 "$(iso_days_ago -1)" "")"
echo "9 unknown restaurant (404)";                     call POST "/restaurants/00000000-0000-4000-8000-000000000000/reviews" "$USER_TOKEN" "$(review "$(uuid)" 4 "$NOW" "")"
echo "10 no token (401)";                              call POST "/restaurants/$SUSHI/reviews" "invalid" "$(review "$(uuid)" 4 "$NOW" "")"

ID2=$(uuid)
echo "11 five concurrent replays of one new review on Sushi Rápido (one 201, four 200)"
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "%{http_code} " -X POST "$B/restaurants/$SUSHI/reviews" -H "Authorization: Bearer $USER_TOKEN" \
    -H 'Content-Type: application/json' -d "$(review "$ID2" 3 "$NOW" "")" &
done
wait; echo

echo "12 public reviews, real only (suppressed while fewer than 5 real reviewers)"; call GET "/restaurants/$GREEN/reviews" "$USER_TOKEN"
echo "  $(body 'o.summary')"
echo "13 public reviews with synthetic (first run on a fresh DB: 7 reviewers, 9 reviews)"; call GET "/restaurants/$GREEN/reviews?includeSynthetic=true&limit=3" "$USER_TOKEN"
echo "  $(body '({summary:o.summary,recent:o.recent.length,catalogRating:o.catalogRating,includesSyntheticData:o.includesSyntheticData})')"

echo "14 partner-health as USER (403)";                call GET "/analytics/partner-health?from=$A_FROM&to=$A_TO" "$USER_TOKEN"
echo "15 from after to (400)";                         call GET "/analytics/partner-health?from=$A_TO&to=$A_FROM" "$ANALYST_TOKEN"
echo "16 range over 92 days (400)";                    call GET "/analytics/partner-health?from=2026-01-01&to=$A_TO" "$ANALYST_TOKEN"
TOMORROW=$(bogota_tomorrow)
echo "17 to in the future (400)";                      call GET "/analytics/partner-health?from=$TOMORROW&to=$TOMORROW" "$ANALYST_TOKEN"

summary='({restaurants:o.restaurants.map(r=>[r.name,r.menuStatus,r.lastRevisionDate,r.daysSinceRevision,r.revisionsInRange,r.recommendations.exposures,r.recommendations.selections,r.recommendations.selectionRate,r.recommendations.suppressed,r.reviews.reviewCount,r.reviews.meanOverall,r.reviews.suppressed].join(" | ")),cohorts:o.cohorts,associations:o.associations,includesSyntheticData:o.includesSyntheticData,revisionHistoryStartsAt:o.revisionHistoryStartsAt})'
echo "18 window A $A_FROM..$A_TO with synthetic"; call GET "/analytics/partner-health?from=$A_FROM&to=$A_TO&includeSynthetic=true" "$ANALYST_TOKEN" >/dev/null
body "$summary" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s),null,1)))'
echo "19 window B $B_FROM..$B_TO with synthetic"; call GET "/analytics/partner-health?from=$B_FROM&to=$B_TO&includeSynthetic=true" "$ANALYST_TOKEN" >/dev/null
body "$summary" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s),null,1)))'
echo "20 window A without synthetic (no revision history -> UNKNOWN; demo user's real review only if dated in range)"
call GET "/analytics/partner-health?from=$A_FROM&to=$A_TO" "$ANALYST_TOKEN" >/dev/null
body '({statuses:o.restaurants.map(r=>r.menuStatus),includesSyntheticData:o.includesSyntheticData,associations:o.associations.map(a=>a.status)})'
rm -f "$TMP"
