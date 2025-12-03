import {
  AlertTriangle,
  Bell,
  Loader2,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import TitleIcon from "../../../img/TitleIcon.png";
import TitleFont from "../../../img/TitleFont.png";
import { getRegulationNotices } from "../../lib/api";

const NOTICE_BADGES = {
  INFO: "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-200",
  WATCH: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  ALERT: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
};

const isAbsoluteUrl = (url = "") => /^https?:\/\//i.test(url);

const buildNoticeUrl = (url = "") => {
  if (!url) return "#";
  if (isAbsoluteUrl(url)) return url;
  // 상대 경로 사용 (nginx에서 /api로 리다이렉트)
  const separator = url.startsWith("/") ? "" : "/";
  return `${separator}${url}`;
};

const formatRelativeTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff < 60 * 1000) return "방금 전";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return date.toLocaleDateString("ko-KR");
};

function Header({
  currentPage,
  tabs = [],
  activeTab,
  onTabChange,
  onSearch,
  onGoHome,
  onOpenNotifications,
}) {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedMode = localStorage.getItem("darkMode");
    if (savedMode !== null) return savedMode === "true";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [showNoticePanel, setShowNoticePanel] = useState(false);
  const [noticeHighlights, setNoticeHighlights] = useState([]);
  const [noticeLoading, setNoticeLoading] = useState(false);
  const [noticeError, setNoticeError] = useState(null);
  const [noticeUpdatedAt, setNoticeUpdatedAt] = useState(null);
  const [noticeDataKey, setNoticeDataKey] = useState("");
  const [lastSeenNoticeKey, setLastSeenNoticeKey] = useState("");
  const [unreadNoticeCount, setUnreadNoticeCount] = useState(0);
  const noticeWrapperRef = useRef(null);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("darkMode", "true");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("darkMode", "false");
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode((prevMode) => !prevMode);

  const buildNoticeKey = useCallback((list) => {
    return (Array.isArray(list) ? list : [])
      .map((item) => item?.id || item?.title || item?.url || "")
      .join("|");
  }, []);

  const fetchNoticeHighlights = useCallback(async () => {
    setNoticeLoading(true);
    try {
      const data = await getRegulationNotices({ limit: 4 });
      const nextHighlights = Array.isArray(data) ? data : [];
      const nextKey = buildNoticeKey(nextHighlights);
      setNoticeHighlights(nextHighlights);
      setNoticeDataKey(nextKey);
      setNoticeError(null);
      setNoticeUpdatedAt(new Date());

      if (showNoticePanel) {
        setLastSeenNoticeKey(nextKey);
        setUnreadNoticeCount(0);
      } else {
        setUnreadNoticeCount(
          nextKey && nextKey !== lastSeenNoticeKey ? nextHighlights.length : 0
        );
      }
    } catch (error) {
      setNoticeError("통관 알림을 불러오지 못했습니다.");
    } finally {
      setNoticeLoading(false);
    }
  }, [buildNoticeKey, lastSeenNoticeKey, showNoticePanel]);

  useEffect(() => {
    fetchNoticeHighlights();
    const id = setInterval(fetchNoticeHighlights, 60000);
    return () => clearInterval(id);
  }, [fetchNoticeHighlights]);

  useEffect(() => {
    const handler = () => fetchNoticeHighlights();
    window.addEventListener("regulationNoticesUpdated", handler);
    return () => window.removeEventListener("regulationNoticesUpdated", handler);
  }, [fetchNoticeHighlights]);

  useEffect(() => {
    const handler = (event) => {
      if (!showNoticePanel) return;
      if (!noticeWrapperRef.current) return;
      if (noticeWrapperRef.current.contains(event.target)) return;
      setShowNoticePanel(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNoticePanel]);

  const isMainPage = currentPage === "mainpage";
  const handleLogoClick = () => {
    if (typeof onGoHome === "function") {
      onGoHome();
    }
  };

  const toggleNoticePanel = () => {
    setShowNoticePanel((prev) => {
      const next = !prev;
      if (next) {
        setLastSeenNoticeKey(noticeDataKey);
        setUnreadNoticeCount(0);
      }
      if (next && !noticeLoading) {
        fetchNoticeHighlights();
      }
      return next;
    });
  };

  return (
    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-700/50 px-5 py-4 relative z-30">
      {!isMainPage && (
        <div
          className="absolute top-1/2 -translate-y-1/2 left-[clamp(8px,2vw,32px)] flex items-center gap-[clamp(4px,1vw,10px)] cursor-pointer select-none z-30"
          aria-label="go-home"
          onClick={handleLogoClick}
        >
          <img
            src={TitleIcon}
            alt="brand-icon"
            className="w-[clamp(41px,5.8vw,58px)] h-[clamp(41px,5.8vw,58px)] object-contain"
          />
          <img
            src={TitleFont}
            alt="WhyRight"
            className="h-[clamp(36px,5.6vw,67px)] object-contain"
          />
        </div>
      )}

      <div className="flex items-center justify-center relative z-10">
        {!isMainPage ? (
          <div className="w-full max-w-[clamp(380px,56vw,640px)] px-[clamp(8px,2vw,0px)]">
            <div className="relative">
              <Search className="w-[clamp(16px,1.6vw,20px)] h-[clamp(16px,1.6vw,20px)] absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                name="header-tracking"
                type="text"
                placeholder="운송장 번호를 입력하세요"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const v = e.currentTarget.value.trim();
                    if (v && onSearch) {
                      onSearch(v);
                    }
                  }
                }}
                className="w-full pl-12 pr-12 py-[clamp(10px,1.2vw,14px)] text-[clamp(14px,1.15vw,18px)] bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-blue-500 rounded-xl text-slate-800 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              />

              <button
                type="button"
                onClick={(e) => {
                  const el = e.currentTarget.closest("div.relative")?.querySelector('input[name="header-tracking"]');
                  const v = el ? el.value.trim() : "";
                  if (v && onSearch) {
                    onSearch(v);
                  }
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <div className="w-14 h-14 flex items-center justify-center">
              <img src={TitleIcon} alt="brand-icon" className="w-13 h-13 object-contain" />
            </div>
            <div>
              <img src={TitleFont} alt="WhyRight" className="h-10 sm:h-12 md:h-14 lg:h-16 object-contain" />
            </div>
          </div>
        )}

        <div className="absolute right-0 flex items-center space-x-3">
          <button
            onClick={toggleDarkMode}
            className="p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <div className="relative" ref={noticeWrapperRef}>
            <button
              onClick={toggleNoticePanel}
              className="relative p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <Bell className="w-5 h-5" />
              {unreadNoticeCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900">
                  {unreadNoticeCount}
                </span>
              )}
            </button>
            {showNoticePanel && (
              <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-950/95 shadow-2xl p-4 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">최근 통관 공지</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {noticeUpdatedAt ? formatRelativeTime(noticeUpdatedAt) : "자동 갱신"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={fetchNoticeHighlights}
                      className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      <RefreshCw className={`w-4 h-4 ${noticeLoading ? "animate-spin" : ""}`} />
                    </button>
                    <button
                      onClick={() => setShowNoticePanel(false)}
                      className="p-1.5 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto space-y-3">
                  {noticeLoading ? (
                    <div className="flex items-center justify-center py-6 text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      불러오는 중...
                    </div>
                  ) : noticeError ? (
                    <p className="text-sm text-red-500">{noticeError}</p>
                  ) : noticeHighlights.length === 0 ? (
                    <p className="text-sm text-slate-500">표시할 공지가 없습니다.</p>
                  ) : (
                    noticeHighlights.map((notice) => {
                      const badgeClass = NOTICE_BADGES[notice.risk_level] || NOTICE_BADGES.INFO;
                      const officialLink = notice.official_url && buildNoticeUrl(notice.official_url);
                      const Icon = notice.risk_level === "ALERT" ? AlertTriangle : Bell;
                      return (
                        <div
                          key={notice.id}
                          className="p-3 rounded-xl border border-slate-200/60 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/60"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${badgeClass}`}>
                              <Icon className="w-3.5 h-3.5" />
                              {notice.category}
                            </span>
                            <span className="text-xs text-slate-400">
                              {formatRelativeTime(notice.published_at)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{notice.title}</p>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
                            <span>{notice.source_name || notice.source}</span>
                            <div className="flex items-center gap-2">
                          <a
                            href={buildNoticeUrl(notice.url)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:text-blue-400"
                          >
                                {notice.is_fallback ? "요약" : "원문"}
                              </a>
                              {officialLink && (
                                <a
                                  href={officialLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-emerald-600 hover:text-emerald-400"
                                >
                                  공식
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowNoticePanel(false);
                    if (typeof onOpenNotifications === "function") {
                      onOpenNotifications();
                    }
                  }}
                  className="w-full text-sm font-medium text-blue-600 hover:text-blue-500 bg-blue-50 dark:bg-blue-900/30 rounded-xl py-2"
                >
                  통관 알림 페이지로 이동
                </button>
              </div>
            )}
          </div>

          <button className="p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {!isMainPage && Array.isArray(tabs) && tabs.length > 0 && (
        <div className="mt-4 flex justify-center">
          <nav className="flex space-x-6 overflow-x-auto" aria-label="sub-navigation">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange && onTabChange(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}

export default Header;
