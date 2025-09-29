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
from pydantic import BaseModel
from fastapi import Body
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
    carrier = Column(String(80), nullable=True)           # 선택적: carrier code/name
    last_status = Column(String(80), nullable=True)       # CLEARED / IN_PROGRESS / DELAY / UNKNOWN
    last_event = Column(Text, nullable=True)              # 마지막 설명(짧게)
    normalized = Column(Text, nullable=True)              # JSON 문자열로 저장(필요시 SAJSON 사용)
    normalized_count = Column(Integer, default=0)
    any_events = Column(Integer, default=0)               # boolean-like 0/1
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ShipmentEvent(Base):
    __tablename__ = "shipment_events"
    id = Column(Integer, primary_key=True)
    shipment_id = Column(Integer, ForeignKey("shipments.id", ondelete="CASCADE"), index=True, nullable=False)
    tracking_number = Column(String(128), index=True, nullable=False)
    ts = Column(DateTime(timezone=True), index=True, nullable=False)  # 이벤트 시간 (UTC)
    stage = Column(String(32), nullable=False)                       # CLEARED / IN_PROGRESS / DELAY / UNKNOWN
    desc = Column(Text, nullable=True)                                # 원문/번역 설명
    source = Column(String(32), nullable=True)                        # 'webhook' | 'poll' | 'normalized'
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("shipment_id", "ts", "stage", "desc", name="uq_shipment_event_dedup"),
    )



# ======================= NEW: 통관/화물 상세 =======================
class ShipmentDetails(Base):
    __tablename__ = "shipment_details"
    id = Column(Integer, primary_key=True)
    shipment_id = Column(Integer, ForeignKey("shipments.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    tracking_number = Column(String(128), index=True, nullable=False)

    # 표시 필드들
    product_info = Column(Text)               # 물품 정보 (예: "HUMAN DOLLS OF TEXTILE MATERIALS 1 ...")
    quantity = Column(Integer)                # 수량
    weight_kg = Column(String(32))            # "0.1KG"처럼 단위 포함 문자열로 보관
    clearance_status_text = Column(String(120))  # 통관진행상태 (예: "통관목록심사완료")
    progress_status_text = Column(String(120))   # 진행상태 (예: "통관목록심사완료")
    origin_country = Column(String(80))       # 적출국 (예: "중국")
    loading_port = Column(String(120))        # 적재항 (예: "옌타이")
    cargo_type = Column(String(80))           # 화물구분 (예: "수입 일반화물")
    container_no = Column(String(80))         # 컨테이너번호
    customs_office = Column(String(120))      # 세관명 (예: "인천공항세관")
    arrival_port_name = Column(String(120))   # 입항명 (예: "서울/인천")
    arrival_date = Column(DateTime(timezone=True))      # 입항일
    tax_reference_date = Column(DateTime(timezone=True))# (합산과세 기준일)
    processed_at = Column(DateTime(timezone=True))      # 처리일시
    forwarder_name = Column(String(160))      # 화물운송주선업자(포워더) 업체명
    forwarder_phone = Column(String(64))      # 포워더 전화번호

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
# ======================= /NEW =======================

class EventOut(BaseModel):
    ts: str
    stage: str
    desc: str | None = None
    source: str | None = None

# 테이블 생성 (기존 코드와 함께 둡니다)
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
        r"통관\s*(완료|해제|통과)",
        r"清关完成|放行|已放行",
        r"(aduana).*(liberad[oa]|aprobado|completado)",
        r"通関(許可|完了|解放)"
    ],
}
COMPILED = {k: [re.compile(p, re.I) for p in v] for k, v in PATTERNS.items()}

