import React, { useState, useEffect } from "react";
import { Search, LifeBuoy, Beaker, Bookmark, Plus, Trash2, X } from "lucide-react";
import { getPresets, addPreset, deletePreset } from "../../lib/presets";

function MainPage({ onSearch, onSample, onIncomplete }) {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [loading] = useState(false);
  const [presets, setPresets] = useState([]);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showAddPreset, setShowAddPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetNumbers, setNewPresetNumbers] = useState("");

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

  const handleIncompleteTest = () => {
    const incompleteNumbers = [
      "INCOMPLETE123",
      "TEST_PENDING_001",
      "CUSTOMS_HOLD_789",
    ];
    const randomIncomplete =
      incompleteNumbers[Math.floor(Math.random() * incompleteNumbers.length)];
    setTrackingNumber(randomIncomplete);
    if (onIncomplete) onIncomplete();
  };

  // 프리셋 로드
  useEffect(() => {
    const loadPresets = () => {
      setPresets(getPresets());
    };
    loadPresets();
    
    // 프리셋 업데이트 이벤트 리스너
    window.addEventListener('presetsUpdated', loadPresets);
    return () => window.removeEventListener('presetsUpdated', loadPresets);
  }, []);

  // ESC 키로 모달 닫기
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && showPresetModal) {
        setShowPresetModal(false);
        setShowAddPreset(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showPresetModal]);

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

  // 프리셋 추가 핸들러
  const handleAddPreset = (e) => {
    e.preventDefault();
    try {
      const numbers = newPresetNumbers
        .split(/[,\n]/)
        .map(num => num.trim())
        .filter(num => num.length > 0);
      
      addPreset(newPresetName, numbers);
      setNewPresetName("");
      setNewPresetNumbers("");
      setShowAddPreset(false);
    } catch (error) {
      alert(error.message || '프리셋 추가에 실패했습니다.');
    }
  };

  // 모달 닫기 핸들러
  const handleCloseModal = () => {
    setShowPresetModal(false);
    setShowAddPreset(false);
    setNewPresetName("");
    setNewPresetNumbers("");
  };

  // 프리셋 삭제 핸들러
  const handleDeletePreset = (e, presetId) => {
    e.stopPropagation();
    if (confirm('이 프리셋을 삭제하시겠습니까?')) {
      try {
        deletePreset(presetId);
      } catch (error) {
        alert(error.message || '프리셋 삭제에 실패했습니다.');
      }
    }
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
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-blue-500 transition-colors disabled:opacity-50"
          >
            <LifeBuoy className="w-4 h-4" /> 샘플 테스트
          </button>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <button
            type="button"
            onClick={() => setShowPresetModal(true)}
            disabled={loading}
            className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-blue-500 transition-colors disabled:opacity-50"
          >
            프리셋
          </button>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <button
            type="button"
            onClick={handleIncompleteTest}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-amber-600 dark:text-amber-400 hover:text-amber-500 transition-colors disabled:opacity-50"
          >
            <Beaker className="w-4 h-4" /> 미완료 테스트
          </button>
        </div>

        {/* 프리셋 모달 */}
        {showPresetModal && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={handleCloseModal}
          >
            <div 
              className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 모달 헤더 */}
              <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
                <h2 className="text-2xl font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                  <Bookmark className="w-6 h-6" />
                  저장된 프리셋
                </h2>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 모달 본문 */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* 프리셋 추가 폼 */}
                {showAddPreset ? (
                  <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                    <form onSubmit={handleAddPreset} className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          프리셋 이름
                        </label>
                        <input
                          type="text"
                          value={newPresetName}
                          onChange={(e) => setNewPresetName(e.target.value)}
                          placeholder="예: 중국 배송 1차"
                          className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          운송장 번호 (쉼표 또는 줄바꿈으로 구분)
                        </label>
                        <textarea
                          value={newPresetNumbers}
                          onChange={(e) => setNewPresetNumbers(e.target.value)}
                          placeholder="LY922154217CN, UJ947974463CN, LY929611582CN"
                          rows={3}
                          className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          required
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddPreset(false);
                            setNewPresetName("");
                            setNewPresetNumbers("");
                          }}
                          className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                        >
                          취소
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
                        >
                          저장
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <div className="mb-4">
                    <button
                      type="button"
                      onClick={() => setShowAddPreset(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      프리셋 추가
                    </button>
                  </div>
                )}

                {/* 프리셋 목록 */}
                {presets.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {presets.map((preset) => (
                      <div
                        key={preset.id}
                        onClick={() => handlePresetSelect(preset)}
                        className="group relative p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all cursor-pointer"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base font-semibold text-slate-800 dark:text-white mb-2 truncate">
                              {preset.name}
                            </h3>
                            <div className="flex flex-wrap gap-1.5">
                              {preset.trackingNumbers.slice(0, 3).map((num, idx) => (
                                <span
                                  key={idx}
                                  className="inline-block px-2 py-1 text-xs font-mono bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded"
                                >
                                  {num}
                                </span>
                              ))}
                              {preset.trackingNumbers.length > 3 && (
                                <span className="inline-block px-2 py-1 text-xs text-slate-500 dark:text-slate-400">
                                  +{preset.trackingNumbers.length - 3}개
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                              총 {preset.trackingNumbers.length}개
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => handleDeletePreset(e, preset.id)}
                            className="ml-2 p-1.5 text-slate-400 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="프리셋 삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                    <Bookmark className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg mb-2">저장된 프리셋이 없습니다.</p>
                    <p className="text-sm">프리셋을 추가하여 자주 검색하는 운송장 번호를 저장하세요.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MainPage;
