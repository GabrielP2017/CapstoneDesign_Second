from __future__ import annotations

import asyncio
import hashlib
import json
import re
from datetime import datetime, date, timezone, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Literal
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from html import escape
import xml.etree.ElementTree as ET


DATA_DIR = Path(__file__).with_name("be4_data")
DATA_DIR.mkdir(exist_ok=True)
RULES_PATH = DATA_DIR / "rule_library.json"
NOTICE_CACHE_PATH = DATA_DIR / "notice_cache.json"


def _load_json(path: Path, default):
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(default, ensure_ascii=False, indent=2), encoding="utf-8")
        return json.loads(path.read_text(encoding="utf-8"))
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        path.write_text(json.dumps(default, ensure_ascii=False, indent=2), encoding="utf-8")
        return default


def _render_fallback_html(detail: Dict[str, object]) -> str:
    title = escape(str(detail.get("title", "통관 공지")))
    summary = escape(str(detail.get("summary", "")))
    points = detail.get("detail_points") or []
    links = detail.get("reference_links") or []
    if not links:
        fallback_link = detail.get("official_url") or detail.get("url")
        if fallback_link:
            links = [{"label": "공식 원문", "url": fallback_link}]
    bullet_html = "".join(f"<li>{escape(str(point))}</li>" for point in points)
    link_html = "".join(
        f'<li><a href="{escape(link.get("url", "#"))}" target="_blank" rel="noreferrer">{escape(str(link.get("label", link.get("url", ""))))}</a></li>'
        for link in links
    )
    return f"""
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="utf-8" />
        <title>{title}</title>
        <style>
            body {{
                font-family: 'Segoe UI', 'Noto Sans KR', sans-serif;
                margin: 0;
                padding: 24px;
                background: #f8fafc;
                color: #0f172a;
            }}
            .card {{
                max-width: 720px;
                margin: 0 auto;
                background: #fff;
                border-radius: 20px;
                padding: 32px;
                box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
            }}
            h1 {{
                font-size: 1.8rem;
                margin-bottom: 12px;
            }}
            ul {{
                padding-left: 20px;
            }}
            a {{
                color: #2563eb;
                text-decoration: none;
            }}
            a:hover {{
                text-decoration: underline;
            }}
            footer {{
                margin-top: 32px;
                font-size: 0.85rem;
                color: #475569;
            }}
        </style>
    </head>
    <body>
        <div class="card">
            <h1>{title}</h1>
            <p>{summary}</p>
            {"<h2>핵심 내용</h2><ul>" + bullet_html + "</ul>" if bullet_html else ""}
            {"<h2>관련 링크</h2><ul>" + link_html + "</ul>" if link_html else ""}
            <footer>이 카드는 관세청/기재부 공개자료를 요약해 제공한 참고용 정보입니다.</footer>
        </div>
    </body>
    </html>
    """


class RuleHit(BaseModel):
    id: str
    title: str
    summary: Optional[str] = None
    risk_label: str
    risk_level: Literal["LOW", "MEDIUM", "HIGH"]
    reference_urls: List[str] = []
    implication: Optional[str] = None


class RuleEvaluationRequest(BaseModel):
    declared_value: float = Field(..., gt=0, description="Declared amount (numeric)")
    currency: str = Field("USD", description="ISO currency code (USD, KRW, EUR, ...)")
    origin_country: str = Field(..., min_length=2, description="Origin country/territory code")
    shipping_method: Literal["express", "postal"]
    recipient_type: Literal["personal", "business"] = "personal"
    product_category: str = Field("general_goods", description="Category identifier")
    same_day_combined: bool = False
    purchase_date: Optional[date] = None
    arrival_date: Optional[date] = None


class TaxBreakdown(BaseModel):
    dutiable_value_krw: int
    duty: int
    vat: int
    special_tax: int
    estimated_total_tax: int


class RuleEvaluationResponse(BaseModel):
    currency: str
    declared_value: float
    converted_value_krw: int
    converted_value_usd: float
    duty_free_limit_usd: float
    risk_label: str
    risk_level: Literal["LOW", "MEDIUM", "HIGH"]
    expected_tax_krw: int
    expected_tax_breakdown: TaxBreakdown
    applied_rules: List[RuleHit]
    basis_links: List[str]
    advisory: str


RISK_ORDER = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}


