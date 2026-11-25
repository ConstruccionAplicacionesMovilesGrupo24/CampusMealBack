#!/usr/bin/env bash
# Sprint 4 / S4-09 (BQ1 telemetry) checks against a running backend. Prints PASS/FAIL per check.
# Prereqs: migrations + seed:auth + seed:bq1 (BQ1_SEED_DATE default 2026-11-20).
#   PASSWORD=… ANALYST_PASSWORD=… bash scripts/verify-s4-09.sh
#   API_URL=https://campusmeal-api.onrender.com/api/v1 … bash scripts/verify-s4-09.sh
# It registers its own user, and every record uses a unique device model so runs never mix.
set -u
B=${API_URL:-http://localhost:3000/api/v1}
PASSWORD=${PASSWORD:?set PASSWORD (for the registered test account)}
ANALYST_PASSWORD=${ANALYST_PASSWORD:-$PASSWORD}
SEED_DATE=${BQ1_SEED_DATE:-2026-11-20}
TMP=$(mktemp); FAILS=0

json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);const v=new Function("o","return ("+process.argv[1]+")")(o);console.log(typeof v==="string"?v:JSON.stringify(v));})' "$1"; }
uuid() { node -e 'console.log(require("crypto").randomUUID())'; }
iso_minutes_ago() { M="$1" node -e 'console.log(new Date(Date.now()-Number(process.env.M)*6e4).toISOString().replace(/\.\d{3}Z$/,"Z"))'; }
# Bogotá is UTC-5 all year (no daylight saving).
bogota_day() { O="$1" node -e 'console.log(new Date(Date.now()-5*36e5+Number(process.env.O)*864e5).toISOString().slice(0,10))'; }
login() { curl -s -X POST "$B/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"password\":\"$2\"}" | json 'o.accessToken'; }
check() { if [ "$2" = "$3" ]; then echo "PASS $1 ($3)"; else echo "FAIL $1: expected $2, got $3 $(head -c 200 "$TMP")"; FAILS=$((FAILS+1)); fi; }
post() { curl -s -o "$TMP" -w "%{http_code}" -X POST "$B/analytics/performance-events" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d "$2"; }
get() { curl -s -o "$TMP" -w "%{http_code}" "$B/analytics/performance?$2" -H "Authorization: Bearer $1"; }
combo() { json "(()=>{const c=o.combinations.find(c=>c.deviceModel==='$1');return c?($2):'none'})()" < "$TMP"; }

TAG="Verify $(uuid | cut -c1-8)"
EMAIL="s4-09-$(uuid | cut -c1-8)@campusmeal.local"
curl -s -o /dev/null -X POST "$B/auth/register" -H 'Content-Type: application/json' -d "{\"fullName\":\"S4-09 verification\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
U=$(login "$EMAIL" "$PASSWORD"); A=$(login analyst@campusmeal.local "$ANALYST_PASSWORD")
NOW=$(iso_minutes_ago 1); TODAY=$(bogota_day 0)
ev() { echo "{\"clientEventId\":\"$1\",\"eventType\":\"$2\",\"platform\":\"ANDROID\",\"deviceModel\":\"$TAG\",\"osVersion\":\"Android 16\",\"appVersion\":\"0.5.0\",\"occurredAt\":\"${4:-$NOW}\"$3}"; }

echo "== Ingestion"
S1=$(uuid); E1=$(uuid)
check "session start" 202 "$(post "$U" "$(ev "$E1" SESSION_START ",\"sessionId\":\"$S1\"")")"
check "replay of the same event" 202 "$(post "$U" "$(ev "$E1" SESSION_START ",\"sessionId\":\"$S1\"")")"
check "second start of one session, other event id" 202 "$(post "$U" "$(ev "$(uuid)" SESSION_START ",\"sessionId\":\"$S1\"")")"
check "fatal crash" 202 "$(post "$U" "$(ev "$(uuid)" FATAL_CRASH ",\"sessionId\":\"$S1\",\"exceptionClass\":\"java.lang.IllegalStateException\"")")"
check "same crash imported twice" 202 "$(post "$U" "$(ev "$(uuid)" FATAL_CRASH ",\"sessionId\":\"$S1\"")")"
L1=$(uuid)
check "fresh load" 202 "$(post "$U" "$(ev "$(uuid)" COMPARISON_LOAD ",\"loadId\":\"$L1\",\"outcome\":\"FRESH_NETWORK\",\"durationMs\":2001")")"
check "second outcome of one load" 202 "$(post "$U" "$(ev "$(uuid)" COMPARISON_LOAD ",\"loadId\":\"$L1\",\"outcome\":\"ERROR\"")")"
check "cancelled load without duration" 202 "$(post "$U" "$(ev "$(uuid)" COMPARISON_LOAD ",\"loadId\":\"$(uuid)\",\"outcome\":\"CANCELLED\"")")"
S2=$(uuid)
post "$U" "$(ev "$(uuid)" SESSION_START ",\"sessionId\":\"$S2\"")" >/dev/null
check "injected crash" 202 "$(post "$U" "$(ev "$(uuid)" FATAL_CRASH ",\"sessionId\":\"$S2\",\"injected\":true")")"
check "late event (3 days old)" 202 "$(post "$U" "$(ev "$(uuid)" SESSION_START ",\"sessionId\":\"$(uuid)\"" "$(iso_minutes_ago 4320)")")"
R=$(uuid); RS=$(uuid)
for i in 1 2 3 4 5; do post "$U" "$(ev "$R" SESSION_START ",\"sessionId\":\"$RS\"")" >/dev/null & done; wait

