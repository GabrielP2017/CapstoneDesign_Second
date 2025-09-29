import React, { useEffect, useState } from "react";
import { adminListTrackings, adminSyncFromFile, adminGetShipmentEvents } from "../../lib/api";
import { ChevronDown, ChevronRight, Clock, AlertTriangle, CheckCircle, Loader2 as LoaderIcon } from "lucide-react"; // 아이콘 사용

// Loader 아이콘

const Loader2 = (props) => (
  <svg {...props} viewBox="0 0 24 24" className={`animate-spin ${props.className || ""}`}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
    <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" fill="none" />
  </svg>
);

// 개선된 StatusPill 컴포넌트
const StatusPill = ({ status }) => {
  const s = (status || "UNKNOWN").toUpperCase();
  const style = {
    CLEARED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200",
    IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200",
    DELAY: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200",
    PRE_CUSTOMS: "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-200",
    UNKNOWN: "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-200",
  }[s] || "bg-slate-100 text-slate-700";

  const label = {
    CLEARED: "통관 완료",
    IN_PROGRESS: "진행 중",
    DELAY: "통관 지연",
    PRE_CUSTOMS: "입항 대기",
    UNKNOWN: "확인 필요",
  }[s] || s;

  return <span className={`px-2 py-1 rounded-full text-xs font-medium ${style}`}>{label}</span>;
};

// 최근 이벤트 번역 객체
const TIMELINE_DESC_TRANSLATIONS = {
  'Export customs clearance started, Carrier note: Export customs clearance started': '수출 통관 절차가 시작되었습니다.',
  'Export customs clearance complete, Carrier note: Export clearance success': '수출 통관이 정상적으로 완료되었습니다.',
  'Import customs clearance started, Carrier note: Import clearance start': '수입 통관 절차가 시작되었습니다.',
  'Import customs clearance delay.Package is held temporarily, Carrier note: Package is held temporarily': '통관 지연: 세관에서 화물을 일시 보류 중입니다.',
  'Import customs clearance complete, Carrier note: Import customs clearance complete': '수입 통관이 정상적으로 완료되었습니다.',
};

