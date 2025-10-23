import React, { useState } from "react";
import Overview from "../../components/DashBoard/Overview";
import Dashboard from "../../components/DashBoard/Dashboard";
import Reports from "../../components/DashBoard/Reports";

function StatisticsMain() {
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { id: "overview", label: "통관 현황", component: Overview },
    { id: "dashboard", label: "대시보드", component: Dashboard },
    { id: "reports", label: "보고서", component: Reports },
  ];

  const ActiveComponent =
    tabs.find((tab) => tab.id === activeTab)?.component || Overview;

  return (
    <div className="space-y-6">
      {/* 상단 탭 네비게이션 */}
      <div
        className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl 
      border-b border-slate-200/50 dark:border-slate-700/50"
      >
        <div className="px-6">
          <nav className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${
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
      </div>

      {/* 컴포넌트 렌더링 */}
      <ActiveComponent />
    </div>
  );
}

export default StatisticsMain;
