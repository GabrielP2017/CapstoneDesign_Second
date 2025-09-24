import React, { useEffect, useMemo, useState } from "react";
import { adminListTrackings, adminSyncFromFile } from "../../lib/api";

const Loader2 = (props) => (
  <svg {...props} viewBox="0 0 24 24" className={`animate-spin ${props.className || ""}`}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
    <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" fill="none" />
  </svg>
);

const StatusPill = ({ status }) => {
  const s = (status || "UNKNOWN").toUpperCase();
  const style = {
    CLEARED: "bg-emerald-100 text-emerald-700",
    IN_PROGRESS: "bg-indigo-100 text-indigo-700",
    DELAY: "bg-rose-100 text-rose-700",
    UNKNOWN: "bg-slate-100 text-slate-700",
  }[s] || "bg-slate-100 text-slate-700";

  const label = {
    CLEARED: "통관완료",
    IN_PROGRESS: "통관진행",
    DELAY: "지연/보류",
    UNKNOWN: "미확정",
  }[s] || s;

  return <span className={`px-2 py-1 rounded-full text-xs font-medium ${style}`}>{label}</span>;
};

function formatDate(v) {
  if (!v) return "-";
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleString(undefined, {
      year: "numeric",
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
  const [loading, setLoading] = useState(false);
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
    await load();
  };

  const onSync = async () => {
    setSyncResult(null);
    setError("");
    setLoading(true);
    try {
      // 파일 경로/배치 크기를 전달하고 싶으면 인자 사용: adminSyncFromFile({ path: "tracking_numbers.json", batch: 40 })
      const r = await adminSyncFromFile();
      setSyncResult(r);
      await load();
    } catch (e) {
      setError(e?.message || "동기화에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const isEmpty = useMemo(() => rows.length === 0, [rows]);

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
              동기화 중…
            </span>
          ) : (
            "17TRACK ↔ DB 동기화"
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

      {/* 에러/결과 표시 */}
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
              <div className="opacity-80">{syncResult.error || syncResult.raw || "알 수 없는 오류"}</div>
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
              {Array.isArray(syncResult.fetched_numbers) && syncResult.fetched_numbers.length > 0 && (
                <div className="opacity-80 mt-1">
                  처리됨: {syncResult.fetched_numbers.slice(0, 10).join(", ")}
                  {syncResult.fetched_numbers.length > 10 ? "…" : ""}
                </div>
              )}
              {Array.isArray(syncResult.skipped) && syncResult.skipped.length > 0 && (
                <div className="opacity-80 mt-1">
                  스킵: {syncResult.skipped.slice(0, 10).join(", ")}
                  {syncResult.skipped.length > 10 ? "…" : ""}
                </div>
              )}
              {syncResult.file && <div className="opacity-70 mt-1">사용된 파일: {syncResult.file}</div>}
            </>
          )}
        </div>
      )}

      <div className="bg-white/70 rounded-2xl shadow p-4">
        <div className="font-semibold mb-3">DB 운송장 목록</div>

        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 rounded-md bg-slate-100 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-200">
                  <th className="py-2 pr-4">운송장번호</th>
                  <th className="py-2 pr-4">상태</th>
                  <th className="py-2 pr-4">최근 이벤트</th>
                  <th className="py-2 pr-4">최근 시각</th>
                  <th className="py-2 pr-4">소스</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.number} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-mono">{r.number}</td>
                    <td className="py-2 pr-4"><StatusPill status={r.status} /></td>
                    <td className="py-2 pr-4">{r.last_event_text || "-"}</td>
                    <td className="py-2 pr-4">{formatDate(r.last_event_at)}</td>
                    <td className="py-2 pr-4">{r.source || "-"}</td>
                  </tr>
                ))}
                {isEmpty && (
                  <tr>
                    <td className="py-6 text-slate-500" colSpan={5}>
                      데이터가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