echo "== Validation"
check "exception message rejected" 400 "$(post "$U" "$(ev "$(uuid)" FATAL_CRASH ",\"sessionId\":\"$(uuid)\",\"exceptionClass\":\"IllegalStateException: token abc\"")")"
check "unknown field (latitude)" 400 "$(post "$U" "$(ev "$(uuid)" SESSION_START ",\"sessionId\":\"$(uuid)\",\"latitude\":4.6")")"
check "client cannot set synthetic" 400 "$(post "$U" "$(ev "$(uuid)" SESSION_START ",\"sessionId\":\"$(uuid)\",\"synthetic\":true")")"
check "session without sessionId" 400 "$(post "$U" "$(ev "$(uuid)" SESSION_START "")")"
check "duration on a session" 400 "$(post "$U" "$(ev "$(uuid)" SESSION_START ",\"sessionId\":\"$(uuid)\",\"durationMs\":10")")"
check "load without loadId" 400 "$(post "$U" "$(ev "$(uuid)" COMPARISON_LOAD ",\"outcome\":\"FRESH_NETWORK\",\"durationMs\":10")")"
check "fresh load without duration" 400 "$(post "$U" "$(ev "$(uuid)" COMPARISON_LOAD ",\"loadId\":\"$(uuid)\",\"outcome\":\"FRESH_NETWORK\"")")"
check "negative duration" 400 "$(post "$U" "$(ev "$(uuid)" COMPARISON_LOAD ",\"loadId\":\"$(uuid)\",\"outcome\":\"FRESH_NETWORK\",\"durationMs\":-1")")"
check "unknown outcome" 400 "$(post "$U" "$(ev "$(uuid)" COMPARISON_LOAD ",\"loadId\":\"$(uuid)\",\"outcome\":\"FAST\"")")"
check "load on another screen" 400 "$(post "$U" "$(ev "$(uuid)" COMPARISON_LOAD ",\"loadId\":\"$(uuid)\",\"outcome\":\"ERROR\",\"screen\":\"HOME\"")")"
check "injected load" 400 "$(post "$U" "$(ev "$(uuid)" COMPARISON_LOAD ",\"loadId\":\"$(uuid)\",\"outcome\":\"ERROR\",\"injected\":true")")"
check "91 days old" 400 "$(post "$U" "$(ev "$(uuid)" SESSION_START ",\"sessionId\":\"$(uuid)\"" "$(iso_minutes_ago 131040)")")"
check "1 hour in the future" 400 "$(post "$U" "$(ev "$(uuid)" SESSION_START ",\"sessionId\":\"$(uuid)\"" "$(iso_minutes_ago -60)")")"
check "no token" 401 "$(post invalid "$(ev "$(uuid)" SESSION_START ",\"sessionId\":\"$(uuid)\"")")"
check "usage-events DTO still strict" 400 "$(curl -s -o "$TMP" -w "%{http_code}" -X POST "$B/analytics/usage-events" -H "Authorization: Bearer $U" -H 'Content-Type: application/json' -d "{\"clientEventId\":\"$(uuid)\",\"eventType\":\"SESSION_STARTED\",\"platform\":\"ANDROID\",\"occurredAt\":\"$NOW\",\"deviceModel\":\"x\"}")"

