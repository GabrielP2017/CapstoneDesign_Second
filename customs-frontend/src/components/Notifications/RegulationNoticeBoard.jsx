import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  ExternalLink,
  Filter,
  Loader2,
  Newspaper,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  getRegulationNotices,
  refreshRegulationNotices,
} from "../../lib/api";

const riskStyles = {
  INFO: "bg-slate-100 text-slate-600 dark:bg-slate-800/70 dark:text-slate-300",
  WATCH: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  ALERT: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
};

const riskIcon = {
  INFO: Newspaper,
  WATCH: BellRing,
  ALERT: AlertTriangle,
};

const formatDateTime = (iso) => {
  try {
    return new Date(iso).toLocaleString("ko-KR");
  } catch (error) {
    return iso;
  }
};

const prettySource = (notice) =>
  `${notice.source_name || notice.source}`.trim();

const isAbsoluteUrl = (url = "") => /^https?:\/\//i.test(url);

const buildNoticeUrl = (url = "") => {
  if (!url) return "#";
  if (isAbsoluteUrl(url)) return url;
  // 상대 경로 사용 (nginx에서 /api로 리다이렉트)
  const separator = url.startsWith("/") ? "" : "/";
  return `${separator}${url}`;
};

function RegulationNoticeBoard() {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ category: "", source: "" });
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadNotices() {
      setLoading(true);
      try {
        const payload = await getRegulationNotices(
          {
            limit: 40,
            category: filters.category || undefined,
            source: filters.source || undefined,
          },
          controller.signal
        );
        const nextNotices = payload || [];
        setNotices(nextNotices);
        setError(null);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("regulationNoticesUpdated", { detail: nextNotices })
          );
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        setError(err.message || "공지 목록을 가져오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }
    loadNotices();
    return () => controller.abort();
  }, [filters, reloadKey]);

  const categories = useMemo(() => {
    const all = new Set();
    notices.forEach((notice) => {
      if (notice.category) all.add(notice.category);
      (notice.tags || []).forEach((tag) => all.add(tag));
    });
    return Array.from(all);
  }, [notices]);

  const sourceOptions = useMemo(() => {
    const map = new Map();
    notices.forEach((notice) => {
      if (!notice.source) return;
      if (!map.has(notice.source)) {
        map.set(notice.source, prettySource(notice));
      }
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [notices]);

  const filtered = useMemo(() => {
    return notices.filter((notice) => {
      const matchSearch =
        notice.title?.toLowerCase().includes(search.toLowerCase()) ||
        notice.summary?.toLowerCase().includes(search.toLowerCase());
      return matchSearch;
    });
  }, [notices, search]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshRegulationNotices();
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      console.warn("Failed to refresh notices", err);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            관세/통관 공지 게시판
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            관세청·기재부·korea.kr 공지를 실시간으로 모아 보여줍니다.
          </p>
        </div>
        <button
          onClick={handleManualRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          새 공지 불러오기
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[220px] relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="제목/내용 검색"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Filter className="w-4 h-4" />
          필터
        </div>
        <select
          value={filters.category}
          onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}
          className="min-w-[160px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="">전체 카테고리</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <select
          value={filters.source}
          onChange={(e) => setFilters((prev) => ({ ...prev, source: e.target.value }))}
          className="min-w-[160px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="">전체 출처</option>
          {sourceOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200/60 dark:border-slate-700/60 rounded-2xl p-4 backdrop-blur">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-500 dark:text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            불러오는 중입니다...
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-500 dark:text-red-300">
            <p>{error}</p>
            <button
              onClick={() => setReloadKey((prev) => prev + 1)}
              className="mt-3 text-sm text-blue-600 hover:underline"
            >
              다시 시도
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            표시할 공지가 없습니다.
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((notice) => {
              const Icon = riskIcon[notice.risk_level] || Newspaper;
              const officialLink = buildNoticeUrl(notice.official_url || notice.url);
              return (
                <li
                  key={notice.id}
                  className="p-4 rounded-2xl border border-slate-200/70 dark:border-slate-700/70 hover:border-blue-200 dark:hover:border-blue-600 transition-colors bg-white dark:bg-slate-900"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-[240px]">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${riskStyles[notice.risk_level] || riskStyles.INFO}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {notice.category}
                        </span>
                        {notice.is_fallback && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-200">
                            내부 안내
                          </span>
                        )}
                        {notice.tags?.map((tag) => (
                          <span
                            key={tag}
                            className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-200"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 text-base font-semibold text-slate-900 dark:text-white">
                        {notice.title}
                      </p>
                      {notice.summary && (
                        <p
                          className="mt-1 text-sm text-slate-600 dark:text-slate-300 overflow-hidden text-ellipsis"
                          style={{
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {notice.summary}
                        </p>
                      )}
                    </div>
                    <div className="text-right space-y-1">
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {prettySource(notice)}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {formatDateTime(notice.published_at)}
                      </p>
                      {officialLink && (
                        <div className="flex flex-col items-end gap-2">
                          <a
                            href={officialLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-500 dark:text-blue-300"
                          >
                            공식 링크
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default RegulationNoticeBoard;
