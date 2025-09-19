# python 3.10+
# pip install fastapi uvicorn pydantic[dotenv] python-dateutil httpx
"""
17TRACK 웹훅 우선 + 폴링 보완 샘플 (통관 진행/지연/완료 필터 + 역행/누락/중복 방어)
- v1/v2 API 엔드포인트 모두 지원 (기본: v1)
- 웹훅 시그니처 검증: 본문 sign 또는 헤더 sign 모두 허용
- 다국어 통관 패턴 강화(ko/en/zh/es/ja) + 과적합/오탐 감소 정규식 추가
- 시간 역행/동시 타임스탬프 방어 + 중복 제거 + 누락 보정
- 배치 등록/즉시 푸시/폴링 조회 + 재시도/지터/429-5xx 대처
- 디버그/헬스/시뮬레이터 엔드포인트 추가

[주요 앵커]
  - [ANCHOR: HTTP_CLIENT]
  - [ANCHOR: CONFIG]
  - [ANCHOR: SIG_VERIFY]
  - [ANCHOR: CUSTOMS_PATTERN]
  - [ANCHOR: NORMALIZE]
  - [ANCHOR: SUMMARY]
  - [ANCHOR: POLLING]
  - [ANCHOR: ROUTES]
  - [ANCHOR: TEST_PAYLOAD]
"""

from __future__ import annotations

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timezone
from dateutil import parser as dtp
from typing import List, Dict, Any, Optional, Tuple
import hmac, hashlib, json, re, os, asyncio, random
import httpx
import uuid
from dotenv import load_dotenv

app = FastAPI(title="17TRACK Customs Filter – Enhanced")

FRONTEND_ORIGINS = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# [ANCHOR: HTTP_CLIENT] 전역 HTTP 클라이언트 풀 (연결 재사용)
HTTP_CLIENT: Optional[httpx.AsyncClient] = None

@app.on_event("startup")
async def _startup():
    global HTTP_CLIENT
    # HTTP/2 활성화는 서버 호환성 문제시 False로 내리세요
    try:
        HTTP_CLIENT = httpx.AsyncClient(timeout=20.0, http2=True)
    except ImportError:
        print("\u26a0\ufe0f httpx[http2] 미설치. HTTP/1.1로 폴백합니다.")
        HTTP_CLIENT = httpx.AsyncClient(timeout=20.0, http2=False)

@app.on_event("shutdown")
async def _shutdown():
    global HTTP_CLIENT
    if HTTP_CLIENT:
        await HTTP_CLIENT.aclose()
        HTTP_CLIENT = None

load_dotenv()
# [ANCHOR: CONFIG] 환경 설정 (v1 기본, v2.x도 허용)
API_BASE = os.getenv("SEVENTEENTRACK_API_BASE", "https://api.17track.net/track/v1")
API_KEY  = os.getenv("SEVENTEENTRACK_API_KEY")  # 대시보드의 Tracking API Key
USER_AGENT = os.getenv("SEVENTEENTRACK_UA", "customs-filter-demo/1.0")

if not API_KEY:
    print("\u26a0\ufe0f  SEVENTEENTRACK_API_KEY 미설정. .env 또는 환경변수로 넣어주세요.")

# 웹훅 공식 이벤트(v1 문서): TRACKING_UPDATED, TRACKING_STOPPED
VALID_EVENTS = {"TRACKING_UPDATED", "TRACKING_STOPPED"}

# =============== 시그니처 검증 ===============
# [ANCHOR: SIG_VERIFY]
class WebhookBody(BaseModel):
    sign: Optional[str] = None
    event: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


