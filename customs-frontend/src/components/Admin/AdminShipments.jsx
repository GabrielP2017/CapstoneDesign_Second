import React, { useEffect, useState } from "react";
import { adminListTrackings, adminSyncFromFile } from "../../lib/api";

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
                  <tr key={i} className="border-b border-slate-100">
                    <td colSpan={5} className="py-1 pr-4">
                      <div className="h-8 rounded-md bg-slate-100 animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : isEmpty ? (
                <tr>
                  <td className="py-6 text-center text-slate-500" colSpan={5}>
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const translatedEventText = TIMELINE_DESC_TRANSLATIONS[r.last_event_text] || r.last_event_text;
                  
                  return (
                    <tr key={r.number} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 pr-4 font-mono">{r.number}</td>
                      <td className="py-2 pr-4"><StatusPill status={r.status} /></td>
                      <td className="py-2 pr-4 text-slate-600">{translatedEventText || "-"}</td>
                      <td className="py-2 pr-4 text-slate-500">{formatDate(r.last_event_at)}</td>
                      <td className="py-2 pr-4 text-slate-500">{r.source || "-"}</td>
                    </tr>
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