// 최근 검색 기록 관리 유틸리티

const STORAGE_KEY = 'tracking_search_history';
const MAX_HISTORY = 10; // 최대 저장 개수

/**
 * 검색 기록 항목 구조
 * @typedef {Object} SearchHistoryItem
 * @property {string} trackingNumber - 운송장 번호
 * @property {string} status - 통관 상태 (예: CLEARED, IN_PROGRESS, DELAY 등)
 * @property {string} statusLabel - 통관 상태 한글 라벨
 * @property {string} timestamp - 검색 시간 (ISO 문자열)
 */

/**
 * 상태 코드를 한글 라벨로 변환
 */
function getStatusLabel(status) {
  const statusMap = {
    CLEARED: '통관완료',
    IN_PROGRESS: '통관진행',
    DELAY: '지연',
    PRE_CUSTOMS: '통관전',
    UNKNOWN: '확인필요',
  };
  return statusMap[status?.toUpperCase()] || '확인필요';
}

/**
 * 상태에 따른 색상 클래스 반환
 */
export function getStatusColorClass(status) {
  const statusUpper = status?.toUpperCase() || 'UNKNOWN';
  const colorMap = {
    CLEARED: 'text-green-500',
    IN_PROGRESS: 'text-blue-500',
    DELAY: 'text-yellow-500',
    PRE_CUSTOMS: 'text-slate-500',
    UNKNOWN: 'text-slate-400',
  };
  return colorMap[statusUpper] || colorMap.UNKNOWN;
}

/**
 * 검색 기록을 localStorage에 저장
 * @param {string} trackingNumber - 운송장 번호
 * @param {string} status - 통관 상태
 */
export function saveSearchHistory(trackingNumber, status) {
  if (!trackingNumber || !trackingNumber.trim()) {
    return;
  }

  try {
    const existing = getSearchHistory();
    
    // 이미 같은 운송장이 있으면 제거 (중복 방지)
    const filtered = existing.filter(
      (item) => item.trackingNumber !== trackingNumber.trim()
    );

    // 새로운 항목 추가
    const newItem = {
      trackingNumber: trackingNumber.trim(),
      status: status || 'UNKNOWN',
      statusLabel: getStatusLabel(status),
      timestamp: new Date().toISOString(),
    };

    // 최신 항목을 맨 앞에 추가하고 최대 개수 제한
    const updated = [newItem, ...filtered].slice(0, MAX_HISTORY);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    
    // 커스텀 이벤트 발생시켜 다른 컴포넌트에 알림
    window.dispatchEvent(new Event('searchHistoryUpdated'));
  } catch (error) {
    console.warn('검색 기록 저장 실패:', error);
  }
}

/**
 * localStorage에서 검색 기록 불러오기
 * @returns {SearchHistoryItem[]}
 */
export function getSearchHistory() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('검색 기록 불러오기 실패:', error);
    return [];
  }
}

/**
 * 검색 기록 삭제
 * @param {string} trackingNumber - 삭제할 운송장 번호
 */
export function removeSearchHistory(trackingNumber) {
  try {
    const existing = getSearchHistory();
    const filtered = existing.filter(
      (item) => item.trackingNumber !== trackingNumber
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.warn('검색 기록 삭제 실패:', error);
  }
}

/**
 * 모든 검색 기록 삭제
 */
export function clearSearchHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('검색 기록 전체 삭제 실패:', error);
  }
}