class RuleEngine:
    def __init__(self, config_path: Path):
        if not config_path.exists():
            raise FileNotFoundError(f"Rule config not found: {config_path}")
        self.config_path = config_path
        self.reload()

    def reload(self):
        self.data = json.loads(self.config_path.read_text(encoding="utf-8"))
        self.currency_rates: Dict[str, float] = {
            (k or "").upper(): v for k, v in self.data.get("currency_rates", {}).items() if v
        }
        self.rule_entries = self.data.get("rule_entries", [])
        self.category_profiles = {
            c["id"]: c for c in self.data.get("category_profiles", [])
        }
        self.default_currency_rate = self.currency_rates.get("USD", 1350.0)
        if "general_goods" not in self.category_profiles:
            self.category_profiles["general_goods"] = {
                "id": "general_goods",
                "title": "일반 잡화",
                "duty_rate": 0.08,
                "vat_rate": 0.1,
                "special_tax_rate": 0,
                "base_risk": "LOW",
                "reference_urls": [],
            }

    def to_metadata(self) -> Dict[str, object]:
        return {
            "currency_rates": self.currency_rates,
            "rule_entries": self.rule_entries,
            "category_profiles": list(self.category_profiles.values()),
        }

    def evaluate(self, payload: RuleEvaluationRequest) -> RuleEvaluationResponse:
        currency = payload.currency.upper()
        currency_rate = self.currency_rates.get(currency, self.default_currency_rate)
        usd_rate = self.currency_rates.get("USD", 1350.0)

        value_krw = int(round(payload.declared_value * currency_rate))
        value_usd = round(value_krw / usd_rate, 2) if usd_rate else float(payload.declared_value)
        duty_free_limit = 200.0 if (
            payload.origin_country.strip().upper() in {"US", "USA", "UNITED STATES"}
            and payload.shipping_method == "express"
        ) else 150.0

        applied_rules: List[RuleHit] = []
        basis_links: List[str] = []
        risk_label = "정상 면세"
        risk_level = "LOW"

        def push_rule(rule, override_label=True):
            nonlocal risk_label, risk_level
            entry = RuleHit(
                id=rule["id"],
                title=rule.get("title", ""),
                summary=rule.get("summary"),
                risk_label=rule.get("risk_label", risk_label),
                risk_level=rule.get("risk_level", "LOW"),
                reference_urls=rule.get("reference_urls") or [],
                implication=rule.get("implication"),
            )
            applied_rules.append(entry)
            for link in entry.reference_urls:
                if link and link not in basis_links:
                    basis_links.append(link)
            if RISK_ORDER.get(entry.risk_level, 0) >= RISK_ORDER.get(risk_level, 0):
                if override_label:
                    risk_label = entry.risk_label
                risk_level = entry.risk_level

        for rule in sorted(self.rule_entries, key=lambda r: r.get("priority", 0)):
            if self._matches(rule.get("conditions", {}), payload, value_usd):
                push_rule(rule)

        category_profile = self.category_profiles.get(payload.product_category, self.category_profiles["general_goods"])
        for link in category_profile.get("reference_urls", []):
            if link and link not in basis_links:
                basis_links.append(link)

        taxable = value_usd > duty_free_limit or RISK_ORDER.get(risk_level, 0) >= RISK_ORDER["MEDIUM"]
        duty_rate = float(category_profile.get("duty_rate", 0.08))
        vat_rate = float(category_profile.get("vat_rate", 0.1))
        special_tax_rate = float(category_profile.get("special_tax_rate", 0.0))

        dutiable_value = value_krw if taxable else 0
        duty = int(round(dutiable_value * duty_rate)) if taxable else 0
        special_tax = int(round(dutiable_value * special_tax_rate)) if taxable else 0
        vat_base = dutiable_value + duty + special_tax
        vat = int(round(vat_base * vat_rate)) if taxable else 0
        total_tax = duty + special_tax + vat

        if not applied_rules:
            applied_rules.append(
                RuleHit(
                    id="DEFAULT_LOW_RISK",
                    title="기본 면세",
                    summary="면세 한도 내 자가사용 물품",
                    risk_label=risk_label,
                    risk_level=risk_level,
                    reference_urls=[],
                )
            )

        if taxable and total_tax == 0:
            taxable = False

        if not taxable:
            risk_level = "LOW" if risk_level == "LOW" else risk_level
            risk_label = "정상 면세" if risk_level == "LOW" else risk_label

        advisory_parts = [
            f"{category_profile.get('title', '일반')} 분류",
            f"운송수단: {'특송' if payload.shipping_method == 'express' else '우편'}",
            f"수취인 유형: {'개인' if payload.recipient_type == 'personal' else '사업자'}",
        ]
        if payload.same_day_combined:
            advisory_parts.append("동일 입항건 합산 주의")
        if category_profile.get("notes"):
            advisory_parts.append(category_profile["notes"])

        return RuleEvaluationResponse(
            currency=currency,
            declared_value=payload.declared_value,
            converted_value_krw=value_krw,
            converted_value_usd=value_usd,
            duty_free_limit_usd=duty_free_limit,
            risk_label=risk_label,
            risk_level=risk_level,
            expected_tax_krw=total_tax,
            expected_tax_breakdown=TaxBreakdown(
                dutiable_value_krw=dutiable_value,
                duty=duty,
                vat=vat,
                special_tax=special_tax,
                estimated_total_tax=total_tax,
            ),
            applied_rules=applied_rules,
            basis_links=basis_links,
            advisory=" · ".join(advisory_parts),
        )

    def _matches(self, conditions: Dict[str, object], payload: RuleEvaluationRequest, value_usd: float) -> bool:
        if not conditions:
            return False
        min_value = conditions.get("min_value_usd")
        max_value = conditions.get("max_value_usd")
        if min_value is not None and value_usd < float(min_value):
            return False
        if max_value is not None and value_usd > float(max_value):
            return False
        origin_countries = conditions.get("origin_countries")
        if origin_countries:
            origin = payload.origin_country.strip().upper()
            normalized = [c.strip().upper() for c in origin_countries]
            if origin not in normalized:
                return False
        shipping_methods = conditions.get("shipping_methods")
        if shipping_methods and payload.shipping_method not in shipping_methods:
            return False
        recipient_types = conditions.get("recipient_types")
        if recipient_types and payload.recipient_type not in recipient_types:
            return False
        restricted_categories = conditions.get("restricted_categories")
        if restricted_categories and payload.product_category not in restricted_categories:
            return False
        if conditions.get("same_day_combined") and not payload.same_day_combined:
            return False
        return True


