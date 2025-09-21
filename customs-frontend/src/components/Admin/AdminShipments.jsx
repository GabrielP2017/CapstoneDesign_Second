import React, { useEffect, useState } from "react";
import { adminSeedSample10, adminFetch17track10, adminListTrackings, adminRegister17track10 } from "../../lib/api";
import { Loader2 } from "lucide-react";

// ✅ 환경변수: true면 활성, 그 외(false/미설정) 비활성
const ENABLE_REGISTER_10 = (import.meta.env?.VITE_ENABLE_REGISTER_10 ?? "false").toString().toLowerCase() === "true";

export default function AdminShipments() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminListTrackings();
      setRows(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onRegister17 = async () => {
    if (!ENABLE_REGISTER_10) return; // 안전장치
    setLoading(true);
    try {
      await adminRegister17track10();
      await load();
    } finally {
      setLoading(false);
    }
  };

  const onSeed = async () => {
    setLoading(true);
    try {
      await adminSeedSample10();
      await load();
    } finally {
      setLoading(false);
    }
  };

  const onFetch = async () => {
    setLoading(true);
    try {
      await adminFetch17track10();
      await load();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {/* <button onClick={onSeed} className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:opacity-90">
          DB에 샘플 10개(NEW)
        </button> */}

        <button
          onClick={onFetch}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:opacity-90 disabled:opacity-50"
          disabled={loading}
        >
          17TRACK에서 화물정보 가져와 DB 반영
        </button>

        {loading && <Loader2 className="animate-spin ml-2" />}
      </div>

      <div className="bg-white/70 dark:bg-slate-800/50 rounded-2xl shadow p-4">
        <div className="font-semibold mb-3">DB 운송장 목록</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 pr-4">운송장번호</th>
                <th className="py-2 pr-4">상태</th>
                <th className="py-2 pr-4">최근 이벤트</th>
                <th className="py-2 pr-4">최근 시각</th>
                <th className="py-2 pr-4">소스</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.number} className="border-b border-slate-100 dark:border-slate-700/50">
                  <td className="py-2 pr-4 font-mono">{r.number}</td>
                  <td className="py-2 pr-4">{r.status}</td>
                  <td className="py-2 pr-4">{r.last_event_text || "-"}</td>
                  <td className="py-2 pr-4">{r.last_event_at ? new Date(r.last_event_at).toLocaleString() : "-"}</td>
                  <td className="py-2 pr-4">{r.source || "-"}</td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr>
                  <td className="py-6 text-slate-500" colSpan={5}>
                    데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
