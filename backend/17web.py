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
- (Demo) ML 예측 API 통합 (Monitoring.py의 BE3Pipeline 사용)

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
from pydantic import BaseModel
from fastapi import Body
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from dateutil import parser as dtp
from typing import List, Dict, Any, Optional, Tuple
import hmac, hashlib, json, re, os, asyncio, random
import httpx
import uuid
from dotenv import load_dotenv
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    DateTime,
    Text,
    func,
    JSON as SAJSON,
)
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.exc import SQLAlchemyError
from contextlib import contextmanager
from pydantic import BaseModel
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy import UniqueConstraint, ForeignKey
import pandas as pd
import numpy as np
from be4_module import register_be4

app = FastAPI(title="17TRACK Customs Filter Enhanced")
register_be4(app)

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

# DB 설정 (환경변수로 오버라이드 가능)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./shipments.db")
# sqlite: check_same_thread=False for multithread with FastAPI
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()

class Shipment(Base):
    __tablename__ = "shipments"
    id = Column(Integer, primary_key=True, index=True)
    tracking_number = Column(String(128), unique=True, index=True, nullable=False)
    carrier = Column(String(80), nullable=True) # 선택적: carrier code/name
    last_status = Column(String(80), nullable=True) # CLEARED / IN_PROGRESS / DELAY / UNKNOWN
    last_event = Column(Text, nullable=True) # 마지막 설명(짧게)
    normalized = Column(Text, nullable=True) # JSON 문자열로 저장(필요시 SAJSON 사용)
    normalized_count = Column(Integer, default=0)
    any_events = Column(Integer, default=0) # boolean-like 0/1
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ShipmentEvent(Base):
    __tablename__ = "shipment_events"
    id = Column(Integer, primary_key=True)
    shipment_id = Column(Integer, ForeignKey("shipments.id", ondelete="CASCADE"), index=True, nullable=False)
    tracking_number = Column(String(128), index=True, nullable=False)
    ts = Column(DateTime(timezone=True), index=True, nullable=False) # 이벤트 시간 (UTC)
    stage = Column(String(32), nullable=False) # CLEARED / IN_PROGRESS / DELAY / UNKNOWN
    desc = Column(Text, nullable=True) # 원문/번역 설명
    source = Column(String(32), nullable=True) # 'webhook' | 'poll' | 'normalized'
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("shipment_id", "ts", "stage", "desc", name="uq_shipment_event_dedup"),
    )

# ======================= 통관/화물 상세 =======================
class ShipmentDetails(Base):
    __tablename__ = "shipment_details"
    id = Column(Integer, primary_key=True)
    shipment_id = Column(Integer, ForeignKey("shipments.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    tracking_number = Column(String(128), index=True, nullable=False)

    # 표시 필드들
    product_info = Column(Text) # 물품 정보 (예: "HUMAN DOLLS OF TEXTILE MATERIALS 1 ...")
    quantity = Column(Integer) # 수량
    weight_kg = Column(String(32)) # "0.1KG"처럼 단위 포함 문자열로 보관
    clearance_status_text = Column(String(120)) # 통관진행상태 (예: "통관목록심사완료")
    progress_status_text = Column(String(120)) # 진행상태 (예: "통관목록심사완료")
    origin_country = Column(String(80)) # 적출국 (예: "중국")
    loading_port = Column(String(120)) # 적재항 (예: "옌타이")
    cargo_type = Column(String(80)) # 화물구분 (예: "수입 일반화물")
    container_no = Column(String(80)) # 컨테이너번호
    customs_office = Column(String(120)) # 세관명 (예: "인천공항세관")
    arrival_port_name = Column(String(120)) # 입항명 (예: "서울/인천")
    arrival_date = Column(DateTime(timezone=True)) # 입항일
    tax_reference_date = Column(DateTime(timezone=True)) # (합산과세 기준일)
    event_processed_at = Column(DateTime(timezone=True)) # 처리일시(이벤트기준)
    sync_processed_at = Column(DateTime(timezone=True)) # 처리일시(동기화기준)
    forwarder_name = Column(String(160)) # 화물운송주선업자(포워더) 업체명
    forwarder_phone = Column(String(64)) # 포워더 전화번호

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class EventOut(BaseModel):
    ts: str
    stage: str
    desc: str | None = None
    source: str | None = None

# 테이블 생성 
Base.metadata.create_all(bind=engine)

@contextmanager
def get_db():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

@app.on_event("startup")
async def _startup():
    global HTTP_CLIENT
    # HTTP/2 활성화는 서버 호환성 문제시 False로 내리세요
    try:
        HTTP_CLIENT = httpx.AsyncClient(timeout=20.0, http2=True)
    except ImportError:
        print("httpx[http2] 미설치. HTTP/1.1로 폴백합니다.")
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
API_KEY  = os.getenv("SEVENTEENTRACK_API_KEY") # 대시보드의 Tracking API Key
USER_AGENT = os.getenv("SEVENTEENTRACK_UA", "customs-filter-demo/1.0")

if not API_KEY:
    print("SEVENTEENTRACK_API_KEY 미설정. .env 또는 환경변수로 넣어주세요.")

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
        r"\b(customs|clearance)\b.*\b(in\s*progress|processing|underway|started|start(?:ed)?)\b",
        r"\b(awaiting|presented\s*to|arrived\s*at)\b.*\bcustoms\b",
        r"통관\s*(진행|중|검토|검사\s*대기)",
        r"清关(中|处理中)|已交海关|报关",
        r"(aduana|despacho).*(progreso|trámite|iniciado)",
        r"通関(手続き中|審査中|進行中)"
    ],
    "DELAY": [
        r"\b(customs|clearance)\b.*\b(delay|on\s*hold|hold|awaiting\s*documents|info\s*required|documentation\s*required)\b",
        r"held\s*by\s*customs|clearance\s*information\s*required",
        r"통관\s*(지연|보류|서류\s*요청|추가\s*정보\s*요청)",
        r"清关(延误|受阻|待资料)|海关(扣留|查验)",
        r"(aduana).*(retraso|retenid[oa]|documentos)",
        r"通関(保留|停止|書類\s*不備)"
    ],
    "CLEARED": [
        r"\b(customs|clearance)\b.*\b(released|cleared|complete(?:d)?|approved)\b(?!\s*information)",
        r"released\s*from\s*customs",
        r"\bdelivered\b|배송\s*완료",
        r"통관\s*(완료|해제|통과)",
        r"清关完成|放行|已放行",
        r"(aduana).*(liberad[oa]|aprobado|completado)",
        r"通関(許可|完了|解放)"
    ],
}
COMPILED = {k: [re.compile(p, re.I) for p in v] for k, v in PATTERNS.items()}

# =============== 유틸 ===============

def _infer_location_from_desc(desc: str) -> tuple[Optional[str], str]:
    """
    description 앞부분에서 '군포HUB, ...' / 'XXX센터 · ...' 같은 패턴을 장소로 추정.
    반환: (추정 장소 or None, 장소 제거 후 나머지 설명)
    """
    if not desc:
        return None, ""
    s = str(desc).strip()
    # 흔한 구분자
    seps = [",", "，", "·", " - ", " – ", " — "]
    for sep in seps:
        if sep in s:
            left, right = s.split(sep, 1)
            cand, rest = left.strip(), right.strip()
            # 장소 힌트 단어
            if len(cand) <= 24 and re.search(r"(HUB|허브|센터|물류|영업소|터미널|분류|대리점)", cand, re.I):
                return cand, rest or s
    # '군포HUB 상품 이동중...' 같이 구분자 없이 붙은 형태
    m = re.match(r"^\s*([^\s,，·]{2,24}HUB)\s+(.*)$", s, re.I)
    if m:
        return m.group(1).strip(), m.group(2).strip() or s
    return None, s

def _ti_view(track: Dict[str, Any]) -> Dict[str, Any]:
    """
    track가 루트(dict)일 수도 있고, track_info(dict) 자체일 수도 있다.
    - track_info 징후가 보이면 그대로 반환
    - 아니면 track.get("track_info")를 반환
    """
    if not track:
        return {}
    # track_info 자체일 때의 힌트 키들
    if any(k in track for k in ("tracking", "latest_status", "latest_event", "milestone", "time_metrics")):
        return track
    # 루트일 때
    return track.get("track_info") or {}

def _count_raw_events(track: Dict[str, Any]) -> int:
    if not track:
        return 0
    total = 0
    # v1: z* 배열
    for k, v in track.items():
        if isinstance(v, list) and (k.startswith("z") or k in {"z0", "z1", "z2", "z9"}):
            total += len(v)

    # v2: track_info 또는 track_info 자체
    ti = _ti_view(track)
    providers = ((ti.get("tracking") or {}).get("providers") or [])
    for p in providers:
        total += len(p.get("events") or [])
    if ti.get("latest_event"):
        total += 1
    return total

