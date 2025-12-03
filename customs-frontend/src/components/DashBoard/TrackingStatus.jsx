import React, { useEffect, useState, useRef } from "react";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Search,
  LifeBuoy,
  Bookmark,
  Package,
  Plane,
  Globe,
  Download,
  CalendarDays,
} from "lucide-react";
import { saveSearchHistory } from "../../lib/searchHistory";
import PresetsModal from "../Favorites/PresetsModal";
import { API_BASE_URL } from "../../lib/api";

// API 함수들
const API_BASE = API_BASE_URL;

const getHealth = async () => {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error("서버 연결 실패");
  return res.json();
};

const getNormalizedTracking = async (number) => {
  const res = await fetch(
    `${API_BASE}/debug/normalize?number=${encodeURIComponent(number)}`
  );
  if (!res.ok) {
    let message =
      res.status === 404
        ? "입력하신 운송장 번호의 통관 정보를 찾을 수 없습니다."
        : "조회 실패";
    try {
      const payload = await res.json();
      message =
        payload?.detail || payload?.message || payload?.error || message;
    } catch {
      const text = await res.text();
      if (text) message = text;
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return res.json();
};

const triggerTestWebhook = async () => {
  const res = await fetch(`${API_BASE}/test/webhook`, { method: "POST" });
  if (!res.ok) throw new Error("샘플 생성 실패");
  return res.json();
};

// 상태 메타데이터
const STATUS_META = {
  CLEARED: {
    label: "통관 완료",
    badge:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200",
    accent: "text-sky-500 dark:text-sky-300",
    heroBg:
      "bg-sky-100 text-sky-500 shadow-inner dark:bg-sky-900/40 dark:text-sky-200",
    heroIcon: CheckCircle2,
  },
  IN_PROGRESS: {
    label: "통관 진행",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200",
    accent: "text-blue-600 dark:text-blue-300",
    heroBg:
      "bg-blue-50 text-blue-600 shadow-inner dark:bg-blue-900/40 dark:text-blue-300",
    heroIcon: Loader2,
  },
  DELAY: {
    label: "지연",
    badge:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200",
    accent: "text-rose-600 dark:text-rose-400",
    heroBg:
      "bg-rose-50 text-rose-500 shadow-inner dark:bg-rose-900/40 dark:text-rose-300",
    heroIcon: AlertTriangle,
  },
  PRE_CUSTOMS: {
    label: "통관 전(수출 단계)",
    badge:
      "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-200",
    accent: "text-slate-600 dark:text-slate-300",
    heroBg:
      "bg-indigo-50 text-indigo-500 shadow-inner dark:bg-indigo-900/40 dark:text-indigo-300",
    heroIcon: Plane,
  },
  UNKNOWN: {
    label: "확인 필요",
    badge:
      "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-200",
    accent: "text-slate-500 dark:text-slate-300",
    heroBg:
      "bg-slate-100 text-slate-500 shadow-inner dark:bg-slate-800/50 dark:text-slate-200",
    heroIcon: LifeBuoy,
  },
};

const STAGE_META = {
  IN_PROGRESS: { label: "운송", dot: "bg-blue-500" },
  DELAY: { label: "지연", dot: "bg-amber-500" },
  CLEARED: { label: "완료", dot: "bg-emerald-500" },
};

const DOMESTIC_STAGE_RULES = [
  {
    pattern:
      /(배송완료|배달완료|배송 완료|배달 완료|delivered|delivery complete)/i,
    meta: { label: "배송 완료", dot: "bg-emerald-500" },
  },
  {
    pattern:
      /(배송|배달|출발|간선|line-haul|line haul|out for delivery|vehicle|픽업)/i,
    meta: { label: "배송 진행", dot: "bg-blue-500" },
  },
  {
    pattern: /(입고|도착|센터|터미널|허브|분류|분배|터미날)/i,
    meta: { label: "허브 도착", dot: "bg-indigo-500" },
  },
];

const classifyDomesticStage = (desc) => {
  const target = desc || "";
  for (const rule of DOMESTIC_STAGE_RULES) {
    if (rule.pattern.test(target)) return rule.meta;
  }
  return { label: "국내 진행", dot: "bg-slate-400" };
};

const TIMELINE_DESC_TRANSLATIONS = {
  "Export customs clearance started, Carrier note: Export customs clearance started":
    "수출 통관 절차가 시작되었습니다.",
  "Export customs clearance complete, Carrier note: Export clearance success":
    "수출 통관이 정상적으로 완료되었습니다.",
  "Import customs clearance started, Carrier note: Import clearance start":
    "수입 통관 절차가 시작되었습니다.",
  "Import customs clearance delay.Package is held temporarily, Carrier note: Package is held temporarily":
    "통관 지연: 세관에서 화물을 일시 보류 중입니다.",
  "Import customs clearance complete, Carrier note: Import customs clearance complete":
    "수입 통관이 정상적으로 완료되었습니다.",
  "Package delivered, Carrier note: 고객님의 상품이 배송완료 되었습니다.":
    "배송이 완료되었습니다.",
  "出口海?/放行": "수출 통관 완료",
};

const translateTimelineDesc = (description) => {
  if (!description) return "설명 없음";
  const matchingKey = Object.keys(TIMELINE_DESC_TRANSLATIONS).find((key) =>
    description.startsWith(key)
  );
  if (matchingKey) {
    const translation = TIMELINE_DESC_TRANSLATIONS[matchingKey];
    const dynamicPart = description.slice(matchingKey.length);
    return translation + dynamicPart;
  }
  return description;
};

function formatDate(isoString, options = {}) {
  if (!isoString) return null;
  const defaultOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  try {
    return new Date(isoString).toLocaleString("ko-KR", {
      ...defaultOptions,
      ...options,
    });
  } catch {
    return isoString;
  }
}

const toYYYYMMDD = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const InfoItem = ({ label, value }) => (
  <div className="flex justify-between items-center py-3 border-b border-slate-200/60 dark:border-slate-700/50 last:border-b-0">
    <dt className="text-sm text-slate-500 dark:text-slate-400">{label}</dt>
    <dd
      className={`text-base font-medium text-right ${
        !value || value === "데이터 없음"
          ? "text-slate-400 dark:text-slate-500 italic"
          : "text-slate-800 dark:text-slate-100"
      }`}
    >
      {value || "?"}
    </dd>
  </div>
);

function koCountry(v) {
  if (!v) return "";
  const s = String(v).trim();
  const ISO2_TO_KO = {
    CN: "중국",
    KR: "대한민국",
    JP: "일본",
    US: "미국",
    HK: "홍콩",
    TW: "대만",
    SG: "싱가포르",
    MY: "말레이시아",
    TH: "태국",
    VN: "베트남",
    ID: "인도네시아",
    DE: "독일",
    NL: "네덜란드",
    GB: "영국",
    FR: "프랑스",
    ES: "스페인",
    IT: "이탈리아",
    PL: "폴란드",
    TR: "튀르키예",
    AE: "아랍에미리트",
  };
  return /^[A-Z]{2}$/.test(s) ? ISO2_TO_KO[s] || s : s;
}

const JourneyProgressBar = ({ summary, events }) => {
  const status = (summary?.status || "UNKNOWN").toUpperCase();
  const hasExport = events.some(
    (e) => /export/i.test(e.desc) || (e.desc && e.desc.includes("出口海?/放行"))
  );
  const hasImport = events.some((e) => /import/i.test(e.desc));
  const isCleared = status === "CLEARED";
  let currentLevel = 0;
  if (hasExport) currentLevel = 1;
  if (
    hasImport ||
    status === "PRE_CUSTOMS" ||
    status === "IN_PROGRESS" ||
    status === "DELAY"
  )
    currentLevel = 2;
  if (isCleared) currentLevel = 3;
  const steps = [
    { key: "EXPORT", label: "수출 통관", icon: Plane },
    { key: "TRANSIT", label: "국제 배송", icon: Globe },
    { key: "IMPORT", label: "수입 통관", icon: Download },
    { key: "CLEARED", label: "완료", icon: CheckCircle2 },
  ];
  return (
    <div className="w-full">
      <div className="flex justify-between items-start">
        {steps.map((step, index) => {
          const isCompleted = currentLevel > index;
          const isActive = currentLevel === index;
          const isDelayed = isActive && status === "DELAY";
          let Icon = step.icon;
          if (isActive && status === "IN_PROGRESS" && step.key === "IMPORT")
            Icon = Loader2;
          if (isDelayed && step.key === "IMPORT") Icon = AlertTriangle;
          return (
            <React.Fragment key={step.key}>
              <div className="flex flex-col items-center text-center w-1/4 px-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-300 ${
                    isCompleted
                      ? "bg-emerald-500 text-white"
                      : isDelayed
                      ? "bg-amber-500 text-white"
                      : isActive
                      ? "bg-blue-500 text-white"
                      : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                  }`}
                >
                  <Icon
                    className={`w-6 h-6 ${
                      isActive &&
                      status === "IN_PROGRESS" &&
                      step.key === "IMPORT"
                        ? "animate-pulse"
                        : ""
                    }`}
                  />
                </div>
                <p
                  className={`mt-2 text-xs font-semibold transition-colors duration-300 ${
                    isCompleted || isActive
                      ? "text-slate-800 dark:text-slate-100"
                      : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {step.label}
                </p>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-1 mt-5 rounded transition-colors duration-300 ${
                    isCompleted
                      ? "bg-emerald-400"
                      : "bg-slate-200 dark:bg-slate-700"
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

const AnimatedBlock = ({ children, delay = 0, className = "" }) => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(false);
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay, children]);
  return (
    <div
      className={`${className} transition-all duration-500 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      {children}
    </div>
  );
};

const MOCK_DATA_DISTRIBUTION = {
  transit: [
    { days: 4, probability: 0.15 },
    { days: 5, probability: 0.5 },
    { days: 6, probability: 0.25 },
    { days: 7, probability: 0.1 },
  ],
  clearance: [
    { days: 1, probability: 0.2 },
    { days: 2, probability: 0.7 },
    { days: 3, probability: 0.1 },
  ],
};

const NOT_FOUND_MESSAGE =
  "입력하신 운송장 번호의 통관 정보를 찾을 수 없습니다.";

const IMPORTANT_DETAIL_KEYS = [
  "origin_country",
  "destination_country",
  "arrival_date",
  "arrival_port",
  "event_processed_at",
  "hub",
  "carrier",
  "last_location",
  "predicted_eta_ts",
  "predicted_clearance_ts",
];

const hasMeaningfulSummary = (summary) => {
  if (!summary) return false;
  const status = (summary.status || "UNKNOWN").toUpperCase();
  if (status && status !== "UNKNOWN") return true;
  return Boolean(
    summary.cleared_at ||
      summary.in_progress_at ||
      summary.has_delay ||
      (Array.isArray(summary.delays) && summary.delays.length > 0)
  );
};

const hasMeaningfulDetails = (details) => {
  if (!details || typeof details !== "object") return false;
  return IMPORTANT_DETAIL_KEYS.some((key) => {
    const value = details[key];
    if (value === null || typeof value === "undefined") return false;
    if (typeof value === "string" && value.trim() === "") return false;
    return true;
  });
};

const hasMeaningfulEvents = (events) =>
  Array.isArray(events) && events.length > 0;

const hasMeaningfulRawEvents = (events) =>
  Array.isArray(events) &&
  events.some((event) => event && (event.ts || event.desc || event.location));

const looksLikeEmptyTracking = (data) => {
  if (!data || typeof data !== "object") return true;
  const summary = data.summary;
  const normalized = data.normalized;
  const details = data.details;
  const rawEvents = data.raw_provider_events;
  const anyEventsFlag = Boolean(data.any_events);

  if (hasMeaningfulSummary(summary)) return false;
  if (hasMeaningfulDetails(details)) return false;
  if (hasMeaningfulEvents(normalized)) return false;
  if (hasMeaningfulRawEvents(rawEvents)) return false;
  if (anyEventsFlag) return false;
  return true;
};

const deriveDepartureDate = (details = {}, normalizedEvents = []) => {
  const candidates = [
    details?.departure_date,
    details?.event_processed_at,
    details?.arrival_date,
  ];

  const safeEvents = Array.isArray(normalizedEvents) ? normalizedEvents : [];
  if (safeEvents.length > 0) {
    const firstEvent = safeEvents[0];
    const lastEvent = safeEvents[safeEvents.length - 1];
    if (firstEvent?.ts) candidates.push(firstEvent.ts);
    if (lastEvent?.ts) candidates.push(lastEvent.ts);
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
};

const buildFallbackPrediction = (baseDate = new Date()) => {
  const weightedAverageDays = (distribution) =>
    distribution.reduce((acc, item) => acc + item.days * item.probability, 0);
  const maxDays = (distribution) =>
    distribution.reduce((max, item) => Math.max(max, item.days), 0);

  const departure = new Date(baseDate);
  const clearance = new Date(departure);
  clearance.setDate(
    clearance.getDate() +
      Math.round(weightedAverageDays(MOCK_DATA_DISTRIBUTION.transit))
  );

  const etaP50 = new Date(clearance);
  etaP50.setDate(
    etaP50.getDate() +
      Math.round(weightedAverageDays(MOCK_DATA_DISTRIBUTION.clearance))
  );

  const etaP90 = new Date(departure);
  etaP90.setDate(
    etaP90.getDate() +
      maxDays(MOCK_DATA_DISTRIBUTION.transit) +
      maxDays(MOCK_DATA_DISTRIBUTION.clearance)
  );

  return {
    predicted_clearance_ts: clearance.toISOString(),
    predicted_eta_ts: etaP50.toISOString(),
    predicted_eta_p90_ts: etaP90.toISOString(),
  };
};

export default function TrackingStatus({
  initialNumber,
  autoLookup,
  autoSample,
  autoIncomplete,
  triggerId,
} = {}) {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [rawProviderEvents, setRawProviderEvents] = useState([]);
  const [anyEvents, setAnyEvents] = useState(false);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [notFoundMessage, setNotFoundMessage] = useState("");
  const [health, setHealth] = useState({ state: "checking", detail: null });
  const [isPredicting, setIsPredicting] = useState(false);
  const [predictionError, setPredictionError] = useState("");
  const [showPresetModal, setShowPresetModal] = useState(false);
  const predictionRequestRef = useRef(0);

  useEffect(() => {
    let ignore = false;
    getHealth()
      .then((res) => {
        if (!ignore) setHealth({ state: "ok", detail: res });
      })
      .catch((err) => {
        if (!ignore)
          setHealth({
            state: "error",
            detail: err.message || "서버 점검 필요",
          });
      });
    return () => {
      ignore = true;
    };
  }, []);

  // MainPage 등에서 전달된 의도를 한 번만 실행
  useEffect(() => {
    const run = async () => {
      if (autoSample) {
        await handleSample();
        return;
      }
      if (autoIncomplete) {
        handleIncompleteTest();
        return;
      }
      if (initialNumber && autoLookup) {
        setTrackingNumber(initialNumber);
        await lookup(initialNumber);
      }
    };
    if (triggerId !== undefined) {
      run();
    }
  }, [triggerId]);

  const triggerAutoPrediction = async (
    number,
    sourceDetails,
    normalizedEvents
  ) => {
    if (!number) return;
    const departureDate = deriveDepartureDate(
      sourceDetails || {},
      normalizedEvents || []
    );
    predictionRequestRef.current += 1;
    const requestId = predictionRequestRef.current;
    setIsPredicting(true);
    setPredictionError("");

    try {
      const response = await fetch(`${API_BASE}/api/predict-delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracking_number: number,
          departure_date: departureDate.toISOString(),
          hub: sourceDetails?.hub || "ICN",
          carrier: sourceDetails?.carrier || "Unknown",
          origin: sourceDetails?.origin_country || "Unknown",
        }),
      });

      if (!response.ok) throw new Error("예상일 API 호출 실패");
      const data = await response.json();
      if (requestId !== predictionRequestRef.current) return;
      setDetails((prev) => ({
        ...(prev || {}),
        predicted_clearance_median_h: data.predicted_clearance_median_h,
        predicted_clearance_p90_h: data.predicted_clearance_p90_h,
        predicted_delivery_median_h: data.predicted_delivery_median_h,
        predicted_delivery_p90_h: data.predicted_delivery_p90_h,
        predicted_clearance_ts: data.predicted_clearance_ts,
        predicted_eta_ts: data.predicted_eta_ts,
        predicted_eta_p90_ts: data.predicted_eta_p90_ts,
      }));
    } catch (err) {
      if (requestId !== predictionRequestRef.current) return;
      console.warn("예상일 계산 실패, 대체 데이터 사용:", err);
      const fallback = buildFallbackPrediction(departureDate);
      setDetails((prev) => ({
        ...(prev || {}),
        ...fallback,
      }));
      setPredictionError(err.message || "예상일 계산에 실패했습니다.");
    } finally {
      if (requestId === predictionRequestRef.current) {
        setIsPredicting(false);
      }
    }
  };

  const lookup = async (number) => {
    const trimmed = number.trim();
    if (!trimmed) {
      setError("운송장 번호를 입력하세요.");
      return;
    }
    setTrackingNumber(trimmed);
    setLoading(true);
    setError("");
    setNotFound(false);
    setNotFoundMessage("");
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const data = await getNormalizedTracking(trimmed);
      if (looksLikeEmptyTracking(data)) {
        setSummary(null);
        setEvents([]);
        setRawProviderEvents([]);
        setAnyEvents(false);
        setDetails(null);
        setNotFound(true);
        setNotFoundMessage(NOT_FOUND_MESSAGE);
        return;
      }
      const status = data?.summary?.status || "UNKNOWN";
      setSummary(data?.summary || null);
      setEvents(Array.isArray(data?.normalized) ? data.normalized : []);
      setRawProviderEvents(
        Array.isArray(data?.raw_provider_events) ? data.raw_provider_events : []
      );
      setAnyEvents(Boolean(data?.any_events));
      setDetails(data?.details || null);
      triggerAutoPrediction(trimmed, data?.details, data?.normalized);

      // 검색 성공 시 기록에 저장
      saveSearchHistory(trimmed, status);
    } catch (err) {
      if (err.status === 404) {
        setSummary(null);
        setEvents([]);
        setRawProviderEvents([]);
        setAnyEvents(false);
        setDetails(null);
        setNotFound(true);
        setNotFoundMessage(err.message || NOT_FOUND_MESSAGE);
      } else {
        setError(err.message || "조회 중 오류가 발생했어요.");
        setSummary(null);
        setEvents([]);
        setRawProviderEvents([]);
        setAnyEvents(false);
        setDetails(null);
        setNotFound(false);
        setNotFoundMessage("");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    lookup(trackingNumber);
  };

  const handleSample = async () => {
    setLoading(true);
    setError("");
    setNotFound(false);
    setNotFoundMessage("");
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const sample = await triggerTestWebhook();
      const sampleNumber = sample?.data?.number;
      if (sampleNumber) {
        setTrackingNumber(sampleNumber);
        await lookup(sampleNumber);
      } else {
        setError("샘플 데이터를 가져오지 못했어요.");
      }
    } catch (err) {
      setError(err.message || "샘플 호출 중 오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  };

  const handlePresetSelect = async (preset) => {
    if (
      !preset ||
      !Array.isArray(preset.trackingNumbers) ||
      preset.trackingNumbers.length === 0
    ) {
      return;
    }
    const firstNumber = preset.trackingNumbers[0];
    setTrackingNumber(firstNumber);
    setShowPresetModal(false);
    await lookup(firstNumber);
  };

  const handleClosePresetModal = () => setShowPresetModal(false);

  const handleIncompleteTest = () => {
    setLoading(true);
    setError("");
    setNotFound(false);
    setNotFoundMessage("");
    const mockPreCustomsData = {
      summary: {
        status: "PRE_CUSTOMS",
        in_progress_at: null,
        cleared_at: null,
        has_delay: false,
        delays: [],
        duration_sec: null,
      },
      normalized: [
        {
          desc: "Export customs clearance started, Carrier note: Export customs clearance started",
          stage: "IN_PROGRESS",
          ts: "2025-09-24T10:00:00Z",
        },
      ],
      any_events: true,
    };
    setTrackingNumber("INCOMPLETE_TEST");
    setTimeout(() => {
      setSummary(mockPreCustomsData.summary);
      setEvents(mockPreCustomsData.normalized);
      setAnyEvents(mockPreCustomsData.any_events);
      setRawProviderEvents([]);
      setDetails(null);
      setLoading(false);
      triggerAutoPrediction(
        "INCOMPLETE_TEST",
        null,
        mockPreCustomsData.normalized
      );
    }, 500);
  };

  const statusKey = (summary?.status || "UNKNOWN").toUpperCase();

  const needsTransitFallback =
    (!events || events.length === 0) &&
    anyEvents &&
    (statusKey === "PRE_CUSTOMS" || statusKey === "UNKNOWN");

  const fallbackFromRaw = needsTransitFallback
    ? (rawProviderEvents || [])
        .filter((e) => e && (e.ts || e.desc || e.location))
        .slice(-5)
        .map((e) => ({
          ts:
            e.ts ||
            details?.event_processed_at ||
            details?.sync_processed_at ||
            new Date().toISOString(),
          stage: "IN_PROGRESS",
          desc: e?.desc || "이동",
          location: e?.location || null,
        }))
    : [];

  const normalizedWithLoc = Array.isArray(events)
    ? events.map((e) => ({
        ts: e.ts,
        stage: e.stage,
        desc: e.desc || null,
        location: e.location || null,
      }))
    : [];

  const lastNormTs =
    normalizedWithLoc.length > 0
      ? normalizedWithLoc[normalizedWithLoc.length - 1].ts
      : null;

  const rawTail = (rawProviderEvents || [])
    .filter((e) => e && (e.ts || e.desc || e.location))
    .filter(
      (e) => !lastNormTs || (e.ts && new Date(e.ts) > new Date(lastNormTs))
    )
    .map((e) => ({
      ts:
        e.ts ||
        details?.event_processed_at ||
        details?.sync_processed_at ||
        new Date().toISOString(),
      stage: "IN_PROGRESS",
      desc: e.desc || "이동",
      location: e.location || null,
    }));

  const viewEvents = (() => {
    if (normalizedWithLoc.length > 0) {
      const merged = [...normalizedWithLoc];
      for (const r of rawTail) {
        const i = merged.findIndex(
          (x) => x.ts === r.ts && (x.desc || "") === (r.desc || "")
        );
        if (i >= 0 && !merged[i].location && r.location) {
          merged[i] = { ...merged[i], location: r.location };
        }
      }
      return merged;
    }
    if (fallbackFromRaw && fallbackFromRaw.length > 0) return fallbackFromRaw;
    if (needsTransitFallback) {
      return [
        {
          ts:
            details?.event_processed_at ||
            details?.sync_processed_at ||
            new Date().toISOString(),
          stage: "IN_PROGRESS",
          desc: "이동",
          location: details?.last_location || null,
        },
      ];
    }
    return [];
  })();

  const customsTimeline = viewEvents;

  const parseTimestamp = (ts) => {
    if (!ts) return null;
    const parsed = new Date(ts);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  const domesticStartTs =
    summary?.cleared_at ||
    details?.arrival_date ||
    details?.event_processed_at ||
    details?.sync_processed_at ||
    null;
  const domesticStartBoundary = parseTimestamp(domesticStartTs);

  const domesticTimeline = (() => {
    if (!Array.isArray(rawProviderEvents) || rawProviderEvents.length === 0)
      return [];
    const domesticKeyword =
      /(배송|배달|국내|입고|간선|터미널|센터|분류|픽업|delivery|delivered)/i;
    return rawProviderEvents
      .filter((event) => event && (event.ts || event.desc || event.location))
      .filter((event) => {
        if (!domesticStartBoundary) {
          return domesticKeyword.test(event.desc || "");
        }
        const eventDate = parseTimestamp(event.ts);
        if (!eventDate) return domesticKeyword.test(event.desc || "");
        return eventDate >= domesticStartBoundary;
      })
      .map((event) => {
        const ts =
          event.ts ||
          domesticStartTs ||
          details?.sync_processed_at ||
          new Date().toISOString();
        const meta = classifyDomesticStage(event.desc || "");
        return {
          ts,
          desc: event.desc || "국내 배송 진행",
          location: event.location || null,
          stageMeta: meta,
        };
      })
      .sort((a, b) => {
        const tsA = parseTimestamp(a.ts);
        const tsB = parseTimestamp(b.ts);
        if (!tsA && !tsB) return 0;
        if (!tsA) return -1;
        if (!tsB) return 1;
        return tsA - tsB;
      })
      .slice(-8);
  })();

  const statusMeta = STATUS_META[statusKey] || STATUS_META.UNKNOWN;
  const predictedEta = details?.predicted_eta_ts
    ? formatDate(details.predicted_eta_ts)
    : null;
  const predictedEtaP90 = details?.predicted_eta_p90_ts
    ? formatDate(details.predicted_eta_p90_ts)
    : null;
  const predictedClearance = details?.predicted_clearance_ts
    ? formatDate(details.predicted_clearance_ts)
    : null;
  const predictedClearanceDate = parseTimestamp(
    details?.predicted_clearance_ts
  );
  const predictedEtaDate = parseTimestamp(details?.predicted_eta_ts);
  const predictedEtaP90Date = parseTimestamp(details?.predicted_eta_p90_ts);

  const predictionHighlights = [
    predictedClearance && {
      key: "clearance",
      label: "통관 완료 예상",
      value: predictedClearance,
      icon: CheckCircle2,
      iconBg:
        "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300",
      accent: "text-emerald-600 dark:text-emerald-400",
    },
    predictedEta && {
      key: "eta",
      label: "평균 도착일",
      value: predictedEta,
      icon: CalendarDays,
      iconBg:
        "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300",
      accent: "text-blue-700 dark:text-blue-300",
    },
    predictedEtaP90 && {
      key: "etaP90",
      label: "최대 지연 예상",
      value: predictedEtaP90,
      icon: AlertTriangle,
      iconBg:
        "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300",
      accent: "text-amber-600 dark:text-amber-300",
    },
  ].filter(Boolean);

  const predictionTimeline = (() => {
    const points = [];
    if (predictedClearanceDate && predictedClearance) {
      points.push({
        key: "clearance",
        label: "통관 완료",
        value: predictedClearance,
        ts: predictedClearanceDate.getTime(),
        color: "bg-emerald-500",
      });
    }
    if (predictedEtaDate && predictedEta) {
      points.push({
        key: "eta",
        label: "평균 도착일",
        value: predictedEta,
        ts: predictedEtaDate.getTime(),
        color: "bg-blue-500",
      });
    }
    if (predictedEtaP90Date && predictedEtaP90) {
      points.push({
        key: "etaP90",
        label: "최대 지연 예상",
        value: predictedEtaP90,
        ts: predictedEtaP90Date.getTime(),
        color: "bg-amber-500",
      });
    }
    if (points.length === 0) return [];
    if (points.length === 1) {
      return points.map((point) => ({ ...point, position: 50 }));
    }
    const timestamps = points.map((point) => point.ts);
    const min = Math.min(...timestamps);
    const max = Math.max(...timestamps);
    const span = Math.max(max - min, 1);
    return points.map((point) => ({
      ...point,
      position: ((point.ts - min) / span) * 100,
    }));
  })();
  const showPredictionTimeline = predictionTimeline.length >= 2;
  const lastUpdated = formatDate(
    details?.event_processed_at || details?.sync_processed_at
  );
  const StatusHeroIcon = statusMeta.heroIcon || CheckCircle2;

  return (
    <div className="space-y-6">
      <section className="bg-white/80 dark:bg-slate-900/80 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-sm">
        <div className="mb-4 border-b border-slate-200/70 pb-3 dark:border-slate-700/60">
          <div className="flex flex-col gap-3 text-center">
            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-50">
              실시간 통관 상태 조회
            </h3>
            <div className="flex items-center justify-end text-sm text-slate-600 dark:text-slate-300">
              {health.state === "checking" && (
                <span className="text-slate-400 flex items-center gap-1">
                  <Loader2 className="w-4 h-4 animate-spin" /> 서버 확인 중
                </span>
              )}
              {health.state === "ok" && (
                <span className="text-emerald-500 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> 연결됨
                </span>
              )}
              {health.state === "error" && (
                <span className="text-red-500 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> 연결 실패
                </span>
              )}
            </div>
          </div>
        </div>
        <form
          onSubmit={handleSubmit}
          className="space-y-4 px-2 sm:px-4 py-3 bg-slate-50/40 dark:bg-slate-900/30 rounded-2xl"
        >
          <div className="relative mx-auto w-full md:w-4/5">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="예: RB123456789CN"
              className="w-full rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 pl-12 pr-32 py-3 text-base shadow-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60"
              disabled={loading}
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> 조회 중
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Search className="w-4 h-4" /> 조회
                </span>
              )}
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-slate-600 dark:text-slate-300 pt-2">
            <button
              type="button"
              onClick={handleSample}
              className="inline-flex items-center gap-2 font-semibold hover:text-blue-500 transition-colors disabled:opacity-50"
              disabled={loading}
            >
              <LifeBuoy className="w-4 h-4" /> 샘플 조회
            </button>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <button
              type="button"
              onClick={() => setShowPresetModal(true)}
              className="inline-flex items-center gap-2 font-semibold hover:text-blue-500 transition-colors disabled:opacity-50"
              disabled={loading}
            >
              <Bookmark className="w-4 h-4" /> 즐겨찾는 운송장
            </button>
          </div>
        </form>
        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/80 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {notFound && !error && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-slate-200/70 bg-slate-50/80 p-4 text-sm text-slate-600 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-200">
            <Package className="mt-0.5 h-5 w-5 flex-shrink-0 text-slate-400 dark:text-slate-500" />
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-100">
                안내
              </p>
              <p>{notFoundMessage || NOT_FOUND_MESSAGE}</p>
            </div>
          </div>
        )}
      </section>
      <PresetsModal
        open={showPresetModal}
        onClose={handleClosePresetModal}
        onSelectPreset={handlePresetSelect}
      />

      {summary && !error && !notFound && (
        <div className="space-y-6">
          <AnimatedBlock>
            <section className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/70 lg:p-6">
              <div className="mb-4 border-b border-slate-200/60 pb-3 dark:border-slate-700/50">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  현재 상태
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  실시간 통관 진행 현황을 확인하세요.
                </p>
              </div>
              <div className="flex flex-col gap-6">
                <div className="flex flex-col items-center py-4">
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full ${statusMeta.heroBg}`}
                    >
                      <StatusHeroIcon className="h-4 w-4" />
                    </div>
                    <p
                      className={`text-3xl sm:text-4xl font-extrabold tracking-tight text-center ${
                        statusMeta.accent || "text-slate-900 dark:text-white"
                      }`}
                    >
                      {statusMeta.label}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row divide-y divide-slate-200/70 dark:divide-slate-700/60 sm:divide-y-0 sm:divide-x rounded-xl border border-slate-100/70 dark:border-slate-700/50 bg-slate-50/70 dark:bg-slate-900/40 overflow-hidden text-sm text-slate-600 dark:text-slate-200">
                  <div className="flex-1 px-4 py-3 text-center">
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      지연 현황
                    </p>
                    <p
                      className={`mt-1 font-semibold ${
                        summary?.has_delay
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {summary?.has_delay
                        ? `지연 ${
                            Array.isArray(summary.delays)
                              ? summary.delays.length
                              : 0
                          }건`
                        : "지연 없음"}
                    </p>
                  </div>
                  <div className="flex-1 px-4 py-3 text-center">
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      마지막 갱신
                    </p>
                    <p className="mt-1 font-semibold text-slate-700 dark:text-slate-100">
                      {lastUpdated || "정보 없음"}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </AnimatedBlock>

          <div className="flex flex-col gap-6">
            <AnimatedBlock delay={150} className="h-full">
              <section className="flex h-full flex-col rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60 lg:p-6">
                <div className="mb-4 border-b border-slate-200/60 pb-3 dark:border-slate-700/50">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    주요 배송 정보
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    통관 요약과 핵심 이벤트를 빠르게 확인하세요.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100/70 bg-white/70 dark:border-slate-800/60 dark:bg-slate-900/40">
                  <div className="p-4 border-b border-slate-200/60 dark:border-slate-700/50">
                    <JourneyProgressBar summary={summary} events={viewEvents} />
                  </div>
                  <div className="p-4 flex flex-col gap-6 lg:flex-row">
                    <div className="lg:flex-1 lg:pr-6">
                      <dl>
                        {summary.has_delay ? (
                          <div className="mb-3">
                            <div className="flex justify-between items-center py-3 border-b border-slate-200/60 dark:border-slate-700/50">
                              <dt className="text-sm text-slate-500 dark:text-slate-400">
                                지연 상태
                              </dt>
                              <dd className="text-base font-medium text-right text-rose-600 dark:text-rose-400">
                                {Array.isArray(summary.delays)
                                  ? summary.delays.length
                                  : 0}
                                건 발생
                              </dd>
                            </div>
                            <div className="mt-2 pl-3 space-y-2">
                              {Array.isArray(summary.delays) &&
                                summary.delays.map((d, i) => {
                                  const translatedHint =
                                    TIMELINE_DESC_TRANSLATIONS[d.hint] ||
                                    d.hint;
                                  return (
                                    <div
                                      key={i}
                                      className="text-xs text-rose-600 dark:text-rose-400"
                                    >
                                      <p className="font-semibold">
                                        {formatDate(d.at, {
                                          year: undefined,
                                          hour12: true,
                                        })}
                                      </p>
                                      <p className="opacity-80">
                                        {translatedHint}
                                      </p>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        ) : (
                          <InfoItem label="지연 상태" value="지연 없음" />
                        )}
                        <InfoItem
                          label="적출국"
                          value={
                            details &&
                            typeof details.origin_country !== "undefined" &&
                            String(details.origin_country).trim() !== ""
                              ? koCountry(details.origin_country)
                              : "데이터 없음"
                          }
                        />
                        <InfoItem
                          label="입항일"
                          value={
                            details?.arrival_date
                              ? formatDate(details.arrival_date, {
                                  hour: undefined,
                                  minute: undefined,
                                })
                              : "데이터 없음"
                          }
                        />
                        <InfoItem
                          label="처리일시(이벤트기준)"
                          value={formatDate(details?.event_processed_at)}
                        />
                        <InfoItem
                          label="처리일시(동기화기준)"
                          value={formatDate(details?.sync_processed_at)}
                        />
                      </dl>
                    </div>
                    <div className="pt-4 border-t border-slate-200/60 dark:border-slate-700/50 lg:flex-1 lg:pt-0 lg:pl-6 lg:border-t-0 lg:border-l lg:border-slate-200/70 dark:lg:border-slate-700/60">
                      <div className="mb-4">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                          예상 도착일
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          AI 추정 통관·도착 일정
                        </p>
                      </div>
                      {isPredicting && (
                        <p className="flex items-center text-sm text-slate-500 dark:text-slate-400">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          예측 중
                        </p>
                      )}
                      {!isPredicting && predictionHighlights.length > 0 && (
                        <>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {predictionHighlights.map((item) => {
                              const Icon = item.icon;
                              const isWide = item.key === "clearance";
                              const valueClass =
                                item.key === "clearance"
                                  ? "text-base sm:text-lg"
                                  : "text-sm sm:text-base";
                              return (
                                <div
                                  key={item.key}
                                  className={`flex items-center gap-3 rounded-xl border border-slate-200/60 bg-white/80 px-4 py-4 dark:border-slate-700/60 dark:bg-slate-900/30 ${
                                    isWide ? "sm:col-span-2" : ""
                                  }`}
                                >
                                  <div
                                    className={`h-12 w-12 rounded-full flex items-center justify-center ${item.iconBg}`}
                                  >
                                    <Icon className="h-5 w-5" />
                                  </div>
                                  <div className="flex-1 text-left">
                                    <p className="text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
                                      {item.label}
                                    </p>
                                    <p
                                      className={`${valueClass} font-semibold ${item.accent} mt-1`}
                                    >
                                      {item.value}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {showPredictionTimeline && (
                            <div className="mt-5">
                              <div className="relative h-1.5 rounded-full bg-slate-200 dark:bg-slate-800">
                                {predictionTimeline.map((point) => (
                                  <div
                                    key={point.key}
                                    className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-2 ring-slate-300 dark:border-slate-900 dark:ring-slate-700 ${point.color}`}
                                    style={{ left: `${point.position}%` }}
                                  />
                                ))}
                              </div>
                              <div className="mt-3 flex justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                                {predictionTimeline.map((point) => (
                                  <div
                                    key={`${point.key}-label`}
                                    className="flex-1 text-center"
                                  >
                                    <p className="font-semibold text-slate-700 dark:text-slate-200">
                                      {point.label}
                                    </p>
                                    <p>{point.value}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      {!isPredicting && predictionHighlights.length === 0 && (
                        <p className="text-sm text-slate-400 dark:text-slate-500">
                          예측 정보 없음
                        </p>
                      )}
                      {predictionError && (
                        <p className="mt-3 text-xs text-rose-500 dark:text-rose-400">
                          {predictionError}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </AnimatedBlock>
            <AnimatedBlock delay={250} className="h-full">
              <section className="flex h-full flex-col rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60 lg:p-6">
                <div className="border-b border-slate-200/60 pb-3 dark:border-slate-700/50">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    처리 타임라인
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    통관과 국내 이동 이벤트를 나란히 비교해 보세요.
                  </p>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-0 dark:border-slate-700/60 dark:bg-slate-900/50">
                    <div className="p-5">
                      <h5 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                        수입 통관 타임라인
                      </h5>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        통관 진행 기록
                      </p>
                      <div className="mt-6 mx-auto h-px w-11/12 rounded-full bg-slate-300 dark:bg-slate-600" />
                    </div>
                    <div className="p-5">
                      {customsTimeline.length > 0 ? (
                        <ul className="flex flex-col gap-1">
                          {customsTimeline.map((eventItem, index) => {
                            const stage = STAGE_META[eventItem.stage] || {
                              label: eventItem.stage || "진행",
                              dot: "bg-slate-400",
                            };
                            const translatedDesc = translateTimelineDesc(
                              eventItem.desc
                            );
                            const isLast = index === customsTimeline.length - 1;
                            return (
                              <li
                                key={`${eventItem.stage}-${index}`}
                                className="flex gap-4"
                              >
                                <div className="relative flex flex-col items-center w-8">
                                  <span
                                    className={`h-3.5 w-3.5 rounded-full border-[1.5px] border-white ring ring-slate-200 shadow-sm dark:border-slate-900 dark:ring-slate-600 ${stage.dot}`}
                                  />
                                  {!isLast && (
                                    <span className="mt-1 flex-1 border-l border-dashed border-slate-300 dark:border-slate-600/80" />
                                  )}
                                </div>
                                <div className="flex-1 border-b border-slate-100/70 pb-4 last:border-b-0 dark:border-slate-800/70">
                                  <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-300">
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                                      {stage.label}
                                    </span>
                                    <span>· {formatDate(eventItem.ts)}</span>
                                    {eventItem?.location ? (
                                      <span className="text-slate-500 dark:text-slate-400">
                                        · {eventItem.location}
                                      </span>
                                    ) : null}
                                  </p>
                                  <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-100">
                                    {translatedDesc}
                                  </p>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="text-sm text-slate-500 dark:text-slate-300">
                          {anyEvents
                            ? "통관 키워드에 해당하지 않는 이벤트만 감지되었습니다."
                            : "표시할 통관 이벤트가 없습니다."}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-0 dark:border-slate-700/60 dark:bg-slate-900/50">
                    <div className="p-5">
                      <h5 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                        국내 배송 타임라인
                      </h5>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        국내 이동 기록
                      </p>
                      <div className="mt-6 mx-auto h-px w-11/12 rounded-full bg-slate-300 dark:bg-slate-600" />
                    </div>
                    <div className="p-5">
                      {domesticTimeline.length > 0 ? (
                        <ul className="flex flex-col gap-1">
                          {domesticTimeline.map((eventItem, index) => {
                            const isLast =
                              index === domesticTimeline.length - 1;
                            return (
                              <li
                                key={`domestic-${index}`}
                                className="flex gap-4"
                              >
                                <div className="relative flex flex-col items-center w-8">
                                  <span
                                    className={`h-3.5 w-3.5 rounded-full border-[1.5px] border-white ring ring-slate-200 shadow-sm dark:border-slate-900 dark:ring-slate-600 ${eventItem.stageMeta.dot}`}
                                  />
                                  {!isLast && (
                                    <span className="mt-1 flex-1 border-l border-dashed border-slate-300 dark:border-slate-600/80" />
                                  )}
                                </div>
                                <div className="flex-1 border-b border-slate-100/70 pb-4 last:border-b-0 dark:border-slate-800/70">
                                  <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-300">
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                                      {eventItem.stageMeta.label}
                                    </span>
                                    <span>· {formatDate(eventItem.ts)}</span>
                                    {eventItem.location ? (
                                      <span className="text-slate-500 dark:text-slate-400">
                                        · {eventItem.location}
                                      </span>
                                    ) : null}
                                  </p>
                                  <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-100">
                                    {eventItem.desc}
                                  </p>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="text-sm text-slate-500 dark:text-slate-300">
                          최근 국내 배송 이벤트가 없습니다.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </AnimatedBlock>
          </div>
        </div>
      )}
    </div>
  );
}
