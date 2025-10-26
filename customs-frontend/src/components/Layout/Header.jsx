import { Bell, Plus, Search, Sun, Moon, Settings, Menu } from "lucide-react";
import React, { useState, useEffect } from "react";
import TitleIcon from "../../../img/TitleIcon.png";
import TitleFont from "../../../img/TitleFont.png";

function Header({
  currentPage,
  onToggleSidebar,
  tabs = [],
  activeTab,
  onTabChange,
  onSearch,
  onGoHome,
}) {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedMode = localStorage.getItem("darkMode");
    if (savedMode !== null) return savedMode === "true";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

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

  const isMainPage = currentPage === "mainpage";
  const handleLogoClick = () => {
    if (typeof onGoHome === "function") {
      onGoHome();
    }
  };

  return (
    <div
      className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b
    border-slate-200/50 dark:border-slate-700/50 px-5 py-4 relative z-30"
    >
      {/* 왼쪽 상단 사이드바 토글 버튼 */}
      <button
        onClick={onToggleSidebar}
        aria-label="toggle-sidebar"
        className="absolute left-5 top-1/2 -translate-y-1/2 p-2.5 rounded-xl 
        text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 
        transition-colors z-40"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* 서브페이지 아이콘+타이틀: 햄버거 버튼과 같은 기준에 정렬(헤더 전체의 수직 중앙) */}
      {!isMainPage && (
        <div
          className="absolute top-1/2 -translate-y-1/2 left-[clamp(72px,6.5vw,116px)] flex items-center gap-[clamp(4px,1vw,10px)] cursor-pointer select-none z-30"
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

      {/* 상단 행은 항상 가운데 정렬(검색창 고정 중앙). 좌측/우측 요소는 absolute 배치 */}
      <div className="flex items-center justify-center relative z-10">
        {!isMainPage ? (
          /* 입력칸도 함께 스케일: 고정폭 대신 clamp로 자연스러운 축소 */
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
                className="w-full pl-12 pr-12 py-[clamp(10px,1.2vw,14px)] text-[clamp(14px,1.15vw,18px)] bg-slate-100 dark:bg-slate-800 border 
                  border-transparent focus:border-blue-500 rounded-xl text-slate-800
                  dark:text-white placeholder-slate-500 focus:outline-none focus:ring-1
                  focus:ring-blue-500 transition-all"
              />

              <button
                type="button"
                onClick={(e) => {
                  const el = e.currentTarget
                    .closest("div.relative")
                    ?.querySelector('input[name="header-tracking"]');
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
          // 메인페이지일 때: 타이틀만 (가운데 정렬)
          <div className="flex items-center space-x-2">
            <div className="w-14 h-14 flex items-center justify-center">
              <img
                src={TitleIcon}
                alt="brand-icon"
                className="w-13 h-13 object-contain"
              />
            </div>
            <div>
              <img
                src={TitleFont}
                alt="WhyRight"
                className="h-10 sm:h-12 md:h-14 lg:h-16 object-contain"
              />
            </div>
          </div>
        )}

        {/* 우측 버튼들 - 절대 위치 */}
        <div className="absolute right-0 flex items-center space-x-3">
          <button
            className="hidden lg:flex items-center space-x-2 py-2 px-4 bg-gradient-to-r
          from-blue-500 to-purple-600 text-white rounded-xl hover:shadow-lg transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">생성</span>
          </button>

          <button
            onClick={toggleDarkMode}
            className="p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {isDarkMode ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </button>

          <button className="relative p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900">
              3
            </span>
          </button>

          <button className="p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Sub-tabs row under the title/search */}
      {!isMainPage && Array.isArray(tabs) && tabs.length > 0 && (
        <div className="mt-4 flex justify-center">
          <nav
            className="flex space-x-6 overflow-x-auto"
            aria-label="sub-navigation"
          >
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