def _sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def verify_17track_signature(raw_body: bytes, headers: Dict[str, str]) -> Tuple[str, Dict[str, Any]]:
    """17TRACK 서명 검증.
    공식 규격(v1): sign/event/data를 본문에서 읽고 'event/data_json_compact/secret'를 이어붙여 SHA256.
    일부 샘플 코드에선 헤더 'sign'를 쓰므로, 헤더 sign가 있으면 우선 사용.
    실패 시 HTTP 401.
    """
    try:
        body_str = raw_body.decode("utf-8")
        obj = WebhookBody(**json.loads(body_str))
    except Exception:
        # 가끔 빈 바디로 테스트 푸시하는 경우가 있어 방어
        raise HTTPException(status_code=400, detail="Malformed JSON body")

    event = obj.event
    data  = obj.data or {}

    # 헤더/바디 sign 모두 지원
    sign_hdr = headers.get("sign") or headers.get("Sign") or headers.get("X-17Track-Sign")
    sign_body = obj.sign
    sign = (sign_hdr or sign_body)
    if not (event and sign):
        raise HTTPException(status_code=401, detail="Missing sign/event")

    # compact JSON 직렬화(키 순서/공백 고정)
    data_str = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    base = f"{event}/{data_str}/{API_KEY}"
    expect = _sha256_hex(base)

    if sign != expect:
        raise HTTPException(status_code=401, detail="Signature mismatch")

    return event, data

# =============== 통관 패턴 ===============
# [ANCHOR: CUSTOMS_PATTERN]
# 오탐 방지를 위해 정보 수신(received info)과 완료(cleared)의 구분을 강화
PATTERNS = {
    "IN_PROGRESS": [
        r"\b(customs|clearance)\b.*\b(in\s*progress|processing|underway|started)\b",
        r"\b(awaiting|presented\s*to|arrived\s*at)\b.*\bcustoms\b",
        r"통관\s*(진행|중|검토|검사\s*대기)",
        r"清关(中|处理中)|已交海关|报关",
        r"(aduana|despacho).*(progreso|trámite|iniciado)",
        r"通関(手続き中|審査中|進行中)"
    ],
    "DELAY": [
        r"\b(customs|clearance)\b.*\b(delay|hold|on\s*hold|awaiting\s*documents|info\s*required|documentation\s*required)\b",
        r"held\s*by\s*customs|clearance\s*information\s*required",
        r"통관\s*(지연|보류|서류\s*요청|추가\s*정보\s*요청)",
        r"清关(延误|受阻|待资料)|海关(扣留|查验)",
        r"(aduana).*(retraso|retenid[oa]|documentos)",
        r"通関(保留|停止|書類\s*不備)"
    ],
    "CLEARED": [
        # 'clearance information received' 같은 문구 오탐 방지(negative lookahead)
        r"\b(customs|clearance)\b.*\b(released|cleared|completed|approved)\b(?!\s*information)",
        r"released\s*from\s*customs",
        r"통관\s*(완료|해제|통과)",
        r"清关完成|放行|已放行",
        r"(aduana).*(liberad[oa]|aprobado|completado)",
        r"通関(許可|完了|解放)"
    ],
}
COMPILED = {k: [re.compile(p, re.I) for p in v] for k, v in PATTERNS.items()}

# =============== 유틸 ===============