# KCS URLs updated to HTTPS
NOTICE_SOURCES = [
    {
        "id": "kcs_public_notice",
        "name": "관세청 공고",
        "url": "https://www.customs.go.kr/kcs/selectBoardRss.do?mi=2895&bbsId=1364",
        "bbsId": "1364",
    },
    {
        "id": "kcs_admin_rule",
        "name": "행정규칙 행정예고",
        "url": "https://www.customs.go.kr/kcs/selectBoardRss.do?mi=2897&bbsId=1366",
        "bbsId": "1366",
    },
    {
        "id": "kcs_customs_news",
        "name": "세관소식",
        "url": "https://www.customs.go.kr/kcs/selectBoardRss.do?mi=6949&bbsId=1361",
        "bbsId": "1361",
    },
    {
        "id": "kcs_press",
        "name": "관세청 보도자료",
        "url": "https://www.customs.go.kr/kcs/selectBoardRss.do?mi=2891&bbsId=1362",
        "bbsId": "1362",
    },
    {
        "id": "korea_kr_customs",
        "name": "정책브리핑(관세청)",
        "url": "https://www.korea.kr/rss/dept_customs.xml",
    },
    {
        "id": "moleg_law",
        "name": "법제처 최신법령",
        "url": "https://www.law.go.kr/DRF/lawSearch.do?target=law&OC=public&type=XML",
    },
    {
        "id": "easylaw_notice",
        "name": "생활법령 공지",
        "url": "https://www.easylaw.go.kr/CSP/RssNtcRetrieve.laf?topMenu=serviceUl7",
    },
]

NOTICE_KEYWORDS = [
    ("합산", "합산과세"),
    ("면세", "소액면세"),
    ("파업", "지연/파업"),
    ("시스템", "시스템 점검"),
    ("법령", "법령 개정"),
    ("통관", "통관"),
    ("관세", "관세"),
]

NOTICE_RISK_ORDER = {"INFO": 0, "WATCH": 1, "ALERT": 2}


