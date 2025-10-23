import { useState } from "react";
import Sidebar from "./components/Layout/Sidebar";
import Header from "./components/Layout/Header";
import Dashboard from "./components/DashBoard/Dashboard";
import Overview from "./components/DashBoard/Overview";
import Reports from "./components/DashBoard/Reports";
import Insights from "./components/DashBoard/CustomsPredictor";
import AdminShipments from "./components/Admin/AdminShipments";
import MainPage from "./components/MainPage/MainPage";
import CustomsMain from "./pages/Customs/CustomsMain";
import StatisticsMain from "./pages/Statistics/StatisticsMain";
import NotificationsMain from "./pages/Notifications/NotificationsMain";
import InquiriesMain from "./pages/Inquiries/InquiriesMain";
import SettingsMain from "./pages/Settings/SettingsMain";
import HelpMain from "./pages/Help/HelpMain";

function App() {
  const [sideBarCollapsed, setSideBarCollapsed] = useState(true);
  const [currentPage, setCurrentPage] = useState("mainpage");

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 
      dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 transition-all duration-500"
    >
      <div className="flex flex-col h-screen">
        <Header
          currentPage={currentPage}
          onToggleSidebar={() => setSideBarCollapsed(!sideBarCollapsed)}
        />

        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            collapsed={sideBarCollapsed}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onToggle={() => setSideBarCollapsed(!sideBarCollapsed)}
          />

          {/* ▼▼▼ [수정된 부분] z-index를 추가하여 레이어 순서 조정 ▼▼▼ */}
          <main className="flex-1 overflow-y-auto bg-transparent relative z-20">
            <div className="p-6">
              {/* 페이지 콘텐츠 */}
              {currentPage === "mainpage" && <MainPage />}
              {currentPage === "customs" && <CustomsMain />}
              {currentPage === "statistics" && <StatisticsMain />}
              {currentPage === "notifications" && <NotificationsMain />}
              {currentPage === "inquiries" && <InquiriesMain />}
              {currentPage === "settings" && <SettingsMain />}
              {currentPage === "help" && <HelpMain />}

              {/* 기존 페이지들 (나중에 제거 예정) */}
              {currentPage === "dashboard" && <Dashboard />}
              {currentPage === "overview" && <Overview />}
              {currentPage === "admin.shipments" && <AdminShipments />}
              {currentPage === "myitems" && <TrackingStatus />}
              {currentPage === "customs-predictor" && <CustomsPredictor />}
              {currentPage === "reports" && <Reports />}
            </div>
          </main>
          {/* ▲▲▲ [수정된 부분] 여기까지 ▲▲▲ */}
        </div>
      </div>
    </div>
  );
}

export default App;
