import React, { useState } from "react";
import ActivityFeed from "../../components/DashBoard/ActivityFeed";

function NotificationsMain() {
  const [activeTab, setActiveTab] = useState("all");

  const tabs = [
    { id: "all", label: "전체 알림" },
    { id: "customs", label: "통관 알림" },
    { id: "system", label: "시스템 알림" },
  ];

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
      <div
        className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl 
      rounded-2xl border border-slate-200/50 dark:border-slate-700/50 p-6"
      >
        <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-4">
          {tabs.find((t) => t.id === activeTab)?.label}
        </h2>
        <ActivityFeed />
      </div>
    </div>
  );
}

export default NotificationsMain;