function formatDate(v) {
  if (!v) return "-";
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleString("ko-KR", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

export default function AdminShipments() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [syncResult, setSyncResult] = useState(null);
  const [error, setError] = useState("");
  
  // [NEW] 펼침 상태 & 이벤트 캐시
  const [expanded, setExpanded] = useState(() => new Set());
  const [eventsMap, setEventsMap] = useState(() => new Map()); // number -> events[]
  const [eventsLoading, setEventsLoading] = useState(() => new Set()); // 로딩중 번호

  async function load() {
    setError("");
    setLoading(true);
    try {
      const data = await adminListTrackings();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || "목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const onRefresh = async () => {
    setSyncResult(null);
    await load();
  };

  const onSync = async () => {
    setSyncResult(null);
    setError("");
    setLoading(true);
    try {
      const r = await adminSyncFromFile();
      setSyncResult(r);
      await load();
    } catch (e) {
      setError(e?.message || "동기화에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  
  const toggleExpand = async (number) => {
    const next = new Set(expanded);
    if (next.has(number)) {
      next.delete(number);
      setExpanded(next);
      return;
    }
    next.add(number);
    setExpanded(next);
    // 이벤트가 없고 아직 로딩한 적 없으면 fetch
    if (!eventsMap.has(number) && !eventsLoading.has(number)) {
      const loadingSet = new Set(eventsLoading);
      loadingSet.add(number);
      setEventsLoading(loadingSet);
      try {
        const evts = await adminGetShipmentEvents(number);
        const m = new Map(eventsMap);
        m.set(number, Array.isArray(evts) ? evts : []);
        setEventsMap(m);
      } catch (e) {
        // 실패 시 빈 배열 캐시(한번 접었다가 펴면 다시 시도하려면 여기서 캐시 안할 수도)
      } finally {
        const s = new Set(eventsLoading);
        s.delete(number);
        setEventsLoading(s);
      }
    }
  };

  const isEmpty = !loading && rows.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onSync}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:opacity-90 disabled:opacity-50"
          disabled={loading}
          title="백엔드가 내부 파일(tracking_numbers.json/txt)을 읽어 17TRACK→DB 동기화"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4" />
              처리 중…
            </span>
          ) : (
            "파일 ↔ DB 동기화"
          )}
        </button>
        <button
          onClick={onRefresh}
          className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:opacity-90 disabled:opacity-50"
          disabled={loading}
          title="DB 목록 새로고침"
        >
          새로고침
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-sm">
          {error}
        </div>
      )}

      {syncResult && !error && (
        <div className="text-sm text-slate-700 p-3 rounded-xl bg-emerald-50">
          {syncResult.ok === false ? (
            <>
              <div className="font-medium text-rose-700">동기화 실패</div>
              <div className="opacity-80">{syncResult.error || "알 수 없는 오류"}</div>
              {syncResult.tried && Array.isArray(syncResult.tried) && (
                <div className="opacity-70 mt-1">시도한 파일: {syncResult.tried.join(", ")}</div>
              )}
            </>
          ) : (
            <>
              <div className="font-medium">동기화 완료</div>
              <div className="opacity-80">
                요청 {syncResult.requested ?? "-"}건 · 반영 {syncResult.synced ?? "-"}건
              </div>
              {syncResult.file && <div className="opacity-70 mt-1">사용된 파일: {syncResult.file}</div>}
            </>
          )}
        </div>
      )}
<div className="bg-white/70 rounded-2xl shadow p-4">
        <div className="font-semibold mb-3">DB 운송장 목록</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200">
              <tr className="text-left">
                <th className="py-2 pr-4 w-8"></th>{/* [NEW] 펼침 토글 칼럼 */}
                <th className="py-2 pr-4">운송장번호</th>
                <th className="py-2 pr-4">상태</th>
                <th className="py-2 pr-4">최근 이벤트</th>
                <th className="py-2 pr-4">업데이트 시각</th>
                <th className="py-2 pr-4">소스</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skel-${i}`} className="animate-pulse">
                    <td className="py-2 pr-4"><div className="h-4 w-4 bg-slate-200 rounded" /></td>
                    <td className="py-2 pr-4"><div className="h-4 w-40 bg-slate-200 rounded" /></td>
                    <td className="py-2 pr-4"><div className="h-4 w-24 bg-slate-200 rounded" /></td>
                    <td className="py-2 pr-4"><div className="h-4 w-64 bg-slate-200 rounded" /></td>
                    <td className="py-2 pr-4"><div className="h-4 w-40 bg-slate-200 rounded" /></td>
                    <td className="py-2 pr-4"><div className="h-4 w-16 bg-slate-200 rounded" /></td>
                  </tr>
                ))
              ) : isEmpty ? (
                <tr><td colSpan={6} className="py-6 text-center text-slate-500">데이터가 없습니다.</td></tr>
              ) : (
                rows.map((r) => {
                  const isOpen = expanded.has(r.number);
                  const evtLoading = eventsLoading.has(r.number);
                  const events = eventsMap.get(r.number) || [];
                  const translatedEventText = TIMELINE_DESC_TRANSLATIONS[r.last_event_text]?.trim() || r.last_event_text;

                  return (
                    <React.Fragment key={r.number}>
                      <tr className="border-b border-slate-100">
                        <td className="py-2 pr-4 align-top">
                          <button
                            onClick={() => toggleExpand(r.number)}
                            className="p-1 rounded hover:bg-slate-100"
                            title={isOpen ? "접기" : "펼치기"}
                          >
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="py-2 pr-4 font-mono">{r.number}</td>
                        <td className="py-2 pr-4"><StatusPill status={r.status} /></td>
                        <td className="py-2 pr-4 text-slate-600">{translatedEventText || "-"}</td>
                        <td className="py-2 pr-4 text-slate-500">{formatDate(r.last_event_at)}</td>
                        <td className="py-2 pr-4 text-slate-500">{r.source || "-"}</td>
                      </tr>

                      {/* [NEW] 펼친 영역 */}
                      {isOpen && (
                        <tr>
                          <td></td>
                          <td colSpan={5} className="pb-3">
                            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                              <div className="font-medium mb-2">이벤트 타임라인</div>
                              {evtLoading ? (
                                <div className="text-slate-500 inline-flex items-center gap-2">
                                  <LoaderIcon className="w-4 h-4 animate-spin" />
                                  불러오는 중…
                                </div>
                              ) : events.length === 0 ? (
                                <div className="text-slate-500">이벤트가 없습니다.</div>
                              ) : (
                                <ul className="space-y-2">
                                  {events.map((e, idx) => {
                                    const t = formatDate(e.ts);
                                    const s = (e.stage || "").toUpperCase();
                                    const desc = TIMELINE_DESC_TRANSLATIONS[e.desc]?.trim() || e.desc || "";
                                    return (
                                      <li key={idx} className="flex items-start gap-2">
                                        {/* 간단한 스테이지 아이콘 */}
                                        {s === "CLEARED" ? (
                                          <CheckCircle className="w-4 h-4 mt-0.5" />
                                        ) : s === "DELAY" ? (
                                          <AlertTriangle className="w-4 h-4 mt-0.5" />
                                        ) : (
                                          <Clock className="w-4 h-4 mt-0.5" />
                                        )}
                                        <div className="grid grid-cols-[120px_1fr] gap-2">
                                          <div className="text-slate-500">{t}</div>
                                          <div>
                                            <span className="inline-block mr-2 align-middle"><StatusPill status={s} /></span>
                                            <span className="align-middle">{desc}</span>
                                            {e.source && <span className="ml-2 text-xs text-slate-400">({e.source})</span>}
                                          </div>
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}