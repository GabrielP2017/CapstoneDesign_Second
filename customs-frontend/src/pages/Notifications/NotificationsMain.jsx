import React, { useMemo, useState } from "react";
import ActivityFeed from "../../components/DashBoard/ActivityFeed";
import RegulationNoticeBoard from "../../components/Notifications/RegulationNoticeBoard";

function NotificationsMain({
  activeTab: controlledActiveTab,
  onTabChange,
  showInternalTabs = true,
}) {
  const [internalActiveTab, setInternalActiveTab] = useState("all");
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const setActiveTab = onTabChange ?? setInternalActiveTab;

  const tabs = [
    { id: "all", label: "전체 알림" },
    { id: "customs", label: "통관 공지" },
    { id: "system", label: "시스템 알림" },
  ];

  const content = useMemo(() => {
    switch (activeTab) {
      case "customs":
        return <RegulationNoticeBoard />;
      case "system":
        return <ActivityFeed />;
      case "all":
      default:
        return <ActivityFeed />;
    }
  }, [activeTab]);

  return (
    <div className="space-y-6">
      <div
        style={{ display: showInternalTabs ? undefined : "none" }}
        className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-700/50"
      >
        <div className="px-6">
          <nav className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
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

      <div className="bg-transparent">{content}</div>
    </div>
  );
}

export default NotificationsMain;
