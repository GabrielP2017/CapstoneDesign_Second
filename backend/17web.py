# python 3.10+
# pip install fastapi uvicorn pydantic[dotenv] python-dateutil httpx sqlalchemy

from __future__ import annotations

import os, json, asyncio
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dateutil import parser as dtp

# --- DB ---
from sqlalchemy import (
    create_engine, Column, Integer, String, DateTime, ForeignKey, Text, func, Index
)
from sqlalchemy.orm import sessionmaker, declarative_base, relationship, Session
from sqlalchemy.exc import IntegrityError

# =========================
# 환경설정
# =========================
load_dotenv()
# 상단 환경변수
DEFAULT_CARRIER_CODE = int(os.getenv("DEFAULT_CARRIER_CODE", "3011"))  # China Post 기본 예시

# 샘플 번호도 UPU 스타일로 바꿔주세요(가짜 DEMO → UPU CN)
SAMPLE_10 = [
    "RR123456785CN","RR123456796CN","RR123456807CN","RR123456818CN","RR123456829CN",
    "RR123456830CN","RR123456841CN","RR123456852CN","RR123456863CN","RR123456874CN",
]
API_KEY = os.getenv("SEVENTEENTRACK_API_KEY", "")
API_BASE_V24 = "https://api.17track.net/track/v2.4"

if not API_KEY:
    print("⚠️  SEVENTEENTRACK_API_KEY 가 비어 있습니다. .env에 설정하세요.")

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./app.db")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, echo=False, future=True, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
Base = declarative_base()

FRONTEND_ORIGINS = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

SAMPLE_10 = [f"TTK-DEMO-{i:04d}" for i in range(1, 11)]

app = FastAPI(title="17TRACK – V2.4 minimal demo")
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# DB 모델
# =========================
class Tracking(Base):
    __tablename__ = "trackings"
    id = Column(Integer, primary_key=True)
    number = Column(String(64), unique=True, index=True, nullable=False)
    carrier = Column(String(32), default="")                # 숫자코드 문자열로 저장해도 ok
    status = Column(String(32), default="NEW")              # NEW/TRACKING/CLEARED/EXCEPTION/UNKNOWN
    last_event_at = Column(DateTime, nullable=True)
    last_event_text = Column(Text, nullable=True)
    source = Column(String(16), default="manual")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    events = relationship("TrackingEvent", back_populates="tracking", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_trackings_status", "status"),
    )

class TrackingEvent(Base):
    __tablename__ = "tracking_events"
    id = Column(Integer, primary_key=True)
    tracking_id = Column(Integer, ForeignKey("trackings.id"), index=True, nullable=False)
    event_time = Column(DateTime, nullable=True)
    description = Column(Text, nullable=True)
    raw = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    tracking = relationship("Tracking", back_populates="events")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# =========================
# 앱 수명주기 & HTTP 클라이언트
# =========================
HTTP_CLIENT: Optional[httpx.AsyncClient] = None

@app.on_event("startup")
async def _startup():
    global HTTP_CLIENT
    Base.metadata.create_all(bind=engine)
    HTTP_CLIENT = httpx.AsyncClient(timeout=25.0, http2=True)

@app.on_event("shutdown")
async def _shutdown():
    global HTTP_CLIENT
    if HTTP_CLIENT:
        await HTTP_CLIENT.aclose()
        HTTP_CLIENT = None

