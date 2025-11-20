import React, { useState, useMemo, useEffect, useRef } from "react";
import PIcon from "../../../img/p.png";
import {
  BarChart3,
  Calendar,
  ChevronDown,
  CreditCard,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Package,
  Settings,
  ShoppingBag,
  Users,
  Menu,
  X,
  Bell,
  HelpCircle,
  Grid3X3,
  Layers,
  Zap,
  X as XIcon,
} from "lucide-react";
import { getSearchHistory, removeSearchHistory, getStatusColorClass } from "../../lib/searchHistory";
import { getRecentEvents } from "../../lib/api";

// 3x3 카테고리 정의
const categories = [
  { id: "customs", name: "통관", icon: Package },
  { id: "statistics", name: "통계", icon: BarChart3 },
  { id: "notifications", name: "알림", icon: Bell },
  { id: "inquiries", name: "문의", icon: MessageSquare },
  { id: "settings", name: "설정", icon: Settings },
  { id: "help", name: "도움말", icon: HelpCircle },
  { id: "dummy1", name: "더미1", icon: Grid3X3 },
  { id: "dummy2", name: "더미2", icon: Layers },
  { id: "dummy3", name: "더미3", icon: Zap },
];

// (menuItems, submenuParentMap 코드는 이전과 동일하여 생략)
const menuItems = [
  {
    id: "dashboard",
    icon: LayoutDashboard,
    label: "대쉬보드",
    active: true,
    badge: "New",
  },
  {
    id: "admin",
    icon: Settings,
    label: "관리자",
    submenu: [{ id: "admin.shipments", label: "화물관리" }],
  },
  { id: "myitems", icon: Package, label: "내 물품" },
  {
    id: "analytics",
    icon: BarChart3,
    label: "통계",
    submenu: [
      { id: "overview", label: "Overview" },
      { id: "insights", label: "Insights" },
    ],
  },
  {
    id: "users",
    icon: Users,
    label: "사용자",
    count: "2.4k",
    submenu: [
      { id: "all-users", label: "모든 사용자 관리" },
      { id: "roles", label: "Roles & Permissions" },
      { id: "activity", label: "사용자 활동 조회" },
    ],
  },
  {
    id: "ecommerce",
    icon: ShoppingBag,
    label: "거래",
    submenu: [
      { id: "products", label: "상품 조회" },
      { id: "orders", label: "주문 조회" },
      { id: "customers", label: "고객 정보 조회" },
    ],
  },
  { id: "inventory", icon: Package, label: "내 물품 확인", count: "847" },
  { id: "transactions", icon: CreditCard, label: "결제 수단" },
  { id: "messages", icon: MessageSquare, label: "알림", badge: "12" },
  { id: "calendar", icon: Calendar, label: "일정" },
  { id: "reports", icon: FileText, label: "문의" },
  { id: "settings", icon: Settings, label: "설정" },
];

const submenuParentMap = new Map();
menuItems.forEach((item) => {
  if (item.submenu) {
    item.submenu.forEach((subitem) => {
      submenuParentMap.set(subitem.id, item.id);
    });
  }
});

