// src/components/DashBoard/ActivityFeed.jsx

import React, { useState, useEffect, useRef } from "react";
import {
  CheckCircle,
  Clock,
  Package,
  XCircle,
  Truck,
  Search,
  Filter,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { getRecentEvents } from "../../lib/api";
import { getPresets } from "../../lib/presets";

// 상태에 따른 아이콘 및 색상 매핑
const getStatusIcon = (stage) => {
  switch (stage) {
    case "CLEARED":
      return CheckCircle;
    case "IN_PROGRESS":
      return Truck;
    case "DELAY":
      return Package;
    default:
      return Package;
  }
};

const getStatusColor = (stage) => {
  switch (stage) {
    case "CLEARED":
      return {
        icon: "text-green-500",
        bg: "bg-green-50 dark:bg-green-900/20",
      };
    case "IN_PROGRESS":
      return {
        icon: "text-blue-500",
        bg: "bg-blue-50 dark:bg-blue-900/20",
      };
    case "DELAY":
      return {
        icon: "text-amber-500",
        bg: "bg-amber-50 dark:bg-amber-900/20",
      };
    default:
      return {
        icon: "text-slate-500",
        bg: "bg-slate-50 dark:bg-slate-900/20",
      };
  }
};

function ActivityFeed({ onTrackingNumberClick }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [favoriteTrackingNumbers, setFavoriteTrackingNumbers] = useState(
    new Set()
  );
  const intervalRef = useRef(null);
  const abortControllerRef = useRef(null);

  // 즐겨찾는 운송장 번호 목록 가져오기
  const updateFavoriteTrackingNumbers = () => {
    try {
      const presets = getPresets();
      const favoriteNumbers = new Set();

      // 모든 프리셋에서 운송장 번호 추출
      presets.forEach((preset) => {
        if (Array.isArray(preset.trackingNumbers)) {
          preset.trackingNumbers.forEach((num) => {
            if (num && num.trim()) {
              favoriteNumbers.add(num.trim());
            }
          });
        }
      });

      setFavoriteTrackingNumbers(favoriteNumbers);
      return favoriteNumbers;
    } catch (err) {
      console.warn("즐겨찾는 운송장 번호 가져오기 실패:", err);
      return new Set();
    }
  };

  // 이벤트 데이터 가져오기
  const fetchEvents = async (signal) => {
    try {
      setLoading(true);
      setError(null);

      // 즐겨찾는 운송장 번호 목록 업데이트
      const favorites = updateFavoriteTrackingNumbers();

      // 즐겨찾는 운송장이 없으면 빈 배열 반환
      if (favorites.size === 0) {
        setActivities([]);
        setLastUpdate(new Date());
        return;
      }

      // 백엔드에 즐겨찾는 운송장 번호 목록 전달하여 필터링
      const favoriteNumbersArray = Array.from(favorites);
      const data = await getRecentEvents(100, favoriteNumbersArray, signal);

      // API 응답을 활동 피드 형식으로 변환
      const formattedActivities = data.map((event) => {
        const IconComponent = getStatusIcon(event.stage);
        const colors = getStatusColor(event.stage);

        return {
          id: event.id,
          title: event.title,
          description: event.description || "",
          time: event.time,
          time_iso: event.time_iso,
          icon: IconComponent,
          color: colors.icon,
          bgColor: colors.bg,
          status: event.status,
          stage: event.stage,
          tracking_number: event.tracking_number,
        };
      });

      // 시간순으로 정렬 (최신순)
      formattedActivities.sort((a, b) => {
        const timeA = new Date(a.time_iso).getTime();
        const timeB = new Date(b.time_iso).getTime();
        return timeB - timeA;
      });

      setActivities(formattedActivities);
      setLastUpdate(new Date());
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("활동 피드 데이터 가져오기 실패:", err);
        setError("활동 피드를 불러올 수 없습니다.");
      }
    } finally {
      setLoading(false);
    }
  };

  // 초기 로드 및 자동 갱신 설정
  useEffect(() => {
    // 초기 로드
    abortControllerRef.current = new AbortController();
    fetchEvents(abortControllerRef.current.signal);

    // 30초마다 자동 갱신
    intervalRef.current = setInterval(() => {
      abortControllerRef.current = new AbortController();
      fetchEvents(abortControllerRef.current.signal);
    }, 30000); // 30초

    // 프리셋 업데이트 이벤트 리스너
    const handlePresetsUpdated = () => {
      abortControllerRef.current = new AbortController();
      fetchEvents(abortControllerRef.current.signal);
    };

    window.addEventListener("presetsUpdated", handlePresetsUpdated);

    // cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      window.removeEventListener("presetsUpdated", handlePresetsUpdated);
    };
  }, []);

  // 수동 새로고침
  const handleRefresh = () => {
    abortControllerRef.current = new AbortController();
    fetchEvents(abortControllerRef.current.signal);
  };

  // 중복 없는 상태 목록 추출
  const uniqueStatuses = ["전체", ...new Set(activities.map((a) => a.status))];

  const filteredActivities = activities.filter((activity) => {
    const matchesSearch = activity.description
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesFilter =
      statusFilter === "전체" || activity.status === statusFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div
      className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl border
    border-slate-200/50 dark:border-slate-700/50"
    >
      <div className="p-6 border-b border-slate-200/50 dark:border-slate-700/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">
              활동 피드
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {lastUpdate
                ? `마지막 업데이트: ${lastUpdate.toLocaleTimeString("ko-KR")}`
                : "Recent System Activities"}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="새로고침"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
            <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              전체 보기
            </button>
          </div>
        </div>
        {/* 검색 및 필터 UI 추가 */}
        <div className="flex items-center space-x-2 mt-4">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="w-4 h-4 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="활동 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl text-sm bg-slate-100 dark:bg-slate-800
              placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Filter className="w-4 h-4 text-slate-400" />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl text-sm bg-slate-100 dark:bg-slate-800
              text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
            >
              {uniqueStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </div>
          </div>
        </div>
      </div>
      <div className="p-6">
        {loading && activities.length === 0 ? (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            <p>활동 피드를 불러오는 중...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-500 dark:text-red-400">
            <p>{error}</p>
            <button
              onClick={handleRefresh}
              className="mt-2 text-sm text-blue-600 hover:text-blue-700"
            >
              다시 시도
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredActivities.length > 0 ? (
              filteredActivities.map((activity) => {
                const IconComponent = activity.icon;
                return (
                  <div
                    key={activity.id}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (onTrackingNumberClick && activity.tracking_number) {
                        onTrackingNumberClick(activity.tracking_number);
                      }
                    }}
                    className="flex items-start space-x-4 p-3 rounded-xl hover:bg-slate-50
                  dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                  >
                    <div className={`p-2 rounded-lg ${activity.bgColor}`}>
                      <IconComponent className={`w-5 h-5 ${activity.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-white">
                        {activity.title}
                      </h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 truncate">
                        {activity.description || "이벤트 설명 없음"}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {activity.time}
                          </span>
                        </div>
                        {activity.tracking_number && (
                          <span className="text-xs font-mono text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
                            {activity.tracking_number}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center text-slate-500 dark:text-slate-400 py-8">
                {searchTerm || statusFilter !== "전체"
                  ? "일치하는 활동이 없습니다."
                  : favoriteTrackingNumbers.size === 0
                  ? "즐겨찾는 운송장을 추가하면 활동 피드에 표시됩니다."
                  : "활동 피드가 비어있습니다."}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ActivityFeed;