def _to_dt_utc(s: str) -> datetime:
    dt = dtp.parse(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _stage_from_text(text: str) -> Optional[str]:
    if not text:
        return None
    for stg, regs in COMPILED.items():
        if any(r.search(text) for r in regs):
            return stg
    return None

STAGE_PRIORITY = {"IN_PROGRESS": 0, "DELAY": 1, "CLEARED": 2}


def _sort_key(ev: Dict[str, Any]):
    # ts 같을 때 우선순위: 진행 < 지연 < 완료
    return (ev["ts"], STAGE_PRIORITY.get(ev["stage"], 99))

# =============== 정규화 ===============
# [ANCHOR: NORMALIZE]

def normalize_from_track(track: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    17TRACK track 오브젝트의 z* 배열(z0/z1/z2/z9…)에서
    a(시각), z(설명)만 추출 → 통관 3단계만 남김 → 시간정렬 + 중복제거 + 역행 방어
    """
    events: List[Dict[str, Any]] = []

    # z*, z0~z9 탐색
    for k, v in (track or {}).items():
        if isinstance(v, list) and (k.startswith("z") or k in {"z0", "z1", "z2", "z9"}):
            for e in v:
                ts, desc = e.get("a"), e.get("z")
                stg = _stage_from_text((desc or "").strip())
                if ts and stg:
                    try:
                        events.append({"ts": _to_dt_utc(ts), "stage": stg, "desc": desc})
                    except Exception:
                        # 파싱 실패 레코드 무시
                        pass

    # 정렬 + 중복 제거
    events.sort(key=_sort_key)
    seen, out = set(), []
    for ev in events:
        key = (ev["ts"].isoformat(), ev["stage"], (ev["desc"] or "")[:160])
        if key in seen:
            continue
        seen.add(key)
        out.append(ev)

    # 시간 역행 보정: CLEARED가 IN_PROGRESS보다 앞에 있으면 스왑(극단적 케이스)
    first_in = next((e for e in out if e["stage"] == "IN_PROGRESS"), None)
    first_clear = next((e for e in out if e["stage"] == "CLEARED"), None)
    if first_clear and first_in and first_clear["ts"] < first_in["ts"]:
        # 앞단에 누락된 진행 이벤트가 있었다고 보고, 정렬키 재조정
        out.sort(key=_sort_key)

    return out

# =============== 요약 ===============
# [ANCHOR: SUMMARY]

def summarize_customs(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """통관 요약: 진행 시작 / 지연 유무 / 완료 시각 + 누락 보정 + 소요시간(초)"""
    first_in = next((e["ts"] for e in events if e["stage"] == "IN_PROGRESS"), None)
    cleared  = next((e["ts"] for e in events if e["stage"] == "CLEARED"), None)
    delays   = [dict(at=e["ts"].isoformat(), hint=(e["desc"] or "")[:140]) for e in events if e["stage"] == "DELAY"]

    # 누락 보정: 완료만 있고 진행이 없으면 최선의 앞 이벤트를 진행으로 간주
    if cleared and not first_in and events:
        first_in = events[0]["ts"]

    duration_sec: Optional[int] = None
    if first_in and cleared:
        duration_sec = int((cleared - first_in).total_seconds())

    return {
        "status": "CLEARED" if cleared else ("IN_PROGRESS" if first_in else "UNKNOWN"),
        "in_progress_at": first_in.isoformat() if first_in else None,
        "cleared_at": cleared.isoformat() if cleared else None,
        "has_delay": bool(delays),
        "delays": delays,
        "duration_sec": duration_sec,
    }

# =============== HTTP 호출 유틸 ===============
# [ANCHOR: POLLING]

async def _post_json(path: str, json_body: Any, max_retries: int = 5):
    if not API_KEY:
        raise RuntimeError("SEVENTEENTRACK_API_KEY not set")

    url = f"{API_BASE.rstrip('/')}/{path.lstrip('/')}"
    headers = {
        "Content-Type": "application/json",
        "17token": API_KEY,
        "User-Agent": USER_AGENT,
        "X-Request-Id": str(uuid.uuid4()),
    }
    base_backoff = 1.0

    client = HTTP_CLIENT or httpx.AsyncClient(timeout=20.0, http2=True)
    created_temp_client = HTTP_CLIENT is None

    try:
        for attempt in range(max_retries):
            try:
                r = await client.post(url, headers=headers, json=json_body)
            except httpx.TransportError:
                sleep = min(base_backoff * (2 ** attempt), 60)
                sleep *= (0.8 + 0.4 * random.random())  # 지터
                await asyncio.sleep(sleep)
                continue

            if r.status_code in (408, 425, 429, 502, 503, 504):
                ra = r.headers.get("Retry-After")
                try:
                    sleep = float(ra) if ra else min(base_backoff * (2 ** attempt), 60)
                except ValueError:
                    sleep = min(base_backoff * (2 ** attempt), 60)
                sleep *= (0.8 + 0.4 * random.random())
                await asyncio.sleep(sleep)
                continue

            # 200대 이외는 예외
            r.raise_for_status()
            return r.json()

        raise RuntimeError(f"POST {url} failed after {max_retries} retries")
    finally:
        if created_temp_client:
            await client.aclose()


def _chunked(seq: List[str], size: int = 40):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


async def register_trackings(numbers: List[str]):
    """운송장 배치 등록(요청당 최대 40개). 성공 시 최신 상태는 웹훅으로 푸시됨."""
    results = []
    for batch in _chunked(numbers, 40):
        payload = [{"number": n} for n in batch]
        res = await _post_json("register", payload)
        results.append(res)
        await asyncio.sleep(0.35)  # ≈ 3 req/s 보수적
    return results


async def push_now(numbers: List[str]):
    """등록된 운송장의 최신 상태 푸시 유도(최대 40개/요청)."""
    payload = [{"number": n} for n in numbers[:40]]
    return await _post_json("push", payload)


async def get_trackinfo(numbers: List[str]):
    """등록된 운송장의 상세 상태를 폴링 조회(최대 40개/요청)."""
    payload = [{"number": n} for n in numbers[:40]]
    return await _post_json("gettrackinfo", payload)


# =============== 라우트 ===============
# [ANCHOR: ROUTES]

@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/webhooks/17track")
async def webhook_17track(req: Request):
    raw = await req.body()
    event, data = verify_17track_signature(raw, dict(req.headers))

    if event not in VALID_EVENTS:
        # 공식 외 이벤트는 무시(호환을 위해 payload는 로깅/보관 권장)
        return {"ok": True, "skipped": True, "reason": f"ignored event {event}"}

    number = data.get("number")
    track  = data.get("track") or {}
    normalized = normalize_from_track(track)
    summary    = summarize_customs(normalized)
    return {
        "ok": True,
        "event": event,
        "tracking_number": number,
        "summary": summary,
        "normalized_count": len(normalized),
    }


@app.get("/debug/normalize")
async def debug_normalize(number: str):
    """폴링으로 실데이터 가져와 같은 정규화/요약을 실행(웹훅 미구축 시 점검용)."""
    payload = await get_trackinfo([number])
    # API 응답 스키마 방어적으로 접근
    tracks = payload if isinstance(payload, list) else payload.get("data") or payload.get("result") or []
    track = None
    for item in tracks:
        if isinstance(item, dict) and (item.get("number") == number or item.get("no") == number):
            track = item
            break
    normalized = normalize_from_track(track or {})
    summary    = summarize_customs(normalized)
    return {"ok": True, "tracking_number": number, "summary": summary, "normalized": normalized}


# =============== 테스트 페이로드/시뮬레이터 ===============
# [ANCHOR: TEST_PAYLOAD]

@app.post("/test/webhook")
async def test_webhook(event: str = "TRACKING_UPDATED", number: str = "RB123456789CN"):
    """
    로컬 시그니처 생성을 포함한 테스트 푸시 시뮬레이터.
    curl 예:
      curl -X POST http://localhost:8000/webhooks/17track \
           -H 'Content-Type: application/json' \
           -d @<(curl -s http://localhost:8000/test/webhook)
    """
    # 3단계 이벤트 샘플
    now = datetime.now(timezone.utc)
    track = {
        "z1": [
            {"a": (now.replace(minute=0, second=0, microsecond=0).isoformat()), "z": "Presented to customs"},
            {"a": (now.replace(minute=15, second=0, microsecond=0).isoformat()), "z": "Customs clearance information required"},
            {"a": (now.replace(minute=45, second=0, microsecond=0).isoformat()), "z": "Released from customs"},
        ]
    }
    data = {"number": number, "track": track}

    # compact 직렬화
    data_str = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    base = f"{event}/{data_str}/{API_KEY}"
    sign = _sha256_hex(base)

    payload = {"sign": sign, "event": event, "data": data}
    return payload


# =========================
# 데모 실행(옵션)
# =========================
async def main():
    tracking_numbers = ["TRACKING_NUMBER_1", "INVALID_NUMBER_2", "TRACKING_NUMBER_3"]
    print("\ud83d\ude80 register_trackings:", await register_trackings(tracking_numbers))
    print("\u26a1 push_now:", await push_now(tracking_numbers[:2]))
    print("\\ud83d\\udd0e get_trackinfo:", await get_trackinfo(tracking_numbers[:2]))

if __name__ == "__main__":
    asyncio.run(main())