def _parse_multi_time(ev: Dict[str, Any]) -> Optional[datetime]:
    # UTC가 있으면 그것을 최우선으로 사용
    s = ev.get("time_utc") or ev.get("time_iso")
    if not s:
        tr = ev.get("time_raw") or {}
        if tr.get("date") and tr.get("time"):
            tz = tr.get("timezone")
            s = f"{tr['date']}T{tr['time']}{tz or 'Z'}"
    if not s:
        return None
    try:
        return _to_dt_utc(s)
    except Exception:
        return None

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
def normalize_from_track(track: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    v1: z0/z1/z2/z9의 {a, z}
    v2: track_info.tracking.providers[].events의 {time_iso|time_utc|time_raw, description, sub_status}
    를 하나의 통관 이벤트 타임라인으로 통합.
    """
    events: List[Dict[str, Any]] = []

    # --- (A) v1 z* 경로 ---
    for k, v in (track or {}).items():
        if isinstance(v, list) and (k.startswith("z") or k in {"z0", "z1", "z2", "z9"}):
            for e in v:
                ts_raw = e.get("a") or e.get("time") or e.get("time_iso")
                desc = e.get("z") or e.get("description")
                stg  = _stage_from_text((desc or "").strip())

                # ★ v1 공식 위치 필드(c/d) 우선 사용
                loc = e.get("c") or e.get("d") or None
                if isinstance(loc, str):
                    loc = loc.strip() or None

                # 없으면 기존 휴리스틱으로 보완
                if (not loc) and desc:
                    inferred, rest = _infer_location_from_desc(desc)
                    if inferred:
                        loc, desc = inferred, rest

                if ts_raw and stg:
                    try:
                        events.append({
                            "ts": _to_dt_utc(ts_raw),
                            "stage": stg,
                            "desc": desc,
                            "location": loc or None,
                        })
                    except Exception:
                        pass

    # --- (B) v2 providers[].events 경로 ---
    ti = _ti_view(track)
    providers = (((ti.get("tracking") or {}).get("providers")) or [])
    for prov in providers:
        for e in (prov.get("events") or []):
            ts   = _parse_multi_time(e)
            desc = (e.get("description") or "").strip()
            stg  = _stage_from_text(desc)

            # 1) v2 sub_status 보조 매핑 (일반 운송 반영)
            if not stg:
                sub = (e.get("sub_status") or "")
                if sub in {"InTransit_CustomsProcessing", "InTransit_Arrival"}:
                    stg = "IN_PROGRESS"
                elif sub in {"InTransit_CustomsReleased", "Delivered", "Delivered_Other"}:
                    stg = "CLEARED"
                elif sub in {"InTransit_Other", "InTransit_Transit"}:  # ★ 추가
                    stg = "IN_PROGRESS"
                elif sub.startswith("Exception"):
                    stg = "DELAY"

            # 2) v2 stage 직접 매핑 (예: Delivered)
            if not stg:
                stage_in_payload = (e.get("stage") or "").lower()
                if stage_in_payload in {"delivered"}:
                    stg = "CLEARED"

            # 3) 위치 추출(문자열/객체 + desc 휴리스틱)
            loc = e.get("location")
            if isinstance(loc, dict):
                loc = (loc.get("city") or loc.get("state") or loc.get("postal_code") or "").strip() or None
            elif isinstance(loc, str):
                loc = loc.strip() or None
            if not loc and desc:
                inferred, rest = _infer_location_from_desc(desc)
                if inferred:
                    loc = inferred
                    desc = rest  # 장소 접두부 제거

            if ts and stg:
                events.append({"ts": ts, "stage": stg, "desc": desc, "location": loc or None})  # ★ location 포함

    le = ti.get("latest_event") or None
    if le:
        ts   = _parse_multi_time(le)
        desc = (le.get("description") or "").strip()
        stg  = _stage_from_text(desc)

        if not stg:
            sub = (le.get("sub_status") or "")
            if sub in {"InTransit_CustomsProcessing", "InTransit_Arrival"}:
                stg = "IN_PROGRESS"
            elif sub in {"InTransit_CustomsReleased", "Delivered", "Delivered_Other"}:
                stg = "CLEARED"
            elif sub in {"InTransit_Other", "InTransit_Transit"}:  # ★ 추가
                stg = "IN_PROGRESS"
            elif sub.startswith("Exception"):
                stg = "DELAY"

        if not stg:
            stage_in_payload = (le.get("stage") or "").lower()
            if stage_in_payload in {"delivered"}:
                stg = "CLEARED"

        # 위치 추출
        loc = le.get("location")
        if isinstance(loc, dict):
            loc = (loc.get("city") or loc.get("state") or loc.get("postal_code") or "").strip() or None
        elif isinstance(loc, str):
            loc = loc.strip() or None
        if not loc and desc:
            inferred, rest = _infer_location_from_desc(desc)
            if inferred:
                loc = inferred
                desc = rest

        if ts and stg:
            events.append({"ts": ts, "stage": stg, "desc": desc, "location": loc or None})

    # 정렬 + 중복 제거 (location 보존 병합)
    events.sort(key=_sort_key)
    merged = {}  # key -> event
    for ev in events:
        key = (ev["ts"].isoformat(), ev["stage"], (ev["desc"] or "")[:160])
        cur = merged.get(key)
        if not cur:
            merged[key] = ev
        else:
            # 기존에 location이 없고, 새로운 이벤트에 location이 있으면 보강
            if (not cur.get("location")) and ev.get("location"):
                cur["location"] = ev["location"]
    # 이후 out 리스트로 변환 (하단 로직과 호환)
    out = list(merged.values())


    # CLEARED가 진행보다 앞서는 역행 케이스 방어
    first_in = next((e for e in out if e["stage"] == "IN_PROGRESS"), None)
    first_clear = next((e for e in out if e["stage"] == "CLEARED"), None)
    if first_clear and first_in and first_clear["ts"] < first_in["ts"]:
        out.sort(key=_sort_key)

    return out


def summarize_customs(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    # 1) 'import' 우선, 없으면 일반 진행/완료도 허용
    
    _has = lambda e, kw: kw in (e.get("desc") or "").lower()
    imp_in = next((e["ts"] for e in events if e["stage"] == "IN_PROGRESS" and _has(e, "import")), None)
    any_in = next((e["ts"] for e in events if e["stage"] == "IN_PROGRESS"), None)
    first_in = imp_in or any_in

    imp_cl = next((e["ts"] for e in events if e["stage"] == "CLEARED" and _has(e, "import")), None)
    any_cl = next((e["ts"] for e in events if e["stage"] == "CLEARED"), None)
    cleared = imp_cl or any_cl

    # 지연은 import 관련만 집계(원래 의도 유지)
    # 단, 통관/배송이 완료된 경우(CLEARED) 이후의 지연은 제외
    delays = []
    for e in events:
        if e["stage"] == "DELAY" and _has(e, "import"):
            # CLEARED 이벤트가 있고, 그 이벤트가 이 지연보다 나중에 발생했다면 제외
            should_include = True
            if cleared:
                # cleared는 datetime 객체
                cleared_dt = cleared
                delay_dt = e["ts"]
                # 완료가 지연보다 나중에 발생했다면 지연 제외 (지연이 해결된 것으로 간주)
                if cleared_dt > delay_dt:
                    should_include = False
            
            if should_include:
                delays.append(dict(at=e["ts"].isoformat() if hasattr(e["ts"], "isoformat") else str(e["ts"]), hint=(e["desc"] or "")[:140]))

    # 누락 보정: 완료만 있고 진행이 없으면 직전 이벤트를 진행으로 간주
    if cleared and not first_in and events:
        try:
            idx = next(i for i, e in enumerate(events) if e["ts"] == cleared)
            if idx > 0:
                first_in = events[idx - 1]["ts"]
        except StopIteration:
            pass

    duration_sec = int((cleared - first_in).total_seconds()) if (first_in and cleared) else None

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


# Pydantic DTO
class ShipmentDetailsIn(BaseModel):
    product_info: Optional[str] = None
    quantity: Optional[int] = None
    weight_kg: Optional[str] = None
    clearance_status_text: Optional[str] = None
    progress_status_text: Optional[str] = None
    origin_country: Optional[str] = None
    loading_port: Optional[str] = None
    cargo_type: Optional[str] = None
    container_no: Optional[str] = None
    customs_office: Optional[str] = None
    arrival_port_name: Optional[str] = None
    arrival_date: Optional[str] = None # ISO 또는 "YYYY-MM-DD"
    tax_reference_date: Optional[str] = None # ISO 또는 "YYYY-MM-DD"
    event_processed_at: Optional[str] = None # ISO
    sync_processed_at: Optional[str] = None # ISO
    forwarder_name: Optional[str] = None
    forwarder_phone: Optional[str] = None

class ShipmentDetailsOut(ShipmentDetailsIn):
    tracking_number: str
    updated_at: Optional[str] = None

def _dt_or_none(s: Optional[str]):
    if not s:
        return None
    try:
        return _to_dt_utc(s)
    except Exception:
        try:
            # 날짜만 들어오는 케이스("2025-01-22")도 수용
            return _to_dt_utc(s + "T00:00:00Z")
        except Exception:
            return None

def _kcs_status_text(status: Optional[str]) -> str:
    # 내부 상태를 한국 관세 표현으로 보조 맵핑
    if (status or "").upper() == "CLEARED":
        return "통관목록심사완료"
    if (status or "").upper() == "DELAY":
        return "통관지연"
    if (status or "").upper() == "IN_PROGRESS":
        return "통관진행중"
    return "확인중"

def upsert_shipment_details(db, shipment_obj: Shipment, patch: Dict[str, Any]):
    if not patch:
        return None
    row = (
        db.query(ShipmentDetails)
          .filter(ShipmentDetails.shipment_id == shipment_obj.id)
          .one_or_none()
    )
    if row is None:
        row = ShipmentDetails(shipment_id=shipment_obj.id, tracking_number=shipment_obj.tracking_number)
        db.add(row)

    # 일반 문자열 필드
    for k in [
        "product_info", "weight_kg", "clearance_status_text", "progress_status_text",
        "origin_country", "loading_port", "cargo_type", "container_no",
        "customs_office", "arrival_port_name", "forwarder_name", "forwarder_phone"
    ]:
        v = patch.get(k, None)
        if v is not None and str(v).strip() != "":
            setattr(row, k, v)

    # 숫자
    if "quantity" in patch and patch["quantity"] is not None:
        row.quantity = int(patch["quantity"])

    # 날짜/시간
    for k in ["arrival_date", "tax_reference_date", "event_processed_at", "sync_processed_at"]:
        v = patch.get(k, None)
        if v:
            dtv = _dt_or_none(v) if isinstance(v, str) else v
            if dtv:
                setattr(row, k, dtv)

    db.flush()
    return row

def _extract_details_best_effort_from_track(
    track: Dict[str, Any],
    tracking_number: Optional[str] = None
) -> Dict[str, Any]:
    """
    목적: 프론트 표시용 'details' 필드 계산
      - origin_country (적출국) + origin_country_source
      - arrival_date (입항일, YYYY-MM-DD)
      - event_processed_at / sync_processed_at (처리일시 2종)
    """
    out: Dict[str, Any] = {}
    ti = _ti_view(track or {})

    # [ANCHOR:ORIGIN_V1_BCODE] v1 track.b(정수 국가코드) → ISO2 → 한글
    # 참고: v1 문서의 country code 표는 https://res.17track.net/asset/carrier/info/country.all.json (권고)
    # 최소 커버(즉시효과): 중국(301) 등 빈출만 내장, 나머지는 미해당 시 패스
    V1_COUNTRY_INT_TO_ISO2 = {
        301: "CN",   # China
        2105: "FR",  # 프랑스 (문서 예시에 등장)
        # 필요시 확장: 운영 중 로그 보고 추가
    }

    # 1) ISO2 → 한글 맵퍼 (기존)
    def _map_iso2_ko(code: Optional[str]) -> Optional[str]:
        if not code or not isinstance(code, str):
            return None
        c = code.strip().upper()
        ISO2_KO = {
            "CN":"중국","KR":"대한민국","JP":"일본","US":"미국","HK":"홍콩","TW":"대만","SG":"싱가포르",
            "MY":"말레이시아","TH":"태국","VN":"베트남","ID":"인도네시아","DE":"독일","NL":"네덜란드",
            "GB":"영국","FR":"프랑스","ES":"스페인","IT":"이탈리아","PL":"폴란드","TR":"튀르키예","AE":"아랍에미리트"
        }
        return ISO2_KO.get(c) if re.fullmatch(r"[A-Z]{2}", c) else None

    # 1.5) v1 전용: track.b가 있으면 최우선 사용
    if "origin_country" not in out:
        b_code = track.get("b")
        if isinstance(b_code, int):
            iso2 = V1_COUNTRY_INT_TO_ISO2.get(b_code)
            if iso2:
                mapped = _map_iso2_ko(iso2)
                if mapped:
                    out["origin_country"] = mapped
                    out["origin_country_source"] = "v1.track.b"

    # 1.6) UPU 트래킹번호 접미(예: *****CN) 힌트 (보조)
    if "origin_country" not in out and isinstance(tracking_number, str) and tracking_number.strip().upper().endswith("CN"):
        out["origin_country"] = "중국"
        out["origin_country_source"] = "tracking_number_suffix"

    # 2) 적출국 (우선순위: provider.country > shipping_info.shipper > 타임존 휴리스틱)
    tracking_obj = ti.get("tracking") or track.get("tracking") or {}
    providers = tracking_obj.get("providers") or []
    if providers:
        provider_info = (providers[0].get("provider") or {})
        prov_country = (provider_info.get("country") or "").strip().upper()
        mapped = _map_iso2_ko(prov_country)
        if mapped and "origin_country" not in out:
            out["origin_country"] = mapped
            out["origin_country_source"] = "provider.country"
        if "origin_country" not in out:
            prov_name = (provider_info.get("name") or "").lower()
            if any(cn in prov_name for cn in ["aliexpress","cainiao","yanwen","yunexpress","china"]):
                out["origin_country"] = "중국"
                out["origin_country_source"] = "provider.name"

    if "origin_country" not in out:
        ship = (ti.get("shipping_info") or {}).get("shipper_address") or {}
        mapped = _map_iso2_ko((ship.get("country") or "").strip().upper())
        if mapped:
            out["origin_country"] = mapped
            out["origin_country_source"] = "shipping_info.shipper_address.country"

    if "origin_country" not in out and providers:
        for p in providers:
            for e in (p.get("events") or [])[:5]:
                tz = ((e.get("time_raw") or {}).get("timezone") or "").strip()
                desc = (e.get("description") or "").lower()
                if any(kw in desc for kw in ["export","departure","leave","shipped"]) and tz in ["+08:00","+0800"]:
                    out["origin_country"] = "중국"
                    out["origin_country_source"] = "timezone_analysis"
                    break
            if "origin_country" in out:
                break

    # 3) 처리일시(이벤트기준/동기화기준)
    max_ts = None
    timeline = normalize_from_track(track or {})
    for e in timeline:
        t = e.get("ts")
        if t and (max_ts is None or t > max_ts):
            max_ts = t
    if providers:
        for p in providers:
            for e in (p.get("events") or []):
                t = _parse_multi_time(e)
                if t and (max_ts is None or t > max_ts):
                    max_ts = t
    if ti.get("latest_event"):
        t = _parse_multi_time(ti["latest_event"])
        if t and (max_ts is None or t > max_ts):
            max_ts = t
    if max_ts:
        out["event_processed_at"] = max_ts.isoformat()
    out["sync_processed_at"] = datetime.now(timezone.utc).isoformat()

    # 4) 입항일(YYYY-MM-DD)
    # v2 milestone/arrival 우선
    if (mil := ti.get("milestone")):
        for m in mil:
            if (m.get("key_stage") or "").lower() == "arrival":
                dtv = _parse_multi_time(m)
                if dtv:
                    out["arrival_date"] = dtv.date().isoformat()
                    break

    # v2 providers[].events 보조
    if "arrival_date" not in out and providers:
        for p in providers:
            for e in (p.get("events") or []):
                stage = (e.get("stage") or "").lower()
                sub = (e.get("sub_status") or "")
                if stage == "arrival" or sub == "InTransit_Arrival":
                    dtv = _parse_multi_time(e)
                    if dtv:
                        out["arrival_date"] = dtv.date().isoformat()
                        break
            if "arrival_date" in out: break

    # v1 z* 텍스트에 'import/도착/입항' 계열 키워드가 있으면 추정
    if "arrival_date" not in out and timeline:
        for e in timeline:
            desc = (e.get("desc") or "").lower()
            if e.get("stage") == "IN_PROGRESS" and (
                "import" in desc or "arriv" in desc or "입항" in desc or "도착" in desc or "到港" in desc
            ):
                if e.get("ts"):
                    out["arrival_date"] = e["ts"].date().isoformat()
                    break

    # [PATCH][ANCHOR:DETAILS-LAST-LOCATION]
    # 3.5) 최신 '위치' 추출 → details.last_location
    if "last_location" not in out:
        last_loc = None
        # 1) providers[].events 역순 스캔
        if providers:
            for p in providers:
                evs = p.get("events") or []
                for e in reversed(evs):
                    loc = e.get("location")
                    desc = (e.get("description") or "").strip()
                    if isinstance(loc, dict):
                        loc = (loc.get("city") or loc.get("state") or loc.get("postal_code") or "").strip() or None
                    elif isinstance(loc, str):
                        loc = loc.strip() or None
                    # [PATCH] location이 비면 desc에서 추정
                    if not loc and desc:
                        inferred, _ = _infer_location_from_desc(desc)
                        if inferred:
                            loc = inferred
                    if loc:
                        last_loc = loc
                        break
                if last_loc:
                    break
        # 2) latest_event 보조
        if not last_loc and ti.get("latest_event"):
            le = ti["latest_event"]
            loc = le.get("location")
            desc = (le.get("description") or "").strip()
            if isinstance(loc, dict):
                loc = (loc.get("city") or loc.get("state") or loc.get("postal_code") or "").strip() or None
            elif isinstance(loc, str):
                loc = loc.strip() or None
            if not loc and desc:
                inferred, _ = _infer_location_from_desc(desc)
                if inferred:
                    loc = inferred
            if loc:
                last_loc = loc

        # ★ NEW: 3) v1 z* 보조 (desc에서 장소 추정)
        if not last_loc:
            for k, v in (track or {}).items():
                if isinstance(v, list) and (k.startswith("z") or k in {"z0","z1","z2","z9"}):
                    for e in reversed(v):  # 가장 최근부터
                        desc = (e.get("z") or e.get("description") or "").strip()
                        if desc:
                            inferred, _ = _infer_location_from_desc(desc)
                            if inferred:
                                last_loc = inferred
                                break
                if last_loc:
                    break

        if last_loc:
            out["last_location"] = last_loc

    return out


def _extract_raw_provider_events_min(track: Dict[str, Any]) -> list[dict]:
    """
    providers[].events + v1 z* 에서 화면용 최소필드만 추출
    - ts: ISO8601(가능하면 UTC, 없으면 None)
    - desc: description (장소 접두어 제거)
    - location: 문자열(없으면 description 휴리스틱 추출)
    """
    ti = _ti_view(track or {})
    providers = ((ti.get("tracking") or {}).get("providers")) or []
    out: list[dict] = []

    # v2 providers[].events
    for p in providers:
        for e in (p.get("events") or []):
            dt = _parse_multi_time(e)
            desc = (e.get("description") or "").strip()
            loc = e.get("location")
            if isinstance(loc, dict):
                loc = (loc.get("city") or loc.get("state") or loc.get("postal_code") or "").strip() or None
            elif isinstance(loc, str):
                loc = loc.strip() or None
            if not loc and desc:
                inferred, rest = _infer_location_from_desc(desc)
                if inferred:
                    loc, desc = inferred, rest
            if dt or desc or loc:
                out.append({
                    "ts": dt.isoformat().replace("+00:00","Z") if dt else None,
                    "desc": desc or None,
                    "location": loc or None,
                })

    # v2 latest_event 보조
    le = ti.get("latest_event")
    if isinstance(le, dict):
        dt = _parse_multi_time(le)
        desc = (le.get("description") or "").strip()
        loc = le.get("location")
        if isinstance(loc, dict):
            loc = (loc.get("city") or loc.get("state") or loc.get("postal_code") or "").strip() or None
        elif isinstance(loc, str):
            loc = loc.strip() or None
        if not loc and desc:
            inferred, rest = _infer_location_from_desc(desc)
            if inferred:
                loc, desc = inferred, rest
        if dt or desc or loc:
            out.append({
                "ts": dt.isoformat().replace("+00:00","Z") if dt else None,
                "desc": desc or None,
                "location": loc or None,
            })

    # v1 z* 경로 (공식 위치 필드 우선)
    for k, v in (track or {}).items():
        if isinstance(v, list) and (k.startswith("z") or k in {"z0","z1","z2","z9"}):
            for e in v:
                ts_raw = e.get("a") or e.get("time") or e.get("time_iso")
                dt = None
                try:
                    if ts_raw:
                        dt = _to_dt_utc(ts_raw)
                except Exception:
                    dt = None

                desc = (e.get("z") or e.get("description") or "").strip()

                # ★ v1: c/d를 우선 읽음
                loc = e.get("c") or e.get("d") or None
                if isinstance(loc, str):
                    loc = loc.strip() or None

                # 없으면 설명에서 추정
                if (not loc) and desc:
                    inferred, rest = _infer_location_from_desc(desc)
                    if inferred:
                        loc, desc = inferred, rest

                out.append({
                    "ts": dt.isoformat().replace("+00:00","Z") if dt else None,
                    "desc": desc or None,
                    "location": loc or None,
                })


    # 정렬+중복제거
    dedup = set()
    out2 = []
    for x in out:
        key = (x["ts"], x["desc"], x["location"])
        if key in dedup:
            continue
        dedup.add(key)
        out2.append(x)
    out2.sort(key=lambda x: (x["ts"] is None, x["ts"]))
    return out2

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
    track  = data.get("track") or data.get("track_info") or data
    normalized = normalize_from_track(track)
    summary    = summarize_customs(normalized)

    any_events = _count_raw_events(track) > 0
    if summary.get("status") == "UNKNOWN" and any_events:
        summary["status"] = "PRE_CUSTOMS"

    details = _extract_details_best_effort_from_track(track, tracking_number=number)
    raw_provider_events = _extract_raw_provider_events_min(track)
    return {
        "ok": True,
        "event": event,
        "tracking_number": number,
        "summary": summary,
        "normalized_count": len(normalized),
        "any_events": any_events,
        "details": details,
        "raw_provider_events": raw_provider_events,
    }

@app.get("/debug/normalize")
async def debug_normalize(number: str):
    """폴링으로 실데이터 가져와 같은 정규화/요약을 실행(웹훅 미구축 시 점검용)."""
    payload = await get_trackinfo([number])
    
    # API 응답 파싱
    tracks: List[Dict[str, Any]] = []
    if isinstance(payload, list):
        tracks = payload
    elif isinstance(payload, dict):
        data_obj = payload.get("data")
        if isinstance(data_obj, dict):
            buckets: List[Dict[str, Any]] = []
            for key in ("accepted", "result", "list"):
                v = data_obj.get(key)
                if isinstance(v, list):
                    buckets.extend(v)
            tracks = buckets
        elif isinstance(payload.get("result"), list) or isinstance(payload.get("list"), list):
            tracks = payload.get("result") or payload.get("list") or []
        elif payload.get("number"):
            tracks = [payload]

    track_item: Optional[Dict[str, Any]] = None
    for item in tracks:
        if not isinstance(item, dict):
            continue
        if str(item.get("number") or item.get("no") or "") == str(number):
            track_item = item
            break

    track = None
    if track_item:
        # v1: track, v2: track_info
        track = track_item.get("track") or track_item.get("track_info") or track_item

    # ===== 핵심: provider에서 적출국 먼저 추출 =====
    origin_country = None
    origin_source = None
    
    if track:
        # v1 API 구조 (실제 사용중)
        tracking = track.get("tracking") or {}
        providers = tracking.get("providers") or []
        
        # v2 API 구조 대비
        if not providers:
            ti = _ti_view(track)
            tracking = ti.get("tracking") or {}
            providers = tracking.get("providers") or []
        
        if providers and len(providers) > 0:
            provider_info = providers[0].get("provider", {})
            
            # 1. provider.country 직접 확인
            prov_country = provider_info.get("country")
            if prov_country == "CN":
                origin_country = "중국"
                origin_source = "provider.country"
                print(f"[API] Found origin from provider.country: CN → 중국")
            elif prov_country == "KR":
                origin_country = "대한민국"
                origin_source = "provider.country"
            
            # 2. provider.name으로 추론
            if not origin_country:
                prov_name = (provider_info.get("name") or "").lower()
                if any(cn in prov_name for cn in ["aliexpress", "cainiao", "yanwen", "yunexpress", "china"]):
                    origin_country = "중국"
                    origin_source = "provider.name"
                    print(f"[API] Found origin from provider.name: {provider_info.get('name')} → 중국")
            
            # 3. 첫 이벤트의 타임존으로 추론
            if not origin_country:
                events = providers[0].get("events", [])
                for e in events[:3]:  # 초기 3개 이벤트만
                    time_raw = e.get("time_raw", {})
                    tz = time_raw.get("timezone", "")
                    if tz in ["+08:00", "+0800"]:
                        desc = (e.get("description") or "").lower()
                        if any(kw in desc for kw in ["shipped", "export", "departure"]):
                            origin_country = "중국"
                            origin_source = "timezone"
                            print(f"[API] Found origin from timezone: +08:00 → 중국")
                            break

    # 정규화 및 요약
    normalized = normalize_from_track(track or {})
    summary = summarize_customs(normalized)
    
    any_events = _count_raw_events(track or {}) > 0
    if summary.get("status") == "UNKNOWN" and any_events:
        summary["status"] = "PRE_CUSTOMS"

    # details 추출 (이미 provider 우선순위가 적용됨)
    details = _extract_details_best_effort_from_track(track or {}, tracking_number=number)
    
    # 강제 오버라이드 (백업)
    if origin_country and (not details.get("origin_country")):
        details["origin_country"] = origin_country
        details["origin_country_source"] = f"OVERRIDE:{origin_source}"
        print(f"[API] Override applied: {origin_country}")

    raw_provider_events = _extract_raw_provider_events_min(track or {})

    return {
        "ok": True,
        "tracking_number": number,
        "summary": summary,
        "normalized": normalized,
        "any_events": any_events,
        "details": details,
        "raw_provider_events": raw_provider_events,
        "_debug": {
            "provider_found": bool(providers) if track else False,
            "origin_detected": origin_country,
            "source": origin_source
        }

    }

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

def _serialize_normalized(ev_list):
    try:
        return json.dumps([
            {
                "ts": (e["ts"].isoformat() if hasattr(e["ts"], "isoformat") else str(e["ts"])),
                "stage": e["stage"],
                "desc": e.get("desc", ""),
                "location": e.get("location", None),
            } for e in ev_list
        ], ensure_ascii=False)
    except Exception:
        return json.dumps([], ensure_ascii=False)

def _upsert_events_for_shipment(
    db,
    shipment_obj: Shipment,
    normalized_events: List[Dict[str, Any]],
    source: str = "normalized",
) -> int:
    """
    normalized_events 아이템 예시:
    { "ts": "2025-09-16T13:30:00Z", "stage": "IN_PROGRESS", "desc": "..." }
    """
    if not normalized_events:
        return 0

    # 1) 입력단 중복 제거 (동일 페이로드가 같은 요청 내에서 여러 번 들어오는 경우 방어)
    seen: set[tuple[str, str, str]] = set()
    rows: List[Dict[str, Any]] = []

    for e in normalized_events:
        raw_ts = e.get("ts")
        stage = (e.get("stage") or "").strip().upper()
        desc = (e.get("desc") or "").strip()

        if not raw_ts or not stage:
            continue

        # 문자열/Datetime 모두 허용
        try:
            ts_dt = dtp.parse(raw_ts) if isinstance(raw_ts, str) else raw_ts
        except Exception:
            continue

        # 필요하면 미세중복 방지용으로 마이크로초 제거 (선택)
        # ts_dt = ts_dt.replace(microsecond=0)

        key = (ts_dt.isoformat(), stage, desc)
        if key in seen:
            continue
        seen.add(key)

        rows.append({
            "shipment_id": shipment_obj.id,
            "tracking_number": shipment_obj.tracking_number,
            "ts": ts_dt,
            "stage": stage,
            "desc": desc, # 컬럼명은 desc (SQLAlchemy가 적절히 quoting)
            "source": source,
        })

    if not rows:
        return 0

    # 2) DB 레벨 중복 무시 (UNIQUE (shipment_id, ts, stage, desc))
    stmt = sqlite_insert(ShipmentEvent).values(rows).on_conflict_do_nothing(
        index_elements=["shipment_id", "ts", "stage", "desc"]
    )
    result = db.execute(stmt)
    # 일부 드라이버에서 rowcount 가 None일 수 있으므로 보조 지표로만 사용
    return result.rowcount or 0

def upsert_shipment(db, tracking_number: str, summary: Dict[str, Any], normalized_events: List[Dict[str, Any]], any_events: bool = False, carrier: Optional[str] = None):
    """
    안전 업서트:
      - 만약 기존 레코드가 있고 incoming cleared 시간이 기존보다 과거면 무시(역행 방어)
      - normalized/events 는 문자열로 저장(간단히)
    """
    try:
        obj = db.query(Shipment).filter(Shipment.tracking_number == str(tracking_number)).one_or_none()
        normalized_json = _serialize_normalized(normalized_events)
        now = datetime.now(timezone.utc)
        incoming_status = summary.get("status")
        incoming_cleared_at = summary.get("cleared_at")
        incoming_in_progress_at = summary.get("in_progress_at")

        if obj is None:
            obj = Shipment(
                tracking_number=str(tracking_number),
                carrier=carrier,
                last_status=incoming_status,
                last_event=(normalized_events[-1]["desc"] if normalized_events else None),
                normalized=normalized_json,
                normalized_count=len(normalized_events),
                any_events=1 if any_events else 0,
            )
            db.add(obj)
            db.flush()
            return obj

        # 기존 레코드가 있다면 역행/중복 방어 로직
        # 기존의 cleared_at 혹은 in_progress_at을 normalized에서 추출해 비교 (간단하게 문자열 검색)
        try:
            existing_norm = json.loads(obj.normalized or "[]")
            existing_cleared = None
            for e in existing_norm:
                if e.get("stage") == "CLEARED":
                    existing_cleared = e.get("ts")
                    break
        except Exception:
            existing_cleared = None

        # 만약 incoming cleared가 있고 existing_cleared가 더 최신이면, incoming를 무시 (역행 방어)
        if incoming_cleared_at and existing_cleared:
            try:
                existing_dt = dtp.parse(existing_cleared)
                incoming_dt = dtp.parse(incoming_cleared_at)
                if incoming_dt < existing_dt:
                    # 역행하므로 요약만 업데이트하지 않고 무시
                    # 단, 상태가 더 상세하면 보완(예: existing UNKNOWN -> incoming CLEARED)
                    if STAGE_PRIORITY.get(incoming_status, 99) > STAGE_PRIORITY.get(obj.last_status or "UNKNOWN", -1):
                        obj.last_status = incoming_status
                    # normalized는 더 긴 것이 있으면 교체하지 않음
                    obj.any_events = int(any_events or obj.any_events)
                    return obj
            except Exception:
                pass

        # 일반 업서트: 더 최신 정보로 교체
        obj.carrier = carrier or obj.carrier
        obj.last_status = incoming_status or obj.last_status
        obj.last_event = (normalized_events[-1]["desc"] if normalized_events else obj.last_event)
        obj.normalized = normalized_json
        obj.normalized_count = len(normalized_events)
        obj.any_events = int(any_events or obj.any_events)
        obj.updated_at = now
        db.add(obj)

        # --- 자동 상세 채움(가능한 범위) ---
        # 상태 텍스트는 내부 요약 → 한국식 표현으로 보조 매핑
        auto_patch = {
            "clearance_status_text": _kcs_status_text(incoming_status),
            "progress_status_text": _kcs_status_text(incoming_status),
        }
        # 최신 이벤트 → 처리일시(이벤트기준)
        if normalized_events:
            latest = normalized_events[-1]
            if latest.get("ts"):
                auto_patch["event_processed_at"] = (
                    latest["ts"] if isinstance(latest["ts"], str) else latest["ts"].isoformat()
                )
        # 동기화 기준 처리일시(업서트 수행 시각)
        auto_patch["sync_processed_at"] = datetime.now(timezone.utc).isoformat()

        # 17TRACK payload에서 힌트 추출 (적재항/적출국 등)
        # upsert_shipment 호출부에서 track 객체가 없으니, 여기서는 생략하거나
        # _fetch_and_upsert_many() 쪽에서 추출하여 넘겨도 OK. 우선 normalized만으로 진행.
        upsert_shipment_details(db, obj, auto_patch)
        # 기존 코드의 obj 생성/갱신 후, 커밋 전에 이벤트 적재
        _inserted = _upsert_events_for_shipment(db, obj, normalized_events, source="normalized")
        # 필요시 로깅: print(f"events inserted: {_inserted}")

        db.flush()
        return obj

    except SQLAlchemyError as e:
        db.rollback()
        raise

# ---------- END: 업서트 유틸 ----------


# ---------- START: 관리자 엔드포인트들 (동기화 / 샘플 추가 / 수동 조회) ----------

from fastapi import BackgroundTasks

# ===== 파일에서 번호 읽어 대량 폴링 → DB 업서트 =====
from fastapi import Query

def _parse_numbers_str(s: str) -> List[str]:
    import re
    tokens = re.split(r"[,\n\r\t ]+", s.strip())
    return [t for t in tokens if t]

def _load_numbers_from_file(path: str) -> List[str]:
    if not os.path.exists(path):
        return []
    try:
        if path.lower().endswith(".json"):
            with open(path, "r", encoding="utf-8") as f:
                arr = json.load(f)
            return [str(x).strip() for x in arr if str(x).strip()] if isinstance(arr, list) else []
        else:
            with open(path, "r", encoding="utf-8") as f:
                return _parse_numbers_str(f.read())
    except Exception:
        return []

async def _fetch_and_upsert_many(numbers: List[str], batch: int = 40) -> Dict[str, Any]:
    numbers = [str(n).strip() for n in numbers if str(n).strip()]
    if not numbers:
        return {"ok": True, "synced": 0, "reason": "no numbers in file"}

    total_synced, processed = 0, set()

    for chunk in _chunked(numbers, batch):
        try:
            payload = await get_trackinfo(chunk)
        except Exception:
            payload = None

        # 스키마 방어
        tracks: List[Dict[str, Any]] = []
        if isinstance(payload, list):
            tracks = payload
        elif isinstance(payload, dict):
            data_obj = payload.get("data")
            if isinstance(data_obj, dict):
                buckets: List[Dict[str, Any]] = []
                for key in ("accepted", "result", "list"):
                    v = data_obj.get(key)
                    if isinstance(v, list):
                        buckets.extend(v)
                tracks = buckets
            elif isinstance(payload.get("result"), list) or isinstance(payload.get("list"), list):
                tracks = payload.get("result") or payload.get("list") or []
            elif payload.get("number"):
                tracks = [payload]

        # 업서트
        with get_db() as db:
            for item in tracks:
                if not isinstance(item, dict):
                    continue
                num = item.get("number") or item.get("no") or item.get("tracking") or ""
                if not num:
                    continue
                processed.add(str(num))
                track_obj = item.get("track") or item.get("track_info") or item
                normalized = normalize_from_track(track_obj or {})
                summary = summarize_customs(normalized)
                any_events = _count_raw_events(track_obj or {}) > 0
                upsert_shipment(db, num, summary, normalized, any_events)
                total_synced += 1

        await asyncio.sleep(0.25 + random.random() * 0.2)

    # 응답에 없었던 번호도 최소 행 생성

    return {"ok": True, "requested": len(numbers), "synced": total_synced}

@app.post("/admin/fetch-from-file")
async def admin_fetch_from_file(
    path: str = Query(None, description="파일 경로 (없으면 기본 파일들 자동 탐색)"),
    batch: int = Query(40, ge=1, le=40),
):
    """
    파일에서 번호 읽어 일괄 폴링→DB 저장.
    - path 미지정: tracking_numbers.json → 없으면 tracking_numbers.txt 순으로 찾음.
    - path 지정: 해당 경로(.json 또는 .txt)
    """
    candidates = [path] if path else ["tracking_numbers.json", "tracking_numbers.txt"]
    numbers: List[str] = []
    picked = None
    for p in candidates:
        if p and os.path.exists(p):
            picked = p
            numbers = _load_numbers_from_file(p)
            break
    if not numbers:
        return {"ok": False, "error": "no numbers file found or empty", "tried": candidates}
    res = await _fetch_and_upsert_many(numbers, batch=batch)
    res["file"] = picked
    return res

def _parse_normalized_json(s: Optional[str]) -> list[dict]:
    if not s:
        return []
    try:
        v = json.loads(s)
        return v if isinstance(v, list) else []
    except Exception:
        return []

def _serialize_row(obj: Shipment) -> dict:
    """DB Shipment -> 프론트 공통 포맷"""
    norm = _parse_normalized_json(obj.normalized)
    last_ev_desc = (norm[-1].get("desc") if norm else None)
    last_ev_ts   = (norm[-1].get("ts")   if norm else None)

    # 화면 공통 스키마
    return {
        "number": obj.tracking_number,
        "status": (obj.last_status or "UNKNOWN").upper(),
        "last_event_text": obj.last_event or last_ev_desc or "",
        "last_event_at": obj.updated_at.isoformat() if getattr(obj, "updated_at", None) else last_ev_ts,
        "source": "17TRACK" if (obj.any_events or 0) else "DB",
        # 참고용(프론트에서 쓰면 편한 필드들)
        "carrier": obj.carrier,
        "normalized_count": obj.normalized_count,
    }

# ======= 목록 엔드포인트들 =======

@app.get("/admin/shipments")
def admin_shipments():
    """관리자: DB의 모든 운송장 최신순"""
    with get_db() as db:
        rows = (
            db.query(Shipment)
              .order_by(Shipment.updated_at.desc(), Shipment.created_at.desc())
              .all()
        )
        return [_serialize_row(x) for x in rows]

@app.get("/admin/list-shipments")
def admin_list_shipments():
    """레거시 호환(같은 응답)"""
    return admin_shipments()

@app.get("/user/trackings")
def user_trackings():
    """사용자: DB의 모든 운송장 목록 (같은 포맷)"""
    return admin_shipments()

def translate_event_description(desc: str, stage: str) -> str:
    """이벤트 설명을 한국어로 번역"""
    if not desc:
        return ""
    
    desc_lower = desc.lower().strip()
    
    # 통관 완료 관련
    if stage == "CLEARED":
        if any(kw in desc_lower for kw in ["released", "cleared", "complete", "approved", "통과", "완료", "해제"]):
            if "customs" in desc_lower or "통관" in desc:
                return "통관이 완료되었습니다"
            return "처리가 완료되었습니다"
        return "통관 완료"
    
    # 통관 진행 중 관련
    if stage == "IN_PROGRESS":
        if any(kw in desc_lower for kw in ["presented", "arrived", "processing", "underway", "진행", "도착", "접수"]):
            if "customs" in desc_lower or "통관" in desc:
                return "통관 절차가 진행 중입니다"
            if "arrived" in desc_lower or "도착" in desc:
                return "화물이 도착했습니다"
            return "처리가 진행 중입니다"
        return "통관 진행 중"
    
    # 세관 보류 관련
    if stage == "DELAY":
        if any(kw in desc_lower for kw in ["delay", "hold", "required", "documentation", "지연", "보류", "요청"]):
            if "information" in desc_lower or "document" in desc_lower or "서류" in desc or "정보" in desc:
                return "서류 보완이 필요합니다"
            if "customs" in desc_lower or "통관" in desc:
                return "통관이 지연되고 있습니다"
            return "처리가 보류되었습니다"
        return "세관 보류"
    
    # 일반적인 패턴 매칭
    translations = {
        # 영어 패턴
        "presented to customs": "세관에 제출되었습니다",
        "customs clearance": "통관 절차",
        "customs processing": "통관 처리 중",
        "released from customs": "세관에서 방출되었습니다",
        "held by customs": "세관에서 보류 중",
        "customs clearance information required": "통관 정보가 필요합니다",
        "arrived at": "도착했습니다",
        "departed from": "출발했습니다",
        "in transit": "운송 중",
        "out for delivery": "배송 출발",
        "delivered": "배송 완료",
        
        # 중국어 패턴 (간단한 매핑)
        "清关": "통관",
        "清关完成": "통관 완료",
        "清关中": "통관 진행 중",
        "已交海关": "세관에 제출됨",
        "海关放行": "세관 방출",
        "海关扣留": "세관 보류",
        
        # 일본어 패턴
        "通関": "통관",
        "通関完了": "통관 완료",
        "通関手続き中": "통관 절차 진행 중",
    }
    
    # 직접 매칭 시도
    for pattern, translation in translations.items():
        if pattern.lower() in desc_lower:
            return translation
    
    # 한국어가 이미 포함되어 있으면 그대로 반환
    if any(ord(char) >= 0xAC00 and ord(char) <= 0xD7A3 for char in desc):
        return desc
    
    # 기본값: 원문 반환하되 상태 정보 추가
    return desc


@app.get("/api/recent-events")
async def get_recent_events(
    limit: int = Query(20, ge=1, le=100),
    tracking_numbers: Optional[str] = Query(None, description="쉼표로 구분된 운송장 번호 목록 (필터링용)")
):
    """최근 통관 이벤트 조회 (활동 피드용) - 17track API에서 직접 조회"""
    print(f"[recent-events] 요청 받음: limit={limit}, tracking_numbers={tracking_numbers}")
    
    # tracking_numbers 파라미터가 필수
    if not tracking_numbers:
        print(f"[recent-events] 경고: tracking_numbers 파라미터가 없음. 빈 배열 반환")
        return []
    
    # 쉼표로 구분된 운송장 번호 목록 파싱
    numbers_list = [num.strip() for num in tracking_numbers.split(",") if num.strip()]
    if not numbers_list:
        print(f"[recent-events] 경고: 파싱된 운송장 번호가 없음. 빈 배열 반환")
        return []
    
    print(f"[recent-events] 조회할 운송장 번호: {numbers_list}")
    
    # 17track API에서 직접 조회
    result = []
    
    # 40개씩 배치로 나누어 조회 (17track API 제한)
    for chunk in _chunked(numbers_list, 40):
        try:
            # 17track API 호출
            print(f"[recent-events] 17track API 호출 중: {len(chunk)}개 운송장")
            payload = await get_trackinfo(chunk)
            print(f"[recent-events] 17track API 응답 받음: type={type(payload)}, keys={list(payload.keys()) if isinstance(payload, dict) else 'not dict'}")
        except Exception as e:
            print(f"[recent-events] 17track API 호출 실패: {e}")
            import traceback
            traceback.print_exc()
            continue
        
        # 스키마 방어: payload에서 track 정보 추출
        tracks: List[Dict[str, Any]] = []
        if isinstance(payload, list):
            tracks = payload
        elif isinstance(payload, dict):
            data_obj = payload.get("data")
            if isinstance(data_obj, dict):
                buckets: List[Dict[str, Any]] = []
                for key in ("accepted", "result", "list"):
                    v = data_obj.get(key)
                    if isinstance(v, list):
                        buckets.extend(v)
                tracks = buckets
            elif isinstance(payload.get("result"), list) or isinstance(payload.get("list"), list):
                tracks = payload.get("result") or payload.get("list") or []
            elif payload.get("number"):
                tracks = [payload]
        
        if not tracks:
            print(f"[recent-events] 경고: payload에서 tracks를 찾을 수 없음. payload type={type(payload)}, keys={list(payload.keys()) if isinstance(payload, dict) else 'not dict'}")
            continue
        
        print(f"[recent-events] 추출된 tracks 수: {len(tracks)}")
        
        # 각 운송장의 최신 이벤트 추출
        for item in tracks:
            if not isinstance(item, dict):
                continue
            
            num = item.get("number") or item.get("no") or item.get("tracking") or ""
            if not num:
                continue
            
            track_obj = item.get("track") or item.get("track_info") or item
            
            # 이벤트 정규화 (통관 이벤트 우선)
            normalized = normalize_from_track(track_obj or {})
            
            # 통관 이벤트가 없으면 최신 일반 이벤트 추출
            if not normalized:
                print(f"[recent-events] 통관 이벤트 없음: {num}, track_obj type={type(track_obj)}, keys={list(track_obj.keys()) if isinstance(track_obj, dict) else 'not dict'}")
                # v2 providers에서 최신 이벤트 추출
                ti = _ti_view(track_obj or {})
                providers = (((ti.get("tracking") or {}).get("providers")) or [])
                latest_general_event = None
                latest_time = None
                
                for prov in providers:
                    for e in (prov.get("events") or []):
                        ts = _parse_multi_time(e)
                        if ts and (latest_time is None or ts > latest_time):
                            latest_time = ts
                            latest_general_event = {
                                "ts": ts,
                                "stage": "UNKNOWN",
                                "desc": (e.get("description") or "").strip() or "이벤트 정보 없음"
                            }
                
                # latest_event에서도 확인
                le = ti.get("latest_event")
                if le:
                    ts = _parse_multi_time(le)
                    if ts and (latest_time is None or ts > latest_time):
                        latest_time = ts
                        latest_general_event = {
                            "ts": ts,
                            "stage": "UNKNOWN",
                            "desc": (le.get("description") or "").strip() or "이벤트 정보 없음"
                        }
                
                if latest_general_event:
                    print(f"[recent-events] 최신 일반 이벤트 사용: {num}, desc={latest_general_event.get('desc', '')[:50]}")
                    normalized = [latest_general_event]
                else:
                    print(f"[recent-events] 이벤트 없음: {num}")
                    continue
            
            # 최신 이벤트 (가장 최근 시간)
            latest_event = max(normalized, key=lambda e: e.get("ts") or datetime.min.replace(tzinfo=timezone.utc))
            
            stage = latest_event.get("stage", "UNKNOWN")
            desc = latest_event.get("desc", "")
            event_time = latest_event.get("ts")
            
            # 상태에 따른 한글 표시
            status_ko = {
                "CLEARED": "통관 완료",
                "IN_PROGRESS": "통관 진행 중",
                "DELAY": "세관 보류",
                "UNKNOWN": "확인 중"
            }.get(stage, "확인 중")
            
            # 이벤트 설명 한국어 번역
            description_ko = translate_event_description(desc or "", stage)
            
            # 상대 시간 계산
            if event_time and isinstance(event_time, datetime):
                now = datetime.now(timezone.utc)
                if event_time.tzinfo is None:
                    event_time = event_time.replace(tzinfo=timezone.utc)
                else:
                    event_time = event_time.astimezone(timezone.utc)
                
                diff = now - event_time
                
                if diff.total_seconds() < 60:
                    time_ago = "방금 전"
                elif diff.total_seconds() < 3600:
                    minutes = int(diff.total_seconds() / 60)
                    time_ago = f"{minutes}분 전"
                elif diff.total_seconds() < 86400:
                    hours = int(diff.total_seconds() / 3600)
                    time_ago = f"{hours}시간 전"
                elif diff.days < 7:
                    days = diff.days
                    time_ago = f"{days}일 전"
                else:
                    time_ago = event_time.strftime("%Y-%m-%d")
            else:
                time_ago = "알 수 없음"
                event_time = datetime.now(timezone.utc)
            
            result.append({
                "id": f"{num}_{hash(str(event_time))}",  # 고유 ID 생성
                "tracking_number": num,
                "title": f"{status_ko} - #{num[-8:]}",
                "description": description_ko,
                "time": time_ago,
                "time_iso": event_time.isoformat() if hasattr(event_time, "isoformat") else str(event_time),
                "stage": stage,
                "status": status_ko,
                "source": "17TRACK"
            })
    
    # 시간순으로 정렬 (최신순) 및 limit 적용
    result.sort(key=lambda x: x.get("time_iso", ""), reverse=True)
    print(f"[recent-events] 최종 결과: {len(result)}개 이벤트 반환")
    return result[:limit]


@app.get("/admin/shipments/{number}/events")
def admin_shipment_events(number: str):
    with get_db() as db:
        ship = db.query(Shipment).filter(Shipment.tracking_number == number).first()
        if not ship:
            raise HTTPException(status_code=404, detail="shipment not found")

        rows = (db.query(ShipmentEvent)
                  .filter(ShipmentEvent.shipment_id == ship.id)
                  .order_by(ShipmentEvent.ts.asc())
                  .all())

        # 만약 과거 데이터로 인해 이벤트 테이블이 비어있다면, normalized에서 백필 + 즉시 반환
        if not rows:
            try:
                norm = json.loads(ship.normalized or "[]")
            except Exception:
                norm = []
            # 백필
            if norm:
                _upsert_events_for_shipment(db, ship, norm, source="normalized")
                db.commit()
                rows = (db.query(ShipmentEvent)
                          .filter(ShipmentEvent.shipment_id == ship.id)
                          .order_by(ShipmentEvent.ts.asc())
                          .all())

        return [
            EventOut(
                ts=(r.ts.isoformat() if hasattr(r.ts, "isoformat") else str(r.ts)),
                stage=r.stage,
                desc=r.desc,
                source=r.source,
            ).model_dump()
            for r in rows
        ]

@app.get("/admin/shipments/{number}/details")
def admin_get_shipment_details(number: str):
    with get_db() as db:
        ship = db.query(Shipment).filter(Shipment.tracking_number == number).one_or_none()
        if not ship:
            raise HTTPException(status_code=404, detail="shipment not found")
        row = db.query(ShipmentDetails).filter(ShipmentDetails.shipment_id == ship.id).one_or_none()
        if not row:
            # 비어 있으면 기본 구조로 응답
            return ShipmentDetailsOut(tracking_number=number).model_dump()

        def _iso(dt):
            return dt.isoformat() if getattr(dt, "isoformat", None) else None

        return ShipmentDetailsOut(
            tracking_number=number,
            product_info=row.product_info,
            quantity=row.quantity,
            weight_kg=row.weight_kg,
            clearance_status_text=row.clearance_status_text,
            progress_status_text=row.progress_status_text,
            origin_country=row.origin_country,
            loading_port=row.loading_port,
            cargo_type=row.cargo_type,
            container_no=row.container_no,
            customs_office=row.customs_office,
            arrival_port_name=row.arrival_port_name,
            arrival_date=_iso(row.arrival_date),
            tax_reference_date=_iso(row.tax_reference_date),
            event_processed_at=_iso(row.event_processed_at),
            sync_processed_at=_iso(row.sync_processed_at),
            forwarder_name=row.forwarder_name,
            forwarder_phone=row.forwarder_phone,
            updated_at=_iso(row.updated_at),
        ).model_dump()


# === DEBUG: 로컬 JSON을 그대로 넣어 정규화/요약/상세를 확인 ===
# 검색어 앵커: [ANCHOR: DEBUG_FROM_JSON]
from fastapi import Body

@app.post("/debug/from-json")
def debug_from_json(payload: dict = Body(...)):
    """
    업로드한 17TRACK v2 샘플(JSON)을 그대로 넣어 동작 확인.
    - payload.track_info 가 있으면 우선 사용
    - 없으면 payload 루트를 track_info처럼 취급
    """
    track = payload.get("track_info") or payload
    normalized = normalize_from_track(track)
    summary    = summarize_customs(normalized)
    any_events = _count_raw_events(track) > 0
    if summary.get("status") == "UNKNOWN" and any_events:
        summary["status"] = "PRE_CUSTOMS"
    details = _extract_details_best_effort_from_track(
        track,
        tracking_number=(payload.get("number") or (track.get("number") if isinstance(track, dict) else None))
    )
    raw_provider_events = _extract_raw_provider_events_min(track)
    return {
        "ok": True,
        "summary": summary,
        "normalized": normalized,
        "any_events": any_events,
        "details": details,
        "raw_provider_events": raw_provider_events,  # [PATCH]
    }

@app.put("/admin/shipments/{number}/details")
def admin_put_shipment_details(number: str, body: ShipmentDetailsIn):
    with get_db() as db:
        ship = db.query(Shipment).filter(Shipment.tracking_number == number).one_or_none()
        if not ship:
            raise HTTPException(status_code=404, detail="shipment not found")
        patch = body.model_dump(exclude_unset=True)
        # 날짜 문자열은 upsert 함수에서 파싱
        row = upsert_shipment_details(db, ship, patch)
        def _iso(dt): return dt.isoformat() if getattr(dt, "isoformat", None) else None
        return {"ok": True, "tracking_number": number, "updated_at": _iso(row.updated_at) if row else None}


# =============== 예측 API ===============
# [ANCHOR: PREDICTION_API]

class DeliveryPredictionRequest(BaseModel):
    tracking_number: str
    departure_date: str # ISO format
    hub: str = "ICN"
    carrier: str = "Unknown"
    origin: str = "Unknown"

class DeliveryPredictionResponse(BaseModel):
    tracking_number: str
    hub: str
    carrier: str
    origin: str
    departure_date: str
    predicted_clearance_median_h: float
    predicted_clearance_p90_h: float
    predicted_delivery_median_h: float
    predicted_delivery_p90_h: float
    total_predicted_median_h: float
    total_predicted_p90_h: float
    predicted_clearance_ts: str
    predicted_eta_ts: str # P50
    predicted_eta_p90_ts: str # P90
    probability_distribution: list # 5일 확률 분포

@app.post("/api/predict-delivery", response_model=DeliveryPredictionResponse)
async def predict_delivery(req: DeliveryPredictionRequest):
    """
    특정 화물의 예상 도착 시간을 계산
    Monitoring.py의 BE3Pipeline을 사용하여 실시간 예측을 수행
    """
    try:
        # Monitoring.py 임포트
        import sys
        sys.path.append('.')
        from Monitoring import BE3Pipeline, TestDataGenerator
        
        # 1) 현재 시간 기준 설정
        current_time = pd.Timestamp.now(tz='Asia/Seoul')
        
        # 2) 학습용 히스토리 데이터 생성 (최근 28일치)
        # current_time에서 28일 전부터 데이터 생성하여 학습 데이터가 필터링되지 않도록 함
        start_date = (current_time - timedelta(days=28)).strftime('%Y-%m-%d')
        historical_data = TestDataGenerator.generate_normal_data(
            n_days=28,
            shipments_per_day=30,
            hub=req.hub,
            carrier=req.carrier,
            origin=req.origin,
            start_date=start_date,
            seed=42
        )
        
        # 3) 파이프라인 초기화 및 학습
        pipeline = BE3Pipeline()
        _ = pipeline.process(historical_data, current_time)
        
        # 4) 새 화물 데이터 준비
        # tz-aware인지 확인 후 처리
        departure_ts = pd.to_datetime(req.departure_date)
        if departure_ts.tzinfo is None:
            departure_ts = departure_ts.tz_localize('Asia/Seoul')
        else:
            departure_ts = departure_ts.tz_convert('Asia/Seoul')
        
        new_shipment = pd.DataFrame([{
            'shipment_id': req.tracking_number,
            'hub': req.hub,
            'carrier': req.carrier,
            'origin': req.origin,
            'destination_city': 'Seoul',
            'arrival_ts': departure_ts
        }])
        
        # 5) 예측 수행
        prediction = pipeline.predict_end_to_end(new_shipment)
        result = prediction.iloc[0]
        
        # 6) 모델 학습 여부 확인
        if 'predicted_eta_ts' not in result or pd.isna(result.get('predicted_eta_ts')):
            raise HTTPException(
                status_code=503, # Service Unavailable
                detail={
                    "error": "model_not_trained",
                    "message": "배송 예측 서비스를 사용할 수 없습니다",
                    "reason": "학습 데이터가 부족합니다. 더 많은 배송 이력 데이터가 필요합니다.",
                    "suggestion": "시스템에 충분한 배송 이력이 쌓인 후 다시 시도해주세요."
                }
            )
        
        # 7) 확률 분포 계산 (누적 분포 함수 기반)
        median_eta = pd.to_datetime(result['predicted_eta_ts'])
        p90_eta = pd.to_datetime(result['predicted_eta_p90_ts'])
        
        # P50과 P90의 차이로 표준편차 추정
        # 정규분포에서 P90 = μ + 1.28σ
        diff_hours = (p90_eta - median_eta).total_seconds() / 3600
        sigma_hours = diff_hours / 1.28 if diff_hours > 0 else 12  # 기본값 12시간
        
        # 정규분포 누적 분포 함수(CDF) 
        def normal_cdf(x, mu=0, sigma=1):
            """오차 함수 근사"""
            z = (x - mu) / (sigma * np.sqrt(2))
            
            # 오차 함수(erf) Abramowitz and Stegun 근사 (오차 < 1.5e-7)
            a1 =  0.254829592
            a2 = -0.284496736
            a3 =  1.421413741
            a4 = -1.453152027
            a5 =  1.061405429
            p  =  0.3275911
            
            sign = 1 if z >= 0 else -1
            z = abs(z)
            
            t = 1.0 / (1.0 + p * z)
            y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * np.exp(-z * z)
            erf = sign * y
            
            return 0.5 * (1.0 + erf)
        
        # 5일치 확률 분포 생성 (각 날짜에 도착할 확률)
        probability_dist = []
        probabilities = []
        
        for offset in range(-2, 3):
            # 해당 날짜의 시작과 끝 시간
            date_start = (median_eta + timedelta(days=offset)).replace(hour=0, minute=0, second=0, microsecond=0)
            date_end = (median_eta + timedelta(days=offset)).replace(hour=23, minute=59, second=59, microsecond=999999)
            
            # 중앙값 기준으로 시간 차이 계산 (시간 단위)
            hours_start = (date_start - median_eta).total_seconds() / 3600
            hours_end = (date_end - median_eta).total_seconds() / 3600
            
            # 해당 날짜 범위에 도착할 확률 = CDF(끝) - CDF(시작)
            prob_start = normal_cdf(hours_start, mu=0, sigma=sigma_hours)
            prob_end = normal_cdf(hours_end, mu=0, sigma=sigma_hours)
            prob = prob_end - prob_start
            
            probability_dist.append({
                'date': (median_eta + timedelta(days=offset)).date().isoformat(),
                'probability': prob
            })
            probabilities.append(prob)
        
        # 정규화 (합이 1이 되도록, 소수점 오차 보정)
        total_prob = sum(probabilities)
        for i, p in enumerate(probability_dist):
            p['probability'] = probabilities[i] / total_prob
        
        return DeliveryPredictionResponse(
            tracking_number=req.tracking_number,
            hub=req.hub,
            carrier=req.carrier,
            origin=req.origin,
            departure_date=req.departure_date,
            predicted_clearance_median_h=float(result['predicted_clearance_median_h']),
            predicted_clearance_p90_h=float(result['predicted_clearance_p90_h']),
            predicted_delivery_median_h=float(result['predicted_delivery_median_h']),
            predicted_delivery_p90_h=float(result['predicted_delivery_p90_h']),
            total_predicted_median_h=float(result['total_predicted_median_h']),
            total_predicted_p90_h=float(result['total_predicted_p90_h']),
            predicted_clearance_ts=result['predicted_clearance_ts'].isoformat(),
            predicted_eta_ts=result['predicted_eta_ts'].isoformat(),
            predicted_eta_p90_ts=result['predicted_eta_p90_ts'].isoformat(),
            probability_distribution=probability_dist
        )
        
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"\n{'='*60}")
        print(f"예측 API 에러 발생:")
        print(f"{'='*60}")
        print(error_detail)
        print(f"{'='*60}\n")
        raise HTTPException(status_code=500, detail=f"예측 중 오류: {str(e)}")

# =========================
# 데모 실행(옵션)
# =========================
async def main():
    tracking_numbers = ["TRACKING_NUMBER_1", "INVALID_NUMBER_2", "TRACKING_NUMBER_3"]
    print("register_trackings:", await register_trackings(tracking_numbers))
    print("push_now:", await push_now(tracking_numbers[:2]))
    print("get_trackinfo:", await get_trackinfo(tracking_numbers[:2]))

if __name__ == "__main__":
    asyncio.run(main())
