import React, { useState } from "react";
import TrackingStatus from "../../components/DashBoard/TrackingStatus";
import CustomsPredictor from "../../components/DashBoard/CustomsPredictor";
import AdminShipments from "../../components/Admin/AdminShipments";

function CustomsMain({ activeTab: controlledActiveTab, onTabChange, showInternalTabs = true, trackingProps }) {
  const [internalActiveTab, setInternalActiveTab] = useState("tracking");
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const setActiveTab = onTabChange ?? setInternalActiveTab;

  const tabs = [
    { id: "tracking", label: "운송장 조회", component: TrackingStatus },
    { id: "predictor", label: "통관 예측", component: CustomsPredictor },
    { id: "shipments", label: "배송 관리", component: AdminShipments },
  ];

  const ActiveComponent = tabs.find((tab) => tab.id === activeTab)?.component || TrackingStatus;

  return (
    <div className="space-y-6">
      {/* 내부 서브탭 (헤더에서 제어 중일 때 숨김) */}
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

      {/* 콘텐츠 영역 */}
      {activeTab === "tracking" ? (
        <ActiveComponent {...(trackingProps || {})} />
      ) : (
        <ActiveComponent />
      )}
    </div>
  );
}

export default CustomsMain;
