import React, { useState, useEffect } from 'react';
import { Bookmark, Plus, Trash2, X } from 'lucide-react';
import { getPresets, addPreset, deletePreset } from '../../lib/presets';

export default function PresetsModal({ open, onClose, onSelectPreset }) {
  const [presets, setPresets] = useState([]);
  const [showAddPreset, setShowAddPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetNumbers, setNewPresetNumbers] = useState('');

  useEffect(() => {
    if (!open) {
      setShowAddPreset(false);
      setNewPresetName('');
      setNewPresetNumbers('');
      return;
    }
    const loadPresets = () => {
      setPresets(getPresets());
    };
    loadPresets();
    window.addEventListener('presetsUpdated', loadPresets);
    return () => window.removeEventListener('presetsUpdated', loadPresets);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const handleAddPreset = (e) => {
    e.preventDefault();
    try {
      const numbers = newPresetNumbers
        .split(/[,\n]/)
        .map((num) => num.trim())
        .filter((num) => num.length > 0);

      addPreset(newPresetName, numbers);
      setNewPresetName('');
      setNewPresetNumbers('');
      setShowAddPreset(false);
    } catch (error) {
      alert(error.message || '프리셋을 저장하지 못했습니다.');
    }
  };

  const handleDeletePreset = (e, presetId) => {
    e.stopPropagation();
    if (!confirm('이 즐겨찾기를 삭제할까요?')) {
      return;
    }
    try {
      deletePreset(presetId);
    } catch (error) {
      alert(error.message || '즐겨찾기 삭제에 실패했습니다.');
    }
  };

  const handlePresetClick = async (preset) => {
    try {
      await onSelectPreset?.(preset);
      onClose?.();
    } catch (error) {
      console.error('preset select failed', error);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-2xl font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <Bookmark className="w-6 h-6" />
            즐겨찾는 운송장
          </h2>
          <div className="flex items-center gap-2">
            {!showAddPreset && (
              <button
                type="button"
                onClick={() => setShowAddPreset(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-slate-200 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                즐겨찾기 추가
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {showAddPreset ? (
            <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
              <form onSubmit={handleAddPreset} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    즐겨찾기 이름
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
                      setNewPresetName('');
                      setNewPresetNumbers('');
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
          ) : null}

          {presets.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => handlePresetClick(preset)}
                  className="group relative p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                        {preset.name}
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {preset.trackingNumbers.slice(0, 3).map((num, idx) => (
                          <span
                            key={idx}
                            className="inline-block px-2 py-0.5 text-[11px] font-mono bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded"
                          >
                            {num}
                          </span>
                        ))}
                        {preset.trackingNumbers.length > 3 && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            +{preset.trackingNumbers.length - 3}개
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDeletePreset(e, preset.id)}
                      className="flex-shrink-0 p-1.5 text-slate-400 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="즐겨찾기 삭제"
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
              <p className="text-lg mb-2">저장된 즐겨찾기가 없습니다.</p>
              <p className="text-sm">즐겨찾기를 추가하여 자주 검색하는 운송장 번호를 저장하세요.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
