import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { userListTrackings } from "../../lib/api";
import { Clock4, Package, RefreshCw, AlertTriangle } from "lucide-react";

const statusBadge = (s) => {
  const base = "px-2 py-0.5 rounded-full text-xs font-semibold";
  if (s === "CLEARED") return <span className={`${base} bg-emerald-100 text-emerald-700`}>통관 완료</span>;
  if (s === "IN_PROGRESS") return <span className={`${base} bg-blue-100 text-blue-700`}>통관 진행</span>;
  if (s === "EXCEPTION") return <span className={`${base} bg-amber-100 text-amber-700`}>확인 필요</span>;
  return <span className={`${base} bg-slate-100 text-slate-700`}>미확인</span>;
};

// Abort 판단 유틸 (브라우저/런타임별 메시지 차이 방어)
const isAbort = (e) =>
  e?.name === "AbortError" ||
  e?.code === 20 || // 일부 브라우저에서 AbortError 코드
  /aborted|abort/i.test(e?.message || "");

export default function MyItems() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const abortRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");

    // 이전 in-flight 요청 중단
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const data = await userListTrackings(abortRef.current.signal);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      if (isAbort(e)) {
        // 개발모드/리렌더/수동 새로고침 중첩 등으로 중단된 요청은 조용히 무시
        return;
      }
      setErr(e?.message || "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  // 최초 로드 + 20초마다 자동 새로고침
  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => {
      clearInterval(id);
      abortRef.current?.abort(); // 언마운트 시 남은 요청 정리
    };
  }, [load]);

  // 최신순(백엔드도 최신순이지만 방어겸)
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => (b.last_event_at || "").localeCompare(a.last_event_at || ""));
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-lg">내 물품 (최근목록)</div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 text-white hover:opacity-90 disabled:opacity-60"
          disabled={loading}
          title="새로고침"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          새로고침
        </button>
      </div>

      {err && (
        <div className="flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          <AlertTriangle size={16} />
          <span className="text-sm">{err}</span>
        </div>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sorted.map((r) => (
          <div key={r.number} className="bg-white/70 dark:bg-slate-800/50 rounded-2xl shadow p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Package className="opacity-70" size={18} />
                <span className="font-mono font-semibold">{r.number}</span>
              </div>
              {statusBadge(r.status)}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-300">{r.last_event_text || "최근 이벤트 없음"}</div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <Clock4 size={14} />
              {r.last_event_at ? new Date(r.last_event_at).toLocaleString() : "시각 정보 없음"}
            </div>
          </div>
        ))}

        {!loading && sorted.length === 0 && (
          <div className="text-slate-500">표시할 물품이 없습니다. (관리자에서 등록/가져오기 실행 후 잠시 뒤 새로고침)</div>
        )}

        {loading && sorted.length === 0 && <div className="text-slate-400">불러오는 중…</div>}
      </div>
    </div>
  );
}
