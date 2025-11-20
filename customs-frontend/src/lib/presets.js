// 운송장 번호 프리셋 관리 유틸리티

const STORAGE_KEY = 'tracking_presets';
const MAX_PRESETS = 20; // 최대 프리셋 개수

/**
 * 프리셋 항목 구조
 * @typedef {Object} Preset
 * @property {string} id - 프리셋 고유 ID
 * @property {string} name - 프리셋 이름
 * @property {string[]} trackingNumbers - 운송장 번호 배열
 * @property {string} createdAt - 생성 시간 (ISO 문자열)
 * @property {string} updatedAt - 수정 시간 (ISO 문자열)
 */

/**
 * localStorage에서 프리셋 목록 불러오기
 * @returns {Preset[]}
 */
export function getPresets() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('프리셋 불러오기 실패:', error);
    return [];
  }
}

/**
 * 프리셋 저장
 * @param {Preset[]} presets - 저장할 프리셋 배열
 */
function savePresets(presets) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    // 커스텀 이벤트 발생시켜 다른 컴포넌트에 알림
    window.dispatchEvent(new Event('presetsUpdated'));
  } catch (error) {
    console.warn('프리셋 저장 실패:', error);
    throw error;
  }
}

/**
 * 새 프리셋 추가
 * @param {string} name - 프리셋 이름
 * @param {string[]} trackingNumbers - 운송장 번호 배열
 * @returns {Preset} 생성된 프리셋
 */
export function addPreset(name, trackingNumbers) {
  if (!name || !name.trim()) {
    throw new Error('프리셋 이름을 입력하세요.');
  }
  
  if (!Array.isArray(trackingNumbers) || trackingNumbers.length === 0) {
    throw new Error('운송장 번호를 최소 1개 이상 입력하세요.');
  }

  // 빈 번호 제거 및 정리
  const cleanedNumbers = trackingNumbers
    .map(num => num.trim())
    .filter(num => num.length > 0);

  if (cleanedNumbers.length === 0) {
    throw new Error('유효한 운송장 번호를 입력하세요.');
  }

  const presets = getPresets();
  
  if (presets.length >= MAX_PRESETS) {
    throw new Error(`최대 ${MAX_PRESETS}개의 프리셋만 저장할 수 있습니다.`);
  }

  const now = new Date().toISOString();
  const newPreset = {
    id: `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: name.trim(),
    trackingNumbers: cleanedNumbers,
    createdAt: now,
    updatedAt: now,
  };

  const updated = [...presets, newPreset];
  savePresets(updated);
  
  return newPreset;
}

/**
 * 프리셋 수정
 * @param {string} id - 프리셋 ID
 * @param {Object} updates - 수정할 필드들 ({name?, trackingNumbers?})
 * @returns {Preset} 수정된 프리셋
 */
export function updatePreset(id, updates) {
  const presets = getPresets();
  const index = presets.findIndex(p => p.id === id);
  
  if (index === -1) {
    throw new Error('프리셋을 찾을 수 없습니다.');
  }

  const preset = presets[index];
  const updatedPreset = {
    ...preset,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  // 이름 검증
  if (updates.name !== undefined) {
    if (!updates.name || !updates.name.trim()) {
      throw new Error('프리셋 이름을 입력하세요.');
    }
    updatedPreset.name = updates.name.trim();
  }

  // 운송장 번호 검증 및 정리
  if (updates.trackingNumbers !== undefined) {
    if (!Array.isArray(updates.trackingNumbers) || updates.trackingNumbers.length === 0) {
      throw new Error('운송장 번호를 최소 1개 이상 입력하세요.');
    }
    const cleanedNumbers = updates.trackingNumbers
      .map(num => num.trim())
      .filter(num => num.length > 0);
    
    if (cleanedNumbers.length === 0) {
      throw new Error('유효한 운송장 번호를 입력하세요.');
    }
    updatedPreset.trackingNumbers = cleanedNumbers;
  }

  const updated = [...presets];
  updated[index] = updatedPreset;
  savePresets(updated);
  
  return updatedPreset;
}

/**
 * 프리셋 삭제
 * @param {string} id - 프리셋 ID
 */
export function deletePreset(id) {
  const presets = getPresets();
  const filtered = presets.filter(p => p.id !== id);
  
  if (filtered.length === presets.length) {
    throw new Error('프리셋을 찾을 수 없습니다.');
  }

  savePresets(filtered);
}

/**
 * 프리셋 ID로 조회
 * @param {string} id - 프리셋 ID
 * @returns {Preset|null}
 */
export function getPresetById(id) {
  const presets = getPresets();
  return presets.find(p => p.id === id) || null;
}

/**
 * 모든 프리셋 삭제
 */
export function clearAllPresets() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('presetsUpdated'));
  } catch (error) {
    console.warn('프리셋 전체 삭제 실패:', error);
  }
}