# =============== 유틸 ===============

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
    """
    17TRACK v2 이벤트의 다양한 시간 필드를 UTC로 통일.
    우선순위: time_iso → time_utc → (time_raw.date + time_raw.time + time_raw.timezone)
    """
    s = ev.get("time_iso") or ev.get("time_utc")
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
                if ts_raw and stg:
                    try:
                        events.append({"ts": _to_dt_utc(ts_raw), "stage": stg, "desc": desc})
                    except Exception:
                        pass

    # --- (B) v2 providers[].events 경로 ---
    ti = _ti_view(track)
    providers = (((ti.get("tracking") or {}).get("providers")) or [])
    for prov in providers:
        for e in (prov.get("events") or []):
            ts   = _parse_multi_time(e)
            desc = (e.get("description") or "")
            stg  = _stage_from_text(desc.strip())

            # 1) v2 sub_status 보조 매핑
            if not stg:
                sub = (e.get("sub_status") or "")
                if sub in {"InTransit_CustomsProcessing", "InTransit_Arrival"}:
                    stg = "IN_PROGRESS"
                elif sub in {"InTransit_CustomsReleased", "Delivered", "Delivered_Other"}:
                    stg = "CLEARED"
                elif sub.startswith("Exception"):
                    stg = "DELAY"

            # 2) v2 stage 직접 매핑 (예: Delivered)
            if not stg:
                stage_in_payload = (e.get("stage") or "").lower()
                if stage_in_payload in {"delivered"}:
                    stg = "CLEARED"

            # ✅ 누락됐던 append 추가
            if ts and stg:
                events.append({"ts": ts, "stage": stg, "desc": desc})


    # --- (C) v2 latest_event 보조 (혹시 providers가 비어도 커버) ---
    le = ti.get("latest_event") or None
    if le:
        ts   = _parse_multi_time(le)
        desc = (le.get("description") or "")
        stg  = _stage_from_text(desc.strip())

        if not stg:
            sub = (le.get("sub_status") or "")
            if sub in {"InTransit_CustomsProcessing", "InTransit_Arrival"}:
                stg = "IN_PROGRESS"
            elif sub in {"InTransit_CustomsReleased", "Delivered", "Delivered_Other"}:
                stg = "CLEARED"
            elif sub.startswith("Exception"):
                stg = "DELAY"

        if not stg:
            stage_in_payload = (le.get("stage") or "").lower()
            if stage_in_payload in {"delivered"}:
                stg = "CLEARED"

        if ts and stg:
            events.append({"ts": ts, "stage": stg, "desc": desc})

    # 정렬 + 중복 제거
    events.sort(key=_sort_key)
    seen, out = set(), []
    for ev in events:
        key = (ev["ts"].isoformat(), ev["stage"], (ev["desc"] or "")[:160])
        if key in seen:
            continue
        seen.add(key)
        out.append(ev)

    # CLEARED가 진행보다 앞서는 역행 케이스 방어
    first_in = next((e for e in out if e["stage"] == "IN_PROGRESS"), None)
    first_clear = next((e for e in out if e["stage"] == "CLEARED"), None)
    if first_clear and first_in and first_clear["ts"] < first_in["ts"]:
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
    arrival_date: Optional[str] = None          # ISO 또는 "YYYY-MM-DD"
    tax_reference_date: Optional[str] = None    # ISO 또는 "YYYY-MM-DD"
    processed_at: Optional[str] = None          # ISO
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
    for k in ["arrival_date", "tax_reference_date", "processed_at"]:
        v = patch.get(k, None)
        if v:
            dtv = _dt_or_none(v) if isinstance(v, str) else v
            if dtv:
                setattr(row, k, dtv)

    db.flush()
    return row

