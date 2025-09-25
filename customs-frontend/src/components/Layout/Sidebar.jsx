import React, { useState, useMemo } from "react";
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
  ChevronLeft,
} from "lucide-react";

const menuItems = [
    { id: "dashboard", icon: LayoutDashboard, label: "대쉬보드", active: true, badge: "New" },
    { id: "admin", icon: Settings, label: "관리자", submenu: [{ id: "admin.shipments", label: "화물관리" }] },
    { id: "myitems", icon: Package, label: "내 물품" },
    { id: "analytics", icon: BarChart3, label: "통계", submenu: [{ id: "overview", label: "Overview" }, { id: "insights", label: "Insights" }] },
    { id: "users", icon: Users, label: "사용자", count: "2.4k", submenu: [{ id: "all-users", label: "모든 사용자 관리" }, { id: "roles", label: "Roles & Permissions" }, { id: "activity", label: "사용자 활동 조회" }] },
    { id: "ecommerce", icon: ShoppingBag, label: "거래", submenu: [{ id: "products", label: "상품 조회" }, { id: "orders", label: "주문 조회" }, { id: "customers", label: "고객 정보 조회" }] },
    { id: "inventory", icon: Package, label: "내 물품 확인", count: "847" },
    { id: "transactions", icon: CreditCard, label: "결제 수단" },
    { id: "messages", icon: MessageSquare, label: "알림", badge: "12" },
    { id: "calendar", icon: Calendar, label: "일정" },
    { id: "reports", icon: FileText, label: "문의" },
    { id: "settings", icon: Settings, label: "설정" },
  ];

const submenuParentMap = new Map();
menuItems.forEach(item => {
  if (item.submenu) {
    item.submenu.forEach(subitem => {
      submenuParentMap.set(subitem.id, item.id);
    });
  }
});

function Sidebar({ collapsed, currentPage, onPageChange, onToggle }) {
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const [openPopup, setOpenPopup] = useState(null); 

  const activePopupItem = useMemo(() => {
    if (!openPopup || !collapsed) return null;
    return menuItems.find(item => item.id === openPopup.id);
  }, [openPopup, collapsed]);

  return (
    <div
      className="relative h-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`${collapsed ? "w-20" : "w-72"} h-full transition-all duration-300 ease-in-out`}>
        <button 
          onClick={onToggle}
          className={`absolute top-1/2 left-full -translate-y-1/2 z-40 
                    w-12 h-90 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl
                    rounded-r-full shadow-lg
                    flex items-center justify-center
                    text-slate-500 dark:text-slate-400 
                    hover:text-blue-500 dark:hover:text-blue-400
                    focus:text-black dark:focus:text-white
                    transition-all duration-300 ease-in-out 
                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent 
                    focus:ring-black dark:focus:ring-white
                    group
                    ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          aria-label="Toggle sidebar"
        >
          <ChevronLeft className={`w-6 h-6 transition-transform duration-300 group-hover:scale-110 ${collapsed ? 'rotate-180' : ''}`} />
        </button>

        <div className={`relative z-50 w-full h-full flex flex-col
                         bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl
                         border-r border-slate-200 dark:border-slate-700
                         shadow-2xl`}>
          
          <div className="flex-1">
            <nav className="p-4 space-y-2">
              {menuItems.map((item, index) => {
                const parentOfCurrentPage = submenuParentMap.get(currentPage);
                const isActive = currentPage === item.id || parentOfCurrentPage === item.id;
                const isPopupActive = collapsed && openPopup?.id === item.id;
                
                const activeStyle = "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25";
                const popupActiveStyle = "bg-blue-100 dark:bg-slate-700/50 text-blue-600 dark:text-blue-400";
                const defaultStyle = "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50";

                return (
                  <React.Fragment key={item.id}>
                    <button
                      className={`w-full flex items-center p-3 rounded-xl transition-all duration-200 ${
                        collapsed ? 'justify-center' : 'justify-between'
                      } ${
                        isActive ? activeStyle : (isPopupActive ? popupActiveStyle : defaultStyle)
                      }`}
                      onClick={() => {
                        if (collapsed) {
                          if (item.submenu) {
                            openPopup?.id === item.id ? setOpenPopup(null) : setOpenPopup({ id: item.id, index });
                          } else {
                            setOpenPopup(null);
                            onPageChange(item.id);
                          }
                        } else {
                          if (item.submenu) {
                            setExpandedItemId(prevId => prevId === item.id ? null : item.id);
                          } else {
                            // ▼▼▼ [수정됨] 다른 메뉴 클릭 시 열려있던 아코디언 닫기 ▼▼▼
                            setExpandedItemId(null);
                            onPageChange(item.id);
                          }
                        }
                      }}
                    >
                      <div className="flex items-center space-x-3">
                        <item.icon className="w-5 h-5" />
                        {!collapsed && (
                          <>
                            <span className="font-medium text-sm">{item.label}</span>
                            {item.badge && <span className="px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">{item.badge}</span>}
                            {item.count && <span className="px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full">{item.count}</span>}
                          </>
                        )}
                      </div>
                      {!collapsed && item.submenu && <ChevronDown className={`w-4 h-4 transition-transform ${expandedItemId === item.id ? 'rotate-180' : ''}`} />}
                    </button>
                    
                    <div className={`transition-all duration-300 ease-in-out overflow-hidden ${expandedItemId === item.id && !collapsed ? 'max-h-96' : 'max-h-0'}`}>
                      <div className="ml-4 mt-2 space-y-1 border-l-2 border-slate-200 dark:border-slate-700">
                        {item.submenu?.map((subitem) => (
                          <button
                            key={subitem.id}
                            onClick={() => onPageChange(subitem.id)}
                            className={`w-full text-left ml-4 px-4 py-2 text-sm rounded-lg transition-all ${
                                currentPage === subitem.id
                                ? 'text-blue-600 dark:text-blue-400 font-semibold'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                          >
                            {subitem.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </React.Fragment>
                )
              })}
            </nav>
          </div>

          <div className="p-4 border-t border-slate-200/50 dark:border-slate-700/50">
            <div className={`${collapsed ? 'hidden' : 'flex'} items-center space-x-3 rounded-xl mt-2`}>
              <img
                src="https://mblogthumb-phinf.pstatic.net/MjAyMDAyMTBfODAg/MDAxNTgxMzA0MTE penthouse3833.ACRLtB9v5NH-I2qjWrwiXLb7TeUiG442cJmcdzVum7cg.eTLpNg_n0rAS5sWOsofRrvBy0qZk_QcWSfUiIagTfd8g.JPEG.lattepain/1581304118739.jpg?type=w800"
                alt="user"
                className="w-10 h-10 rounded-full ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 ring-blue-500"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-white truncate">차민욱</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">프론트엔드 총관리자 및 웹 디자이너</p>
              </div>
            </div>
          </div>

          {activePopupItem && (
            <div 
              className="absolute left-full w-max bg-white dark:bg-slate-800 py-2 pr-2 pl-6 rounded-xl shadow-2xl border border-slate-200/50 dark:border-slate-700/50 z-50"
              style={{ top: `${openPopup.index * 52 + 16}px` }}
            >
              <p className="font-bold px-3 py-1 text-slate-800 dark:text-white">{activePopupItem.label}</p>
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
                          ? 'text-blue-600 dark:text-blue-400 font-semibold'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
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