function Sidebar({ collapsed, currentPage, onPageChange, onToggle, onSearchHistoryClick }) {
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [openPopup, setOpenPopup] = useState(null);
  const sidebarRef = useRef(null);
  const [searchHistory, setSearchHistory] = useState([]);
  const [recentEvents, setRecentEvents] = useState([]);
  const activityFeedIntervalRef = useRef(null);
  const activityFeedAbortControllerRef = useRef(null);

  const activePopupItem = useMemo(() => {
    if (!openPopup || !collapsed) return null;
    return menuItems.find((item) => item.id === openPopup.id);
  }, [openPopup, collapsed]);

  // 사이드바 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        !collapsed &&
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target)
      ) {
        // 사이드바 토글 버튼 클릭은 제외
        if (!event.target.closest('button[aria-label="toggle-sidebar"]')) {
          onToggle();
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [collapsed, onToggle]);

  // 검색 기록 불러오기 및 업데이트
  useEffect(() => {
    const loadHistory = () => {
      const history = getSearchHistory();
      setSearchHistory(history);
    };

    loadHistory();

    // storage 이벤트 리스너 추가 (다른 탭에서 변경 시 동기화)
    const handleStorageChange = (e) => {
      if (e.key === 'tracking_search_history') {
        loadHistory();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // 커스텀 이벤트 리스너 추가 (같은 탭에서 변경 시)
    const handleCustomStorageChange = () => {
      loadHistory();
    };
    window.addEventListener('searchHistoryUpdated', handleCustomStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('searchHistoryUpdated', handleCustomStorageChange);
    };
  }, []);

  // 활동 피드 데이터 가져오기
  useEffect(() => {
    const fetchActivityFeed = async (signal) => {
      try {
        const data = await getRecentEvents(5, signal); // 사이드바에는 최근 5개만 표시
        setRecentEvents(data);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('활동 피드 데이터 가져오기 실패:', err);
        }
      }
    };

    // 초기 로드
    activityFeedAbortControllerRef.current = new AbortController();
    fetchActivityFeed(activityFeedAbortControllerRef.current.signal);

    // 30초마다 자동 갱신
    activityFeedIntervalRef.current = setInterval(() => {
      activityFeedAbortControllerRef.current = new AbortController();
      fetchActivityFeed(activityFeedAbortControllerRef.current.signal);
    }, 30000);

    return () => {
      if (activityFeedIntervalRef.current) {
        clearInterval(activityFeedIntervalRef.current);
      }
      if (activityFeedAbortControllerRef.current) {
        activityFeedAbortControllerRef.current.abort();
      }
    };
  }, []);

  // 상태별 색상 매핑
  const getEventColor = (stage) => {
    switch (stage) {
      case 'CLEARED':
        return 'bg-green-500';
      case 'IN_PROGRESS':
        return 'bg-blue-500';
      case 'DELAY':
        return 'bg-amber-500';
      default:
        return 'bg-slate-500';
    }
  };

  // 검색 기록 항목 클릭 핸들러
  const handleHistoryClick = (trackingNumber) => {
    if (onSearchHistoryClick) {
      onSearchHistoryClick(trackingNumber);
    } else if (onPageChange) {
      // 폴백: 통관 페이지로 이동
      onPageChange('customs');
    }
  };

  // 검색 기록 삭제 핸들러
  const handleRemoveHistory = (e, trackingNumber) => {
    e.stopPropagation();
    removeSearchHistory(trackingNumber);
    setSearchHistory(getSearchHistory());
    // 커스텀 이벤트 발생시켜 다른 컴포넌트에 알림
    window.dispatchEvent(new Event('searchHistoryUpdated'));
  };

  return (
    <div className="relative h-full" ref={sidebarRef}>
      <div
        className={`${
          collapsed ? "w-18" : "w-80"
        } h-full transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]`}
      >
        <div
          className={`relative z-50 w-full h-full flex flex-col
                         bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl
                         border-r border-slate-200/70 dark:border-slate-700
                         shadow-2xl`}
        >
          {/* 펼친 상태 유저 정보 카드 */}
          {!collapsed && (
            <div className="p-4 border-b border-slate-300/70 dark:border-slate-700/50">
              <div className="flex items-center space-x-3 rounded-xl">
                <img
                  src={PIcon}
                  alt="user"
                  className="w-10 h-10 rounded-full ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 ring-blue-500"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-white truncate">
                    User
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    WhyRight
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 3x3 카테고리 그리드 - 펼쳤을 때만 표시 */}
          {!collapsed && (
            <div className="p-4 pt-6 border-b border-slate-300/70 dark:border-slate-700/50">
              <div className="grid grid-cols-3 gap-2">
                {categories.map((category) => {
                  const Icon = category.icon;
                  return (
                    <button
                      key={category.id}
                      onClick={() => onPageChange(category.id)}
                      className={`aspect-square rounded-lg flex flex-col items-center justify-center
                      hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-all p-3 ${
                        currentPage === category.id
                          ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <Icon className="w-6 h-6 mb-1" />
                      <span className="text-xs font-medium">
                        {category.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 접혔을 때 - 기존 스타일 메뉴 */}
          {collapsed && (
            <div className="flex-1 flex flex-col">
              <div className="p-4 border-b border-slate-300/70 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={onToggle}
                  aria-label="toggle-sidebar"
                  className="w-full flex items-center justify-center py-2.5 rounded-xl
                  bg-slate-100/80 dark:bg-slate-800/70 text-slate-700 dark:text-slate-100
                  hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <Menu className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1">
                <nav className="p-4 space-y-4">
                  {categories.slice(0, 6).map((category) => {
                    const Icon = category.icon;
                    const isActive = currentPage === category.id;
                    return (
                      <button
                        key={category.id}
                        onClick={() => onPageChange(category.id)}
                        className={`relative w-full flex items-center justify-center py-2.5 px-2.5 rounded-xl transition-colors duration-200 group
                          ${
                            isActive
                              ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25"
                              : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50"
                          }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="pointer-events-none absolute left-full ml-3 px-4 py-1.5 rounded-xl text-sm font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 shadow-lg border border-slate-300/70 dark:border-slate-700/60 whitespace-nowrap opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
                          {category.name}
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>
          )}

          {/* 추가 정보 섹션 - 펼쳤을 때만 표시 */}
          {!collapsed && (
            <div className="flex-1 overflow-y-auto py-4 px-4 space-y-4">
              {/* 최근 검색기록 */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    최근 검색기록
                  </h3>
                  {searchHistory.length > 0 && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {searchHistory.length}개
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {searchHistory.length > 0 ? (
                    searchHistory.map((item, index) => (
                      <div
                        key={`${item.trackingNumber}-${index}`}
                        onClick={() => handleHistoryClick(item.trackingNumber)}
                        className="flex items-center justify-between text-xs group cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg px-2 py-1.5 transition-colors"
                      >
                        <span className="text-slate-600 dark:text-slate-400 truncate flex-1 mr-2">
                          {item.trackingNumber}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={getStatusColorClass(item.status)}>
                            {item.statusLabel}
                          </span>
                          <button
                            onClick={(e) => handleRemoveHistory(e, item.trackingNumber)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-slate-200 dark:hover:bg-slate-600 rounded"
                            aria-label="삭제"
                          >
                            <XIcon className="w-3 h-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-slate-400 dark:text-slate-500 text-center py-2">
                      검색 기록이 없습니다
                    </div>
                  )}
                </div>
              </div>

              {/* 활동 피드 */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                  활동 피드
                </h3>
                <div className="space-y-3">
                  {recentEvents.length > 0 ? (
                    recentEvents.map((event) => (
                      <div
                        key={event.id}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (onSearchHistoryClick && event.tracking_number) {
                            onSearchHistoryClick(event.tracking_number);
                          }
                        }}
                        className="flex items-start space-x-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg p-1.5 -m-1.5 transition-colors"
                      >
                        <div className={`w-2 h-2 rounded-full ${getEventColor(event.stage)} mt-1.5 flex-shrink-0`}></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                            {event.description || event.title}
                          </p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-slate-500">{event.time}</span>
                            {event.tracking_number && (
                              <span className="text-xs font-mono text-blue-600 dark:text-blue-400 ml-2 truncate">
                                {event.tracking_number}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-slate-400 dark:text-slate-500 text-center py-2">
                      활동 피드가 비어있습니다
                    </div>
                  )}
                </div>
              </div>

              {/* 통관 상태별 건수 */}
              {/* <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                  통관 상태별 건수
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        통관완료
                      </span>
                    </div>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      58
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        검사중
                      </span>
                    </div>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      12
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        접수완료
                      </span>
                    </div>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      24
                    </span>
                  </div>
                </div>
              </div> */}
            </div>
          )}

          {/* 기존 메뉴는 숨김 처리 (나중에 카테고리별 하위 페이지로 사용 가능) */}
          <div className="flex-1" style={{ display: "none" }}>
            <nav className="p-4 space-y-2">
              {menuItems.map((item, index) => {
                const parentOfCurrentPage = submenuParentMap.get(currentPage);
                const isActive =
                  currentPage === item.id || parentOfCurrentPage === item.id;
                const isPopupActive = collapsed && openPopup?.id === item.id;

                const activeStyle =
                  "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25";
                const popupActiveStyle =
                  "bg-blue-100 dark:bg-slate-700/50 text-blue-600 dark:text-blue-400";
                const defaultStyle =
                  "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50";

                return (
                  <React.Fragment key={item.id}>
                    <button
                      className={`w-full flex items-center p-3 rounded-xl transition-colors duration-200 ${
                        collapsed ? "justify-center" : ""
                      } ${
                        isActive
                          ? activeStyle
                          : isPopupActive
                          ? popupActiveStyle
                          : defaultStyle
                      }`}
                      onClick={() => {
                        if (collapsed) {
                          if (item.submenu) {
                            openPopup?.id === item.id
                              ? setOpenPopup(null)
                              : setOpenPopup({ id: item.id, index });
                          } else {
                            setOpenPopup(null);
                            onPageChange(item.id);
                          }
                        } else {
                          if (item.submenu) {
                            setExpandedItemId((prevId) =>
                              prevId === item.id ? null : item.id
                            );
                          } else {
                            setExpandedItemId(null);
                            onPageChange(item.id);
                          }
                        }
                      }}
                    >
                      {/* ▼▼▼ [수정됨] 아이콘과 나머지 컨텐츠를 분리하여 레이아웃을 확실하게 제어합니다. ▼▼▼ */}
                      <item.icon className="w-5 h-5 shrink-0" />

                      {/* 글자, 뱃지, 화살표를 포함하는 컨테이너 */}
                      <div
                        className={`flex items-center justify-between overflow-hidden transition-all duration-200 ${
                          collapsed ? "w-0 opacity-0" : "flex-1 ml-3"
                        }`}
                      >
                        <div className="flex items-center space-x-2 whitespace-nowrap">
                          <span className="font-medium text-sm">
                            {item.label}
                          </span>
                          {item.badge && (
                            <span className="px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
                              {item.badge}
                            </span>
                          )}
                          {item.count && (
                            <span className="px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full">
                              {item.count}
                            </span>
                          )}
                        </div>
                        {item.submenu && (
                          <ChevronDown
                            className={`w-4 h-4 transition-transform ${
                              expandedItemId === item.id ? "rotate-180" : ""
                            }`}
                          />
                        )}
                      </div>
                    </button>

                    <div
                      className={`transition-all duration-300 ease-in-out overflow-hidden ${
                        expandedItemId === item.id && !collapsed
                          ? "max-h-96"
                          : "max-h-0"
                      }`}
                    >
                      <div className="ml-4 mt-2 space-y-1 border-l-2 border-slate-300 dark:border-slate-700">
                        {item.submenu?.map((subitem) => (
                          <button
                            key={subitem.id}
                            onClick={() => onPageChange(subitem.id)}
                            className={`w-full text-left ml-4 px-4 py-2 text-sm rounded-lg transition-all ${
                              currentPage === subitem.id
                                ? "text-blue-600 dark:text-blue-400 font-semibold"
                                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                            }`}
                          >
                            {subitem.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </nav>
          </div>

          {activePopupItem && (
            <div
              className="absolute left-full w-max bg-white dark:bg-slate-800 py-2 pr-2 pl-6 rounded-xl shadow-2xl border border-slate-300/70 dark:border-slate-700/50 z-50"
              style={{ top: `${openPopup.index * 52 + 16}px` }}
            >
              <p className="font-bold px-3 py-1 text-slate-800 dark:text-white">
                {activePopupItem.label}
              </p>
              {activePopupItem.submenu && (
                <div className="mt-1 pt-1 border-t border-slate-300 dark:border-slate-700">
                  {activePopupItem.submenu.map((subitem) => (
                    <button
                      key={subitem.id}
                      onClick={() => {
                        onPageChange(subitem.id);
                        setOpenPopup(null);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-all ${
                        currentPage === subitem.id
                          ? "text-blue-600 dark:text-blue-400 font-semibold"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      {subitem.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