def _ensure_bbs_id(link: str, source: Dict[str, str]) -> str:
    if not link:
        return link

    if link.startswith("/"):
        base = source.get("url", "")
        parsed = urlparse(base)
        if parsed.scheme and parsed.netloc:
            link = f"{parsed.scheme}://{parsed.netloc}{link}"
    elif not urlparse(link).scheme:
        base = source.get("url", "")
        parsed = urlparse(base)
        if parsed.scheme and parsed.netloc:
            link = f"{parsed.scheme}://{parsed.netloc}/{link.lstrip('/')}"

    bbs_id = source.get("bbsId")
    needs_bbs = (
        bbs_id
        and "customs.go.kr" in link
        and "bbsId=" not in link
        and any(keyword in link for keyword in ("selectBoardArticle", "selectBoardNttInfo", "selectNttInfo"))
    )
    if needs_bbs:
        separator = "&" if "?" in link else "?"
        link = f"{link}{separator}bbsId={bbs_id}"
    return link

FALLBACK_NOTICE_SEED = [
    {
        "source": "kcs_public_notice",
        "source_name": "관세청 공고",
        "title": "소액면세 기준 안내",
        "summary": "목록통관 면세 기준과 자가사용 요건을 재안내합니다.",
        "category": "관세청 공고",
        "risk_level": "WATCH",
        "tags": ["소액면세"],
        "official_url": "https://www.customs.go.kr/kcs/selectBoardList.do?mi=2895&bbsId=1364",
    },
    {
        "source": "kcs_admin_rule",
        "source_name": "행정규칙 행정예고",
        "title": "합산과세 운영기준 행정예고",
        "summary": "동일 입항일 합산과세 기준 정비안 행정예고",
        "category": "행정예고",
        "risk_level": "ALERT",
        "tags": ["합산과세"],
        "official_url": "https://www.customs.go.kr/kcs/selectBoardList.do?mi=2897&bbsId=1366",
    },
    {
        "source": "kcs_press",
        "source_name": "관세청 보도자료",
        "title": "전자상거래 통관 제도 개편",
        "summary": "해외직구 통관 절차 개선 주요 내용 보도자료",
        "category": "보도자료",
        "risk_level": "WATCH",
        "tags": ["전자상거래"],
        "official_url": "https://www.customs.go.kr/kcs/selectBoardList.do?mi=2891&bbsId=1362",
    },
    {
        "source": "moleg_law",
        "source_name": "법제처 최신법령",
        "title": "관세법 시행규칙 일부개정",
        "summary": "관세법 시행규칙 개정 공포 내역",
        "category": "법령 개정",
        "risk_level": "WATCH",
        "tags": ["법제처"],
        "official_url": "https://www.law.go.kr",
    },
]

class RegulationNotice(BaseModel):
    id: str
    source: str
    source_name: str
    title: str
    summary: Optional[str] = None
    published_at: datetime
    url: str
    official_url: Optional[str] = None
    category: str
    risk_level: Literal["INFO", "WATCH", "ALERT"] = "INFO"
    tags: List[str] = []
    is_fallback: bool = False