echo "== Report access and range"
check "USER role" 403 "$(get "$U" "from=$TODAY&to=$TODAY")"
check "from after to" 400 "$(get "$A" "from=$TODAY&to=$(bogota_day -1)")"
check "more than 92 days" 400 "$(get "$A" "from=$(bogota_day -92)&to=$TODAY")"
check "92 days" 200 "$(get "$A" "from=$(bogota_day -91)&to=$TODAY")"
check "to tomorrow" 400 "$(get "$A" "from=$TODAY&to=$(bogota_day 1)")"

echo "== Real records of this run (window of 4 days)"
W="from=$(bogota_day -4)&to=$TODAY"
check "report" 200 "$(get "$A" "$W")"
# Sessions: S1 (crash) + late + concurrent = 3; S2 is excluded because its crash was injected.
check "sessions counted once, injected excluded" "3/1" "$(combo "$TAG" 'c.sessions.started+"/"+c.sessions.crashed')"
check "crash rate 1/3, flagged but insufficient" "0.3333 true INSUFFICIENT" "$(combo "$TAG" 'c.sessions.crashRate+" "+c.sessions.flagged+" "+c.sessions.confidence')"
check "first load outcome kept" "1 2001 0" "$(combo "$TAG" 'c.loading.freshNetwork+" "+c.loading.p95Ms+" "+c.loading.errors')"
check "cancelled apart from p95 and failures" "1 0" "$(combo "$TAG" 'c.loading.cancelled+" "+c.loading.failureRate')"
check "includeSynthetic adds the injected session" 200 "$(get "$A" "$W&includeSynthetic=true")"
check "injected session visible on request" "4/2" "$(combo "$TAG" 'c.sessions.started+"/"+c.sessions.crashed')"
check "late event outside today" 200 "$(get "$A" "from=$TODAY&to=$TODAY")"
check "only today's sessions" "2" "$(combo "$TAG" 'c.sessions.started')"

echo "== Fixtures (seed:bq1, $SEED_DATE)"
F="from=$SEED_DATE&to=$SEED_DATE"
check "fixture report" 200 "$(get "$A" "$F&includeSynthetic=true")"
s='[c.sessions.started,c.sessions.crashed,c.sessions.crashRate,c.sessions.confidence,c.sessions.flagged].join(" ")'
l='[c.loading.freshNetwork,c.loading.p95Ms,c.loading.confidence,c.loading.flagged].join(" ")'
check "A 1/100 = 1% not flagged" "100 1 0.01 SUFFICIENT false" "$(combo 'Demo A' "$s")"
check "A 94x1000 + 6x2500 -> p95 2500" "100 2500 SUFFICIENT true" "$(combo 'Demo A' "$l")"
check "B 2/100 flagged" "100 2 0.02 SUFFICIENT true" "$(combo 'Demo B' "$s")"
check "B p95 exactly 2000 not flagged" "20 2000 SUFFICIENT false" "$(combo 'Demo B' "$l")"
check "C no sessions -> null" "0 0  NO_DATA false" "$(combo 'Demo C' "$s")"
check "C no fresh loads -> null" "0  NO_DATA false" "$(combo 'Demo C' "$l")"
check "C other outcomes apart" "2 1 3 2 1 1" "$(combo 'Demo C' '[c.loading.cachedRestore,c.loading.offlineHistory,c.loading.errors,c.loading.timeouts,c.loading.cancelled,c.loading.failureRate].join(" ")')"
check "D small sample labelled" "3 1 0.3333 INSUFFICIENT true" "$(combo 'Demo D' "$s")"
check "D single load labelled" "1 5000 INSUFFICIENT true" "$(combo 'Demo D' "$l")"
check "E 95x1000 + 5x2500 -> p95 1000" "100 1000 SUFFICIENT false" "$(combo 'Demo E' "$l")"
check "orphan crash reported, not counted" "1" "$(json 'o.coverage.crashesWithoutSession' < "$TMP")"
check "flagged combinations first" "Demo A,Demo B,Demo D,Demo C,Demo E" "$(json 'o.combinations.map(c=>c.deviceModel).filter(n=>n.startsWith("Demo ")).join(",")' < "$TMP")"
check "fixtures hidden by default" 200 "$(get "$A" "$F")"
check "no demo combination without includeSynthetic" "0" "$(json 'o.combinations.filter(c=>c.deviceModel.startsWith("Demo ")).length' < "$TMP")"
check "no identity in the report" "true" "$(json '!/userId|sessionId|@/.test(JSON.stringify(o))' < "$TMP")"

rm -f "$TMP"
echo; [ "$FAILS" -eq 0 ] && echo "ALL CHECKS PASSED" || { echo "$FAILS CHECK(S) FAILED"; exit 1; }
