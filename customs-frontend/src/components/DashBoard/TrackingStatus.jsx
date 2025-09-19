import React, { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, Search, LifeBuoy, Clock4 } from 'lucide-react';
import { getHealth, getNormalizedTracking, triggerTestWebhook } from '../../lib/api';

const STATUS_META = {
  CLEARED: {
    label: '통관 완료',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200',
  },
  IN_PROGRESS: {
    label: '통관 진행',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200',
  },
  UNKNOWN: {
    label: '확인 필요',
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-200',
  },
};

const STAGE_META = {
  IN_PROGRESS: {
    label: '진행',
    dot: 'bg-blue-500',
  },
  DELAY: {
    label: '지연',
    dot: 'bg-amber-500',
  },
  CLEARED: {
    label: '완료',
    dot: 'bg-emerald-500',
  },
};

function formatDate(isoString) {
  if (!isoString) {
    return '정보 없음';
  }

  try {
    return new Date(isoString).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch (error) {
    return isoString;
  }
}

function formatDuration(seconds) {
  if (typeof seconds !== 'number' || Number.isNaN(seconds)) {
    return '계산 불가';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const sec = seconds % 60;
  const parts = [];
  if (hours) parts.push(`${hours}시간`);
  if (minutes) parts.push(`${minutes}분`);
  if (!parts.length || sec) parts.push(`${sec}초`);
  return parts.join(' ');
}

function TrackingStatus() {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [health, setHealth] = useState({ state: 'checking', detail: null });

  useEffect(() => {
    let ignore = false;
    getHealth()
      .then((res) => {
        if (!ignore) {
          setHealth({ state: 'ok', detail: res });
        }
      })
      .catch((err) => {
        if (!ignore) {
          setHealth({ state: 'error', detail: err.message || '서버 점검 필요' });
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const resetResult = () => {
    setSummary(null);
    setEvents([]);
  };

  const lookup = async (number) => {
    const trimmed = number.trim();
    if (!trimmed) {
      setError('운송장 번호를 입력하세요.');
      resetResult();
      return;
    }

    setLoading(true);
    setError('');

    try {
      const data = await getNormalizedTracking(trimmed);
      setSummary(data?.summary || null);
      setEvents(Array.isArray(data?.normalized) ? data.normalized : []);
    } catch (err) {
      setError(err.message || '조회 중 오류가 발생했어요.');
      resetResult();
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    lookup(trackingNumber);
  };

  const handleSample = async () => {
    setLoading(true);
    setError('');
    resetResult();

    try {
      const sample = await triggerTestWebhook();
      const sampleNumber = sample?.data?.number;
      if (sampleNumber) {
        setTrackingNumber(sampleNumber);
        await lookup(sampleNumber);
      } else {
        setError('샘플 데이터를 가져오지 못했어요.');
      }
    } catch (err) {
      setError(err.message || '샘플 호출 중 오류가 발생했어요.');
    } finally {
      setLoading(false);
    }
  };

  const statusKey = summary?.status || 'UNKNOWN';
  const statusInfo = STATUS_META[statusKey] || STATUS_META.UNKNOWN;

  return (
    <div className='bg-white/80 dark:bg-slate-900/80 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-sm'>
      <div className='flex flex-col gap-2 mb-6'>
        <div className='flex items-center justify-between'>
          <div>
            <h3 className='text-xl font-semibold text-slate-800 dark:text-slate-50'>
              실시간 통관 상태 조회
            </h3>
            <p className='text-sm text-slate-500 dark:text-slate-400'>
              FastAPI 백엔드의 `/debug/normalize` 엔드포인트와 연동된 결과입니다.
            </p>
          </div>
          <div className='flex items-center gap-2 text-sm'>
            {health.state === 'checking' && (
              <span className='text-slate-400 flex items-center gap-1'>
                <Loader2 className='w-4 h-4 animate-spin' /> 서버 확인 중
              </span>
            )}
            {health.state === 'ok' && (
              <span className='text-emerald-500 flex items-center gap-1'>
                <CheckCircle2 className='w-4 h-4' /> 연결됨
              </span>
            )}
            {health.state === 'error' && (
              <span className='text-red-500 flex items-center gap-1'>
                <AlertTriangle className='w-4 h-4' /> 연결 실패
              </span>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className='space-y-4'>
        <div className='flex flex-col gap-3 md:flex-row'>
          <label className='flex-1 block'>
            <span className='text-xs font-medium text-slate-500 dark:text-slate-400'>
              운송장 번호
            </span>
            <input
              type='text'
              value={trackingNumber}
              onChange={(event) => setTrackingNumber(event.target.value)}
              placeholder='예: RB123456789CN'
              className='mt-1 w-full rounded-lg border border-slate-200/70 dark:border-slate-700 bg-white/90 dark:bg-slate-800 px-3 py-2 text-sm shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500'
              disabled={loading}
            />
          </label>
          <div className='flex gap-2 items-end'>
            <button
              type='submit'
              className='inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60'
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className='w-4 h-4 animate-spin' /> 조회 중
                </>
              ) : (
                <>
                  <Search className='w-4 h-4' /> 조회
                </>
              )}
            </button>
            <button
              type='button'
              onClick={handleSample}
              className='inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800'
              disabled={loading}
            >
              <LifeBuoy className='w-4 h-4' /> 샘플
            </button>
          </div>
        </div>
      </form>

      {error && (
        <div className='mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/80 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200'>
          <AlertTriangle className='mt-0.5 h-4 w-4 flex-shrink-0' />
          <span>{error}</span>
        </div>
      )}

      {summary && !error && (
        <div className='mt-6 space-y-4'>
          <div className='flex flex-wrap items-center gap-3'>
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${statusInfo.badge}`}>
              <CheckCircle2 className='h-4 w-4' />
              {statusInfo.label}
            </span>
            <div className='flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400'>
              <Clock4 className='h-4 w-4' /> 소요 시간: {formatDuration(summary.duration_sec)}
            </div>
          </div>

          <dl className='grid grid-cols-1 gap-4 md:grid-cols-3'>
            <div className='rounded-xl bg-slate-50/70 p-4 dark:bg-slate-800/60'>
              <dt className='text-xs font-medium text-slate-500 dark:text-slate-400'>
                진행 시작 시각
              </dt>
              <dd className='mt-1 text-sm text-slate-800 dark:text-slate-50'>
                {formatDate(summary.in_progress_at)}
              </dd>
            </div>
            <div className='rounded-xl bg-slate-50/70 p-4 dark:bg-slate-800/60'>
              <dt className='text-xs font-medium text-slate-500 dark:text-slate-400'>
                통관 완료 시각
              </dt>
              <dd className='mt-1 text-sm text-slate-800 dark:text-slate-50'>
                {formatDate(summary.cleared_at)}
              </dd>
            </div>
            <div className='rounded-xl bg-slate-50/70 p-4 dark:bg-slate-800/60'>
              <dt className='text-xs font-medium text-slate-500 dark:text-slate-400'>
                지연 정보
              </dt>
              <dd className='mt-1 text-sm text-slate-800 dark:text-slate-50'>
                {summary.has_delay ? `${summary.delays.length}건` : '지연 없음'}
              </dd>
            </div>
          </dl>

          <div className='space-y-3'>
            <h4 className='text-sm font-semibold text-slate-700 dark:text-slate-200'>
              처리 타임라인
            </h4>
            <ul className='space-y-3'>
              {events.length > 0 ? (
                events.map((eventItem, index) => {
                  const stage = STAGE_META[eventItem.stage] || { label: eventItem.stage, dot: 'bg-slate-400' };
                  return (
                    <li key={`${eventItem.stage}-${index}`} className='flex items-start gap-3 rounded-xl border border-slate-200/60 bg-white/70 p-3 dark:border-slate-700/60 dark:bg-slate-900/40'>
                      <span className={`mt-1 h-2.5 w-2.5 rounded-full ${stage.dot}`} />
                      <div className='flex-1'>
                        <p className='text-xs font-semibold text-slate-500 dark:text-slate-300'>
                          {stage.label} · {formatDate(eventItem.ts)}
                        </p>
                        <p className='mt-1 text-sm text-slate-700 dark:text-slate-100'>
                          {eventItem.desc || '설명 없음'}
                        </p>
                      </div>
                    </li>
                  );
                })
              ) : (
                <li className='rounded-xl border border-slate-200/60 bg-white/70 p-3 text-sm text-slate-500 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-200'>
                  표시할 이벤트가 없습니다.
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default TrackingStatus;
