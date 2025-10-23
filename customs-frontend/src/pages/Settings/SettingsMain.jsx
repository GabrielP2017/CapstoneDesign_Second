import React, { useState } from "react";
import { User, Bell, Shield, Globe, Palette, Database } from "lucide-react";

function SettingsMain() {
  const [activeTab, setActiveTab] = useState("profile");

  const tabs = [
    { id: "profile", label: "프로필", icon: User },
    { id: "notifications", label: "알림 설정", icon: Bell },
    { id: "security", label: "보안", icon: Shield },
    { id: "language", label: "언어", icon: Globe },
    { id: "appearance", label: "테마", icon: Palette },
    { id: "data", label: "데이터", icon: Database },
  ];

  return (
    <div className="space-y-6">
      {/* 상단 탭 네비게이션 */}
      <div
        className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl 
      border-b border-slate-200/50 dark:border-slate-700/50"
      >
        <div className="px-6">
          <nav className="flex space-x-8 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors
                    flex items-center space-x-2 whitespace-nowrap
                    ${
                      activeTab === tab.id
                        ? "border-blue-500 text-blue-600 dark:text-blue-400"
                        : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* 임시 콘텐츠 */}
      <div
        className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl 
      rounded-2xl border border-slate-200/50 dark:border-slate-700/50 p-6"
      >
        <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-4">
          {tabs.find((t) => t.id === activeTab)?.label}
        </h2>
        <p className="text-slate-600 dark:text-slate-400">
          설정 페이지가 준비 중입니다.
        </p>
      </div>
    </div>
  );
}

export default SettingsMain;
