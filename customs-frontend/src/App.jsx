import { useState, useEffect, useRef, useCallback } from "react";
import Sidebar from "./components/Layout/Sidebar";
import Header from "./components/Layout/Header";
import Dashboard from "./components/DashBoard/Dashboard";
import Overview from "./components/DashBoard/Overview";
import Reports from "./components/DashBoard/Reports";
import CustomsPredictor from "./components/DashBoard/CustomsPredictor";
import TrackingStatus from "./components/DashBoard/TrackingStatus";
import AdminShipments from "./components/Admin/AdminShipments";
import MainPage from "./components/MainPage/MainPage";
import CustomsMain from "./pages/Customs/CustomsMain";
import StatisticsMain from "./pages/Statistics/StatisticsMain";
import NotificationsMain from "./pages/Notifications/NotificationsMain";
import InquiriesMain from "./pages/Inquiries/InquiriesMain";
import SettingsMain from "./pages/Settings/SettingsMain";
import HelpMain from "./pages/Help/HelpMain";
import LightBg1 from "../img/Light1.jpg";
import LightBg2 from "../img/Light2.jpg";
import DarkBg1 from "../img/Dark1.jpg";
import DarkBg2 from "../img/Dark2.jpg";

const LIGHT_BACKGROUNDS = [LightBg1, LightBg2];
const DARK_BACKGROUNDS = [DarkBg1, DarkBg2];
const BG_ROTATION_MS = 4000;