def _extract_details_best_effort_from_track(track: Dict[str, Any]) -> Dict[str, Any]:
    """
    17TRACK payload에서 얻을 수 있는 것만 '최대한' 추출 (없으면 빈 값 유지).
    - 적출국(origin_country): 국가명/코드 힌트
    - 적재항(loading_port): 이벤트 설명에 항구명(예: Yantai/옌타이/烟台) 히ュー리스틱
    - 처리일시(processed_at): 최신 이벤트 시간
    """
    out: Dict[str, Any] = {}

    ti = _ti_view(track or {})

    # 최신 이벤트 시각 → 처리일시
    latest_ts = None
    providers = (((ti.get("tracking") or {}).get("providers")) or [])
    evts = []
    for p in providers:
        evts.extend(p.get("events") or [])
    if ti.get("latest_event"):
        evts.append(ti["latest_event"])
    for e in evts:
        t = _parse_multi_time(e)
        if t and (latest_ts is None or t > latest_ts):
            latest_ts = t
        # 적재항 힌트
        d = (e.get("description") or "")
        if not out.get("loading_port"):
            if re.search(r"\b(YANTAI|Yantai|烟台|옌타이)\b", d, flags=re.I):
                out["loading_port"] = "옌타이"

    if latest_ts:
        out["processed_at"] = latest_ts.isoformat()

    # 적출국 힌트 (origin/shipper country 추정)
    # 스키마가 제각각이라 매우 보수적으로만 시도
    cand = (
        (ti.get("latest_status") or {}).get("origin_country") or
        (ti.get("destination") or {}).get("origin_country") or
        (ti.get("origin") or {}).get("country") or
        (ti.get("tracking") or {}).get("origin_country")
    )
    if isinstance(cand, str) and not out.get("origin_country"):
        # 간단히 중국/중국어 케이스 매핑
        if re.search(r"china|cn|中国|中國|중국", cand, re.I):
            out["origin_country"] = "중국"

    return out

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

    return {
        "ok": True,
        "event": event,
        "tracking_number": number,
        "summary": summary,
        "normalized_count": len(normalized),
        "any_events": any_events,
    }


@app.get("/debug/normalize")
async def debug_normalize(number: str):
    """폴링으로 실데이터 가져와 같은 정규화/요약을 실행(웹훅 미구축 시 점검용)."""
    payload = await get_trackinfo([number])
    # API 응답 스키마 방어적으로 접근
    # ✅ 다양한 스키마 방어: list | {data|result|list} | 단일 아이템
    tracks: List[Dict[str, Any]] = []
    if isinstance(payload, list):
        tracks = payload
    elif isinstance(payload, dict):
        data_obj = payload.get("data")
        if isinstance(data_obj, dict):
            # v1 공통 래퍼: {"code":0,"data":{"accepted":[...], "rejected":[...]}}
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
        else:
            tracks = []

    track_item: Optional[Dict[str, Any]] = None
    for item in tracks:
        if not isinstance(item, dict):
            continue
        if str(item.get("number") or item.get("no") or "") == str(number):
            track_item = item
            break
    # v1은 item["track"], v2는 item["track_info"]
    track = None
    if track_item:
        track = track_item.get("track") or track_item.get("track_info") or track_item

    normalized = normalize_from_track(track or {})
    summary    = summarize_customs(normalized)

    # ✅ 프런트가 쓰는 보조 신호(any_events) + PRE_CUSTOMS 보정
    any_events = _count_raw_events(track or {}) > 0
    if summary.get("status") == "UNKNOWN" and any_events:
        summary["status"] = "PRE_CUSTOMS"

    return {
        "ok": True,
        "tracking_number": number,
        "summary": summary,
        "normalized": normalized,
        "any_events": any_events,
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
        return json.dumps([{"ts": e["ts"].isoformat(), "stage": e["stage"], "desc": e.get("desc", "")} for e in ev_list], ensure_ascii=False)
    except Exception:
        # fallback
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
            "desc": desc,        # 컬럼명은 desc (SQLAlchemy가 적절히 quoting)
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
        # 최신 이벤트를 처리일시로
        if normalized_events:
            latest = normalized_events[-1]
            if latest.get("ts"):
                auto_patch["processed_at"] = latest["ts"] if isinstance(latest["ts"], str) else latest["ts"].isoformat()

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
            processed_at=_iso(row.processed_at),
            forwarder_name=row.forwarder_name,
            forwarder_phone=row.forwarder_phone,
            updated_at=_iso(row.updated_at),
        ).model_dump()

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