# =========================
# 유틸
# =========================
def _parse_dt(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        dt = dtp.parse(s)
        if dt.tzinfo:
            return dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except Exception:
        return None

def _map_status_v24(v24_status: Optional[str]) -> str:
    """
    V2.4 latest_status.status → 우리 DB의 간단 상태로 맵핑
    """
    if not v24_status:
        return "UNKNOWN"
    s = v24_status.lower()
    if s in ("delivered",):
        return "CLEARED"
    if s in ("exception", "deliveryfailure", "expired"):
        return "EXCEPTION"
    if s in ("intransit", "inforeceived", "availableforpickup", "outfordelivery"):
        return "TRACKING"
    if s in ("notfound",):
        return "UNKNOWN"
    return "UNKNOWN"

async def v24_post(path: str, body: Any) -> Dict[str, Any]:
    """
    V2.4는 모든 엔드포인트가 '배열' 또는 '객체' JSON 바디를 받는다.
    성공이어도 code:0 + data.rejected / data.errors 가 있을 수 있으니 예외로 치지 않는다.
    """
    if not API_KEY:
        raise HTTPException(status_code=400, detail="SEVENTEENTRACK_API_KEY not set")
    url = f"{API_BASE_V24.rstrip('/')}/{path.lstrip('/')}"
    headers = {
        "17token": API_KEY,
        "Content-Type": "application/json",
    }
    client = HTTP_CLIENT or httpx.AsyncClient(timeout=25.0, http2=True)
    r = await client.post(url, headers=headers, json=body)
    # 200 외엔 예외
    if r.status_code >= 400:
        try:
            data = r.json()
        except Exception:
            data = {"raw": r.text}
        raise HTTPException(status_code=r.status_code, detail=data)
    try:
        return r.json()
    except Exception:
        return {"raw": r.text}

def _extract_v24_items(payload: Any) -> List[dict]:
    """
    V2.4 표준 응답에서 data.accepted 배열만 뽑아낸다.
    """
    if not isinstance(payload, dict):
        return []
    data = payload.get("data") or {}
    items = data.get("accepted") or []
    if isinstance(items, list):
        return items
    return []

def upsert_from_v24_item(db: Session, item: Dict[str, Any]) -> None:
    """
    V2.4 gettrackinfo의 accepted[] 항목 1개를 DB에 반영
    """
    number = item.get("number")
    if not number:
        return
    carrier_code = item.get("carrier")
    track_info = item.get("track_info") or {}

    latest_status = (track_info.get("latest_status") or {}).get("status")
    latest_event = track_info.get("latest_event") or {}

    # 이벤트 텍스트: 번역문 우선 → 원문
    desc_trans = (latest_event.get("description_translation") or {}).get("description")
    desc_raw = latest_event.get("description")
    last_text = desc_trans or desc_raw

    # 이벤트 시각: time_utc 우선 → time_iso
    last_at = latest_event.get("time_utc") or latest_event.get("time_iso")
    last_dt = _parse_dt(last_at)

    tracking = db.query(Tracking).filter(Tracking.number == number).one_or_none()
    if not tracking:
        tracking = Tracking(number=number, source="api")
        db.add(tracking)
        db.flush()

    tracking.carrier = str(carrier_code or tracking.carrier or "")
    tracking.last_event_text = last_text
    tracking.last_event_at = last_dt
    tracking.status = _map_status_v24(latest_status)
    db.commit()
    db.refresh(tracking)

# =========================
# 스키마 (응답용)
# =========================
class RegisterResp(BaseModel):
    ok: bool
    registered_numbers: List[str]
    reg_raw: Any
    via: str = "v2.4"

class FetchResp(BaseModel):
    ok: bool
    queried: int
    updated: int
    numbers: List[str]

# =========================
# 라우트
# =========================
@app.get("/health")
async def health():
    return {"ok": True}

# /admin/register-17track-10 엔드포인트 내 파라미터 기본값 처리
@app.post("/admin/register-17track-10", response_model=RegisterResp)
async def admin_register_17track_10(
    carrier_code: Optional[int] = Query(None, description="정수 Carrier 코드(예: China Post=3011)"),
    lang: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
):
    carrier = carrier_code if carrier_code is not None else DEFAULT_CARRIER_CODE
    """
    ① 샘플 10개를 V2.4 register로 등록.
    - 페이로드는 반드시 '배열'이어야 함.
    - carrier는 문자열이 아닌 '정수 코드'.
    """
    payload = []
    for n in SAMPLE_10:
        one = {"number": n}
        if carrier:
            one["carrier"] = carrier
        if lang: one["lang"] = lang
        if tag:  one["tag"]  = tag
        payload.append(one)

    reg = await v24_post("register", payload)

    # DB에는 최소 NEW로 보장(목록 노출용)
    db: Session = SessionLocal()
    inserted, skipped = 0, 0
    try:
        for n in SAMPLE_10:
            if db.query(Tracking).filter(Tracking.number == n).one_or_none():
                skipped += 1
                continue
            db.add(Tracking(number=n, source="manual", status="NEW"))
            inserted += 1
        db.commit()
    finally:
        db.close()

    return RegisterResp(ok=True, registered_numbers=SAMPLE_10, reg_raw=reg)

@app.post("/admin/fetch-17track-10", response_model=FetchResp)
async def admin_fetch_17track_10(db: Session = Depends(get_db)):
    """
    ② DB에서 최근순 10개(없으면 샘플 10개)를 가져와 V2.4 gettrackinfo 조회 → DB 반영
    - 응답의 data.accepted[] 만 반영
    - rejected는 상태 UNKNOWN으로 두거나 기존값 유지
    """
    rows = (
        db.query(Tracking)
          .order_by(Tracking.updated_at.desc().nullslast())
          .limit(10)
          .all()
    )
    numbers = [r.number for r in rows] or SAMPLE_10

    # V2.4: 배열로 보냄. carrier는 모르면 생략(자동탐색)
    body = [{"number": n} for n in numbers]
    res = await v24_post("gettrackinfo", body)

    items = _extract_v24_items(res)
    updated = 0
    for it in items:
        upsert_from_v24_item(db, it)
        updated += 1

    return FetchResp(ok=True, queried=len(numbers), updated=updated, numbers=numbers)

@app.get("/admin/trackings")
def admin_list_all_trackings(db: Session = Depends(get_db)):
    """
    ③ 우리 DB 전체 레코드 반환
    """
    rows = db.query(Tracking).order_by(Tracking.updated_at.desc().nullslast()).all()
    return [
        {
            "number": r.number,
            "status": r.status,
            "last_event_at": r.last_event_at.isoformat() if r.last_event_at else None,
            "last_event_text": r.last_event_text,
            "source": r.source,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]

# (옵션) 개발 편의: 샘플을 NEW로 심어두고 싶을 때
@app.post("/admin/seed-sample-10")
def seed_sample_10(db: Session = Depends(get_db)):
    inserted, skipped = 0, 0
    for n in SAMPLE_10:
        try:
            db.add(Tracking(number=n, source="manual", status="NEW"))
            db.commit()
            inserted += 1
        except IntegrityError:
            db.rollback()
            skipped += 1
    return {"ok": True, "inserted": inserted, "skipped": skipped, "count": inserted+skipped}

@app.get("/user/trackings")
def user_list_trackings(db: Session = Depends(get_db)):
    """
    일반 사용자: 최근 목록(최대 100)
    """
    rows = (
        db.query(Tracking)
          .order_by(Tracking.updated_at.desc().nullslast())
          .limit(100)
          .all()
    )
    return [
        {
            "number": r.number,
            "status": r.status,
            "last_event_at": r.last_event_at.isoformat() if r.last_event_at else None,
            "last_event_text": r.last_event_text,
        }
        for r in rows
    ]