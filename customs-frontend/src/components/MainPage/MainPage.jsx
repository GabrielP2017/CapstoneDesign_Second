import React, { useState } from "react";
import { Search, LifeBuoy, Bookmark } from "lucide-react";
import PresetsModal from "../Favorites/PresetsModal";

function MainPage({ onSearch, onSample }) {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [loading] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!trackingNumber.trim()) return;
    if (onSearch) onSearch(trackingNumber.trim());
  };

  const handleSample = () => {
    const sampleNumbers = [
      "LY922154217CN",
      "UJ947974463CN",
      "LY929611582CN",
      "RB123456789CN",
    ];
    const randomSample =
      sampleNumbers[Math.floor(Math.random() * sampleNumbers.length)];
    setTrackingNumber(randomSample);
    if (onSample) onSample();
  };
  // 프리셋 선택 핸들러
  const handlePresetSelect = (preset) => {
    if (preset.trackingNumbers && preset.trackingNumbers.length > 0) {
      // 첫 번째 운송장 번호로 검색
      const firstNumber = preset.trackingNumbers[0];
      setTrackingNumber(firstNumber);
      setShowPresetModal(false);
      if (onSearch) onSearch(firstNumber);
    }
  };

  // 모달 닫기 핸들러
  const handleCloseModal = () => {
    setShowPresetModal(false);
  };

  return (
    <div className="min-h-[75vh] flex items-start justify-center pt-32">
      <div className="w-full max-w-2xl px-4 mt-10">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-slate-800 dark:text-white mb-4">
            통관 상태를 확인하세요
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            운송장 번호를 입력하면 실시간으로 통관 상태를 확인할 수 있어요.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="relative">
          <div className="relative">
            <Search className="w-6 h-6 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="운송장 번호를 입력하세요"
              className="w-full pl-14 pr-32 py-4 text-lg bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:shadow-lg transition-all font-semibold"
            >
              조회
            </button>
          </div>
        </form>

        <div className="mt-8 flex justify-center space-x-4">
          <button
            type="button"
            onClick={handleSample}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-blue-500 transition-colors disabled:opacity-50"
          >
            <LifeBuoy className="w-4 h-4" /> 샘플 테스트
          </button>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <button
            type="button"
            onClick={() => setShowPresetModal(true)}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-blue-500 transition-colors disabled:opacity-50"
          >
            <Bookmark className="w-4 h-4" /> 즐겨찾는 운송장
          </button>
        </div>

        <PresetsModal
          open={showPresetModal}
          onClose={handleCloseModal}
          onSelectPreset={handlePresetSelect}
        />
      </div>
    </div>
  );
}

export default MainPage;
