import React, { useState, useMemo, useEffect, useRef } from "react";
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
} from "lucide-react";

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

function Sidebar({ collapsed, currentPage, onPageChange, onToggle }) {
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [openPopup, setOpenPopup] = useState(null);
  const sidebarRef = useRef(null);

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

  return (
    <div className="relative h-full" ref={sidebarRef}>
      <div
        className={`${
          collapsed ? "w-20" : "w-80"
        } h-full transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]`}
      >
        <div
          className={`relative z-50 w-full h-full flex flex-col
                         bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl
                         border-r border-slate-200 dark:border-slate-700
                         shadow-2xl`}
        >
          {/* 3x3 카테고리 그리드 - 펼쳤을 때만 표시 */}
          {!collapsed && (
            <div className="p-4 pt-6 border-b border-slate-200/50 dark:border-slate-700/50">
              <div className="grid grid-cols-3 gap-2">
                {categories.map((category) => {
                  const Icon = category.icon;
                  return (
                    <button
                      key={category.id}
                      onClick={() => onPageChange(category.id)}
                      className={`aspect-square rounded-lg flex flex-col items-center justify-center
                      bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700
                      transition-all p-3 ${
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
            <div className="flex-1">
              <nav className="p-4 space-y-2">
                {categories.slice(0, 6).map((category) => {
                  const Icon = category.icon;
                  const isActive = currentPage === category.id;
                  return (
                    <button
                      key={category.id}
                      onClick={() => onPageChange(category.id)}
                      className={`w-full flex items-center justify-center p-3 rounded-xl transition-colors duration-200
                        ${
                          isActive
                            ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25"
                            : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50"
                        }`}
                    >
                      <Icon className="w-5 h-5" />
                    </button>
                  );
                })}
              </nav>
            </div>
          )}

          {/* 추가 정보 섹션 - 펼쳤을 때만 표시 */}
          {!collapsed && (
            <div className="flex-1 overflow-y-auto py-4 px-4 space-y-4">
              {/* 최근 주문내역 */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                  최근 주문내역
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-400">
                      TN240112345
                    </span>
                    <span className="text-green-500">통관완료</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-400">
                      TN240112346
                    </span>
                    <span className="text-yellow-500">검사중</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-400">
                      TN240112347
                    </span>
                    <span className="text-blue-500">접수완료</span>
                  </div>
                </div>
              </div>

              {/* 활동 피드 */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                  활동 피드
                </h3>
                <div className="space-y-3">
                  <div className="flex items-start space-x-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5"></div>
                    <div className="flex-1">
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        새로운 화물이 접수되었습니다
                      </p>
                      <span className="text-xs text-slate-500">2분 전</span>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5"></div>
                    <div className="flex-1">
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        통관 절차가 완료되었습니다
                      </p>
                      <span className="text-xs text-slate-500">1시간 전</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 통관 상태별 건수 */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
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
              </div>
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
                      <div className="ml-4 mt-2 space-y-1 border-l-2 border-slate-200 dark:border-slate-700">
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

          <div className="p-4 border-t border-slate-200/50 dark:border-slate-700/50">
            <div
              className={`transition-opacity duration-200 ${
                collapsed ? "opacity-0" : "opacity-100"
              }`}
            >
              <div className="flex items-center space-x-3 rounded-xl mt-2">
                <img
                  src="https://mblogthumb-phinf.pstatic.net/MjAyMDAyMTBfODAg/MDAxNTgxMzA0MTE penthouse3833.ACRLtB9v5NH-I2qjWrwiXLb7TeUiG442cJmcdzVum7cg.eTLpNg_n0rAS5sWOsofRrvBy0qZk_QcWSfUiIagTfd8g.JPEG.lattepain/1581304118739.jpg?type=w800"
                  alt="user"
                  className="w-10 h-10 rounded-full ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 ring-blue-500"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-white truncate">
                    차민욱
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    프론트엔드 총관리자 및 웹 디자이너
                  </p>
                </div>
              </div>
            </div>
          </div>

          {activePopupItem && (
            <div
              className="absolute left-full w-max bg-white dark:bg-slate-800 py-2 pr-2 pl-6 rounded-xl shadow-2xl border border-slate-200/50 dark:border-slate-700/50 z-50"
              style={{ top: `${openPopup.index * 52 + 16}px` }}
            >
              <p className="font-bold px-3 py-1 text-slate-800 dark:text-white">
                {activePopupItem.label}
              </p>
              {activePopupItem.submenu && (
                <div className="mt-1 pt-1 border-t border-slate-200 dark:border-slate-700">
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