class RegulationNoticeService:
    def __init__(self, cache_path: Path, fetch_interval_seconds: int = 900):
        self.cache_path = cache_path
        self.fetch_interval = fetch_interval_seconds
        self._lock = asyncio.Lock()
        self._notices: Dict[str, RegulationNotice] = {}
        self._task: Optional[asyncio.Task] = None
        self._fallback_details: Dict[str, Dict[str, object]] = {}
        self._load_cache()

    def _load_cache(self):
        cache = _load_json(self.cache_path, [])
        for entry in cache:
            try:
                # 캐시에서 로드할 때는 이미 ISO 형식이므로 직접 파싱 시도
                published_at_value = entry.get("published_at")
                if isinstance(published_at_value, str):
                    # ISO 형식 문자열을 직접 파싱 (다양한 변형 지원)
                    dt = None
                    try:
                        # 표준 ISO 형식: 2025-10-27T22:10:00+00:00 또는 2025-10-27T22:10:00Z
                        normalized = published_at_value.replace("Z", "+00:00")
                        dt = datetime.fromisoformat(normalized)
                    except Exception:
                        try:
                            # dateutil.parser 사용 (더 유연한 파싱)
                            from dateutil import parser as dtp
                            dt = dtp.parse(published_at_value)
                        except Exception:
                            # 마지막으로 기존 파싱 함수 사용
                            dt = self._parse_flexible_date(published_at_value, use_default=True)
                    
                    if dt:
                        entry["published_at"] = dt
                    else:
                        # 파싱 실패 시에도 항목은 유지하되, 현재 시간 사용 (로그는 나중에 추가 가능)
                        entry["published_at"] = datetime.now(timezone.utc)
                elif isinstance(published_at_value, datetime):
                    entry["published_at"] = published_at_value
                else:
                    # 날짜가 없으면 현재 시간 사용 (항목은 유지)
                    entry["published_at"] = datetime.now(timezone.utc)
                
                source_meta = next((s for s in NOTICE_SOURCES if s.get("id") == entry.get("source")), None)
                if source_meta:
                    entry_url = _ensure_bbs_id(entry.get("url", ""), source_meta)
                    entry["url"] = entry_url
                    official = entry.get("official_url") or entry_url
                    entry["official_url"] = _ensure_bbs_id(official, source_meta) if official else official
                notice = RegulationNotice(**entry)
                self._notices[notice.id] = notice
                if notice.is_fallback:
                    self._fallback_details[notice.id] = {
                        "title": notice.title,
                        "summary": notice.summary,
                        "official_url": notice.official_url,
                    }
            except Exception as e:
                # 예외 발생 시에도 항목을 건너뛰지 않고 로그만 남기기 (선택사항)
                # print(f"Warning: Failed to load notice entry: {e}")
                continue
        now = datetime.now(timezone.utc)
        if self._has_real_notices():
            self._remove_fallback_entries()
        else:
            self._seed_fallback(now)

    def _save_cache(self):
        serialized = [
            {
                **notice.model_dump(),
                "published_at": notice.published_at.isoformat(),
            }
            for notice in sorted(self._notices.values(), key=lambda n: n.published_at)
        ]
        self.cache_path.write_text(json.dumps(serialized, ensure_ascii=False, indent=2), encoding="utf-8")

    async def start(self):
        if self._task:
            return
        self._task = asyncio.create_task(self._run())

    async def shutdown(self):
        if not self._task:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    async def _run(self):
        while True:
            try:
                await self.refresh()
            except Exception:
                pass
            await asyncio.sleep(self.fetch_interval)

    async def refresh(self) -> Dict[str, int]:
        stats = {"fetched": 0, "updated_sources": 0}
        async with self._lock:
            async with httpx.AsyncClient(
                timeout=15.0,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/120.0.0.0 Safari/537.36"
                    ),
                },
            ) as client:
                for source in NOTICE_SOURCES:
                    try:
                        resp = await client.get(source["url"])
                        resp.raise_for_status()
                        stats["updated_sources"] += 1
                        stats["fetched"] += self._merge_source(source, resp.text)
                    except Exception:
                        continue

            if self._has_real_notices():
                self._remove_fallback_entries()
            else:
                self._seed_fallback(datetime.now(timezone.utc))
            self._save_cache()

        return stats

    def _merge_source(self, source: Dict[str, str], xml_text: str) -> int:
        count = 0
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError:
            return 0
        
        # Handle potential channel nesting
        channel = root.find("channel")
        if channel is not None:
            items = channel.findall("item")
        else:
            # Try searching for items directly or with namespaces
            items = root.findall(".//item") or root.findall(".//{http://purl.org/rss/1.0/}item")

        for item in items:
            # Helper to find text with or without namespace
            def get_text(elem, tag):
                found = elem.find(tag)
                if found is None:
                    # Try namespace agnostic search
                    for child in elem:
                        tag_name = child.tag.rsplit("}", 1)[-1]
                        if tag_name == tag:
                            return child.text
                    return None
                return found.text

            title = (get_text(item, "title") or "").strip()
            raw_link = (get_text(item, "link") or "").strip()
            
            # Fix link
            link = _ensure_bbs_id(raw_link, source)
            
            description = (get_text(item, "description") or "").strip()
            
            # Date parsing (try pubDate, dc:date, etc.)
            pub_date_raw = get_text(item, "pubDate") or get_text(item, "dc:date") or get_text(item, "date") or ""
            if not pub_date_raw or not pub_date_raw.strip():
                # 날짜가 없으면 현재 시간 사용 (항목은 유지)
                published_at = datetime.now(timezone.utc)
            else:
                # 날짜 파싱 시도 (실패해도 기본값 사용)
                published_at = self._parse_flexible_date(pub_date_raw, use_default=True)
                if published_at is None:
                    published_at = datetime.now(timezone.utc)

            # Unique ID
            notice_id = hashlib.sha1(f"{source['id']}-{title}-{link}".encode("utf-8")).hexdigest()
            
            category, risk_level, tags = self._categorize(title, description)
            
            notice = RegulationNotice(
                id=notice_id,
                source=source["id"],
                source_name=source["name"],
                title=title,
                summary=description[:400],
                published_at=published_at,
                url=link or source["url"],
                official_url=link or source["url"],
                category=category,
                risk_level=risk_level,
                tags=tags,
            )
            
            if notice_id not in self._notices:
                count += 1
            self._notices[notice_id] = notice
        return count

    def _categorize(self, title: str, summary: str):
        text = f"{title} {summary}".lower()
        for keyword, label in NOTICE_KEYWORDS:
            if keyword in text:
                risk = "ALERT" if keyword in ("합산", "파업") else "WATCH"
                return label, risk, [label]
        return "관세/통관 일반", "INFO", []

    def list_notices(self, limit: int = 20, category: Optional[str] = None, source: Optional[str] = None):
        notices = list(self._notices.values())
        notices.sort(key=lambda n: n.published_at, reverse=True)
        result = []
        for notice in notices:
            if category and category not in {notice.category, *notice.tags}:
                continue
            if source and source != notice.source:
                continue
            result.append(notice)
            if len(result) >= limit:
                break
        return result

    def highlights(self, limit: int = 3):
        notices = list(self._notices.values())
        # Prioritize ALERT > WATCH > recent
        notices.sort(
            key=lambda n: (NOTICE_RISK_ORDER.get(n.risk_level, 0), n.published_at),
            reverse=True,
        )
        return notices[:limit]

    def _parse_flexible_date(self, value: str, use_default: bool = True) -> Optional[datetime]:
        """
        Attempts to parse various date formats used by KCS and Korean gov RSS.
        Uses dateutil.parser as fallback for maximum compatibility.
        
        Args:
            value: Date string or datetime object to parse
            use_default: If True, returns current time when parsing fails. If False, returns None.
        
        Returns:
            Parsed datetime object in UTC, or None if parsing fails and use_default=False
        """
        if isinstance(value, datetime):
            dt = value
        else:
            raw = ""
            if isinstance(value, str):
                raw = value.strip()
            elif value is not None:
                raw = str(value).strip()
            
            if not raw:
                if use_default:
                    return datetime.now(timezone.utc)
                return None
            
            # 정규화: 다양한 시간대 표기 통일
            normalized = raw.replace("GMT+0900", "+0900").replace("GMT+09:00", "+0900")
            if normalized.endswith("KST"):
                normalized = normalized[:-3].strip()
                if normalized:
                    normalized = f"{normalized} +0900"
            
            dt = None
            
            # 1. ISO 형식 시도
            if normalized:
                try:
                    # Z를 +00:00로 변환
                    iso_str = normalized.replace("Z", "+00:00")
                    dt = datetime.fromisoformat(iso_str)
                except Exception:
                    pass
            
            # 2. 표준 패턴 시도
            if dt is None and normalized:
                patterns = [
                    "%a, %d %b %Y %H:%M:%S %z",      # RFC 822 with timezone
                    "%a, %d %b %Y %H:%M:%S %Z",      # RFC 822 with timezone name
                    "%a, %d %b %Y %H:%M:%S",         # RFC 822 without timezone
                    "%d %b %Y %H:%M:%S %z",          # Without weekday
                    "%d %b %Y %H:%M:%S",
                    "%Y-%m-%d %H:%M:%S",
                    "%Y-%m-%d %H:%M",
                    "%Y-%m-%d",
                    "%Y.%m.%d %H:%M:%S",
                    "%Y.%m.%d %H:%M",
                    "%Y.%m.%d",
                    "%Y/%m/%d %H:%M:%S",
                    "%Y/%m/%d",
                    "%d-%m-%Y %H:%M:%S",
                    "%d/%m/%Y %H:%M:%S",
                ]
                for pattern in patterns:
                    try:
                        dt = datetime.strptime(normalized, pattern)
                        break
                    except Exception:
                        continue
            
            # 3. dateutil.parser 사용 (가장 유연한 파싱)
            if dt is None:
                try:
                    from dateutil import parser as dtp
                    dt = dtp.parse(raw)
                except Exception:
                    pass
            
            # 4. 기본값 사용 또는 None 반환
            if dt is None:
                if use_default:
                    dt = datetime.now(timezone.utc)
                else:
                    return None
        
        # 시간대 처리
        if dt.tzinfo is None:
            # 시간대가 없으면 KST로 가정 (한국 정부 사이트이므로)
            kst = timezone(timedelta(hours=9))
            dt = dt.replace(tzinfo=kst)
        
        return dt.astimezone(timezone.utc)

    def get_fallback_detail(self, notice_id: str) -> Optional[Dict[str, object]]:
        return self._fallback_details.get(notice_id)

    def _has_real_notices(self) -> bool:
        return any(notice for notice in self._notices.values() if not notice.is_fallback)

    def _remove_fallback_entries(self):
        fallback_ids = [notice_id for notice_id, notice in self._notices.items() if notice.is_fallback]
        for notice_id in fallback_ids:
            self._notices.pop(notice_id, None)

    def _seed_fallback(self, reference_dt: datetime):
        base = reference_dt
        for idx, seed in enumerate(FALLBACK_NOTICE_SEED):
            seed_id = hashlib.sha1(f"seed-{seed['title']}-{idx}".encode("utf-8")).hexdigest()
            dt = base - timedelta(hours=idx * 6)
            payload = {
                **self._filter_seed_fields(seed),
                "id": seed_id,
                "published_at": dt,
                "url": f"/be4/notices/fallback/{seed_id}",
                "is_fallback": True,
            }
            notice = RegulationNotice(**payload)
            self._notices[notice.id] = notice
            self._fallback_details[notice.id] = dict(seed)

    def _filter_seed_fields(self, seed: Dict[str, object]) -> Dict[str, object]:
        primary = self._primary_reference_url(seed)
        data = {
            k: v for k, v in seed.items() if k not in {"detail_points", "reference_links"}
        }
        if primary:
            data.setdefault("official_url", primary)
        return data

    def _primary_reference_url(self, seed: Dict[str, object]) -> Optional[str]:
        refs = seed.get("reference_links") or []
        for ref in refs:
            url = ref.get("url")
            if url:
                return url
        return seed.get("official_url") or seed.get("url")