function App() {
  const [sideBarCollapsed, setSideBarCollapsed] = useState(true);
  const [currentPage, setCurrentPage] = useState("mainpage");
  const [activeTab, setActiveTab] = useState(null);
  const [trackIntent, setTrackIntent] = useState({});
  const [trackTriggerId, setTrackTriggerId] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : false
  );
  const [bgIndex, setBgIndex] = useState(0);

  // Define sub-tab sets per category page
  const TAB_CONFIG = {
    customs: [
      { id: "tracking", label: "운송장 조회" },
      { id: "predictor", label: "통관 예측" },
      { id: "shipments", label: "배송 관리" },
    ],
    statistics: [
      { id: "overview", label: "통계 요약" },
      { id: "dashboard", label: "대시보드" },
      { id: "reports", label: "보고서" },
    ],
    notifications: [
      { id: "all", label: "전체 알림" },
      { id: "customs", label: "통관 알림" },
      { id: "system", label: "시스템 알림" },
    ],
    inquiries: [
      { id: "new", label: "새 문의" },
      { id: "ongoing", label: "진행중" },
      { id: "resolved", label: "해결됨" },
    ],
    settings: [
      { id: "profile", label: "프로필" },
      { id: "notifications", label: "알림 설정" },
      { id: "security", label: "보안" },
      { id: "language", label: "언어" },
      { id: "appearance", label: "모양" },
      { id: "data", label: "데이터" },
    ],
    help: [
      { id: "faq", label: "자주 묻는 질문" },
      { id: "guide", label: "사용 가이드" },
      { id: "contact", label: "문의하기" },
    ],
  };

  const currentTabs = TAB_CONFIG[currentPage] || [];

  // Reset sub-tab when page changes
  useEffect(() => {
    if (currentTabs.length > 0) {
      setActiveTab((prev) =>
        currentTabs.some((t) => t.id === prev) ? prev : currentTabs[0].id
      );
    } else {
      setActiveTab(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // 중복 호출 방지를 위한 ref
  const isNavigatingRef = useRef(false);

  // Handlers to navigate from MainPage to Customs > TrackingStatus
  const goSearch = useCallback((number) => {
    // 중복 호출 방지
    if (isNavigatingRef.current) {
      return;
    }

    isNavigatingRef.current = true;

    // 상태 업데이트를 한 번에 처리
    setCurrentPage("customs");
    setActiveTab("tracking");
    setTrackIntent({ initialNumber: number, autoLookup: true });
    setTrackTriggerId((x) => x + 1);

    // 짧은 딜레이 후 플래그 리셋 (애니메이션 완료 대기)
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 300);
  }, []);
  const goSample = () => {
    setCurrentPage("customs");
    setActiveTab("tracking");
    setTrackIntent({ autoSample: true });
    setTrackTriggerId((x) => x + 1);
  };
  const goIncomplete = () => {
    setCurrentPage("customs");
    setActiveTab("tracking");
    setTrackIntent({ autoIncomplete: true });
    setTrackTriggerId((x) => x + 1);
  };

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (currentPage !== "mainpage") {
      return;
    }
    setBgIndex(0);
    const id = setInterval(() => {
      const targetSet = isDarkMode ? DARK_BACKGROUNDS : LIGHT_BACKGROUNDS;
      setBgIndex((prev) => (prev + 1) % targetSet.length);
    }, BG_ROTATION_MS);
    return () => clearInterval(id);
  }, [currentPage, isDarkMode]);

  const activeBackgrounds = isDarkMode ? DARK_BACKGROUNDS : LIGHT_BACKGROUNDS;
  const showMainPageBackground = currentPage === "mainpage";

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 transition-all duration-500 overflow-hidden">
      {showMainPageBackground && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[820px] z-0 overflow-hidden">
          {activeBackgrounds.map((bg, idx) => (
            <div
              key={`${bg}-${idx}`}
              className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ${
                idx === bgIndex ? "opacity-100" : "opacity-0"
              }`}
              style={{ backgroundImage: `url(${bg})` }}
            />
          ))}
          <div className="absolute inset-0 bg-white/60 dark:bg-slate-950/65 backdrop-blur-[2px]" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-white/0 to-white dark:to-slate-950" />
        </div>
      )}

      <div className="relative z-10 flex h-screen">
        <Sidebar
          collapsed={sideBarCollapsed}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          onToggle={() => setSideBarCollapsed(!sideBarCollapsed)}
          onSearchHistoryClick={goSearch}
        />

        <div className="flex flex-col flex-1 overflow-hidden">
          <Header
            currentPage={currentPage}
            tabs={currentTabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onSearch={goSearch}
            onGoHome={() => {
              setCurrentPage("mainpage");
              setActiveTab(null);
            }}
            onOpenNotifications={() => {
              setCurrentPage("notifications");
              setActiveTab("customs");
            }}
          />

          {/* ▼▼▼ [수정된 부분] z-index를 추가하여 레이어 순서 조정 ▼▼▼ */}
          <main className="flex-1 overflow-y-auto bg-transparent relative z-20">
            <div className="p-6">
              {/* 페이지 콘텐츠 */}
              {currentPage === "mainpage" ? (
                <MainPage
                  onSearch={goSearch}
                  onSample={goSample}
                  onIncomplete={goIncomplete}
                />
              ) : (
                <div className="mx-auto w-full lg:w-[75%] px-4">
                  {currentPage === "customs" && (
                    <CustomsMain
                      showInternalTabs={false}
                      activeTab={activeTab}
                      onTabChange={setActiveTab}
                      trackingProps={{
                        ...trackIntent,
                        triggerId: trackTriggerId,
                      }}
                    />
                  )}
                  {currentPage === "statistics" && (
                    <StatisticsMain
                      showInternalTabs={false}
                      activeTab={activeTab}
                      onTabChange={setActiveTab}
                    />
                  )}
                  {currentPage === "notifications" && (
                    <NotificationsMain
                      showInternalTabs={false}
                      activeTab={activeTab}
                      onTabChange={setActiveTab}
                    />
                  )}
                  {currentPage === "inquiries" && (
                    <InquiriesMain
                      showInternalTabs={false}
                      activeTab={activeTab}
                      onTabChange={setActiveTab}
                    />
                  )}
                  {currentPage === "settings" && (
                    <SettingsMain
                      showInternalTabs={false}
                      activeTab={activeTab}
                      onTabChange={setActiveTab}
                    />
                  )}
                  {currentPage === "help" && (
                    <HelpMain
                      showInternalTabs={false}
                      activeTab={activeTab}
                      onTabChange={setActiveTab}
                    />
                  )}

                  {/* 기존 페이지들 (나중에 제거 예정) */}
                  {currentPage === "dashboard" && (
                    <Dashboard onTrackingNumberClick={goSearch} />
                  )}
                  {currentPage === "overview" && <Overview />}
                  {currentPage === "admin.shipments" && <AdminShipments />}
                  {currentPage === "myitems" && <TrackingStatus />}
                  {currentPage === "customs-predictor" && <CustomsPredictor />}
                  {currentPage === "reports" && <Reports />}
                </div>
              )}
            </div>
          </main>
          {/* ▲▲▲ [수정된 부분] 여기까지 ▲▲▲ */}
        </div>
      </div>
    </div>
  );
}

export default App;