class BE4Module:
    def __init__(self):
        self.rule_engine = RuleEngine(RULES_PATH)
        self.notice_service = RegulationNoticeService(NOTICE_CACHE_PATH)

    async def startup(self):
        await self.notice_service.start()

    async def shutdown(self):
        await self.notice_service.shutdown()


be4 = BE4Module()


router = APIRouter(prefix="/be4", tags=["BE4"])


def get_be4() -> BE4Module:
    return be4


@router.get("/rules/library")
def get_rule_library(module: BE4Module = Depends(get_be4)):
    return module.rule_engine.to_metadata()


@router.post("/rules/evaluate", response_model=RuleEvaluationResponse)
def evaluate_rules(request: RuleEvaluationRequest, module: BE4Module = Depends(get_be4)):
    try:
        return module.rule_engine.evaluate(request)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/notices", response_model=List[RegulationNotice])
def list_notices(
    limit: int = 20,
    category: Optional[str] = None,
    source: Optional[str] = None,
    module: BE4Module = Depends(get_be4),
):
    limit = max(1, min(limit, 100))
    return module.notice_service.list_notices(limit=limit, category=category, source=source)


@router.get("/notices/highlights", response_model=List[RegulationNotice])
def highlight_notices(limit: int = 3, module: BE4Module = Depends(get_be4)):
    limit = max(1, min(limit, 5))
    return module.notice_service.highlights(limit)


@router.post("/notices/refresh")
async def refresh_notices(module: BE4Module = Depends(get_be4)):
    stats = await module.notice_service.refresh()
    return stats


@router.get("/notices/fallback/{notice_id}", response_class=HTMLResponse)
def fallback_notice_page(notice_id: str, module: BE4Module = Depends(get_be4)):
    detail = module.notice_service.get_fallback_detail(notice_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Fallback notice not available")
    html = _render_fallback_html(detail)
    return HTMLResponse(content=html)


def register_be4(app):
    app.include_router(router)
    app.add_event_handler("startup", be4.startup)
    app.add_event_handler("shutdown", be4.shutdown)
