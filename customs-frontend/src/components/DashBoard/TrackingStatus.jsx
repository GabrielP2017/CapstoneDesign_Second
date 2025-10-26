import React, { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, Search, LifeBuoy, Package, Beaker, Plane, Globe, Download, RotateCcw, Calculator } from 'lucide-react';

// API 함수들
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const getHealth = async () => {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('서버 연결 실패');
  return res.json();
};

const getNormalizedTracking = async (number) => {
  const res = await fetch(`${API_BASE}/debug/normalize?number=${encodeURIComponent(number)}`);
  if (!res.ok) throw new Error('조회 실패');
  return res.json();
};

const triggerTestWebhook = async () => {
  const res = await fetch(`${API_BASE}/test/webhook`, { method: 'POST' });
  if (!res.ok) throw new Error('샘플 생성 실패');
  return res.json();
};

// 상태 메타데이터
const STATUS_META = {
 CLEARED:   { label: '통관 완료',       badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200' },
 IN_PROGRESS: { label: '통관 진행',       badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200' },
 DELAY:    { label: '지연',          badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200' },
 PRE_CUSTOMS: { label: '통관 전(입항 대기)',   badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-200' },
 UNKNOWN:   { label: '확인 필요',       badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-200' },
};

const STAGE_META = { 
  IN_PROGRESS: { label: '운송', dot: 'bg-blue-500' }, 
  DELAY: { label: '지연', dot: 'bg-amber-500' }, 
  CLEARED: { label: '완료', dot: 'bg-emerald-500' } 
};

const TIMELINE_DESC_TRANSLATIONS = {
 'Export customs clearance started, Carrier note: Export customs clearance started': '수출 통관 절차가 시작되었습니다.',
 'Export customs clearance complete, Carrier note: Export clearance success': '수출 통관이 정상적으로 완료되었습니다.',
 'Import customs clearance started, Carrier note: Import clearance start': '수입 통관 절차가 시작되었습니다.',
 'Import customs clearance delay.Package is held temporarily, Carrier note: Package is held temporarily': '통관 지연: 세관에서 화물을 일시 보류 중입니다.',
 'Import customs clearance complete, Carrier note: Import customs clearance complete': '수입 통관이 정상적으로 완료되었습니다.',
 'Package delivered, Carrier note: 고객님의 상품이 배송완료 되었습니다.': '배송이 완료되었습니다.',
 '出口海关/放行': '수출 통관 완료',
};

function formatDate(isoString, options = {}) {
  if (!isoString) return null;
  const defaultOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false };
  try { return new Date(isoString).toLocaleString('ko-KR', { ...defaultOptions, ...options }); } catch { return isoString; }
}

const toYYYYMMDD = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const InfoItem = ({ label, value }) => ( 
  <div className="flex justify-between items-center py-3 border-b border-slate-200/60 dark:border-slate-700/50 last:border-b-0">
    <dt className="text-sm text-slate-500 dark:text-slate-400">{label}</dt>
    <dd className={`text-base font-medium text-right ${!value || value === '데이터 없음' ? 'text-slate-400 dark:text-slate-500 italic' : 'text-slate-800 dark:text-slate-100'}`}>
      {value || '—'}
    </dd>
  </div> 
);

function koCountry(v) {
  if (!v) return '';
  const s = String(v).trim();
  const ISO2_TO_KO = {
    CN:'중국', KR:'대한민국', JP:'일본', US:'미국', HK:'홍콩', TW:'대만',
    SG:'싱가포르', MY:'말레이시아', TH:'태국', VN:'베트남', ID:'인도네시아',
    DE:'독일', NL:'네덜란드', GB:'영국', FR:'프랑스', ES:'스페인',
    IT:'이탈리아', PL:'폴란드', TR:'튀르키예', AE:'아랍에미리트'
  };
  return /^[A-Z]{2}$/.test(s) ? (ISO2_TO_KO[s] || s) : s;
}

const JourneyProgressBar = ({ summary, events }) => {
    const status = (summary?.status || 'UNKNOWN').toUpperCase();
    const hasExport = events.some(e => /export/i.test(e.desc) || (e.desc && e.desc.includes('出口海关/放行')));
    const hasImport = events.some(e => /import/i.test(e.desc));
    const isCleared = status === 'CLEARED';
    let currentLevel = 0;
    if (hasExport) currentLevel = 1;
    if (hasImport || status === 'PRE_CUSTOMS' || status === 'IN_PROGRESS' || status === 'DELAY') currentLevel = 2;
    if (isCleared) currentLevel = 3;
    const steps = [
      { key: 'EXPORT', label: '수출 통관', icon: Plane }, 
      { key: 'TRANSIT', label: '국제 배송', icon: Globe }, 
      { key: 'IMPORT', label: '수입 통관', icon: Download }, 
      { key: 'CLEARED', label: '완료', icon: CheckCircle2 }
    ];
    return (
        <div className="w-full">
          <div className="flex justify-between items-start">
            {steps.map((step, index) => {
                const isCompleted = currentLevel > index;
                const isActive = currentLevel === index;
                const isDelayed = isActive && status === 'DELAY';
                let Icon = step.icon;
                if (isActive && status === 'IN_PROGRESS' && step.key === 'IMPORT') Icon = Loader2;
                if (isDelayed && step.key === 'IMPORT') Icon = AlertTriangle;
                return (
                  <React.Fragment key={step.key}>
                    <div className="flex flex-col items-center text-center w-1/4 px-1">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-300 ${isCompleted ? 'bg-emerald-500 text-white' : isDelayed ? 'bg-amber-500 text-white' : isActive ? 'bg-blue-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                          <Icon className={`w-6 h-6 ${isActive && status === 'IN_PROGRESS' && step.key === 'IMPORT' ? 'animate-pulse' : ''}`} />
                        </div>
                        <p className={`mt-2 text-xs font-semibold transition-colors duration-300 ${isCompleted || isActive ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>
                          {step.label}
                        </p>
                    </div>
                    {index < steps.length - 1 && (
                      <div className={`flex-1 h-1 mt-5 rounded transition-colors duration-300 ${isCompleted ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
                    )}
                  </React.Fragment>
                );
            })}
          </div>
        </div>
    );
};

const AnimatedBlock = ({ children, delay = 0, className = '' }) => {
 const [visible, setVisible] = useState(false);
 useEffect(() => {
  setVisible(false);
  const timer = setTimeout(() => setVisible(true), delay);
  return () => clearTimeout(timer);
 }, [delay, children]);
 return ( 
   <div className={`${className} transition-all duration-500 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
     {children}
   </div> 
 );
};

const MOCK_DATA_DISTRIBUTION = {
  transit: [ 
    { days: 4, probability: 0.15 }, 
    { days: 5, probability: 0.50 }, 
    { days: 6, probability: 0.25 }, 
    { days: 7, probability: 0.10 } 
  ],
  clearance: [ 
    { days: 1, probability: 0.20 }, 
    { days: 2, probability: 0.70 }, 
    { days: 3, probability: 0.10 } 
  ]
};

const RANDOMNESS_FACTOR = 0.2;

export default function TrackingStatus({ initialNumber, autoLookup, autoSample, autoIncomplete, triggerId } = {}) {
 const [trackingNumber, setTrackingNumber] = useState('');
 const [summary, setSummary] = useState(null);
 const [events, setEvents] = useState([]);
 const [rawProviderEvents, setRawProviderEvents] = useState([]);
 const [anyEvents, setAnyEvents] = useState(false);
 const [details, setDetails] = useState(null);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState('');
 const [health, setHealth] = useState({ state: 'checking', detail: null });
 const [selectedDate, setSelectedDate] = useState(new Date());
 const [prediction, setPrediction] = useState([]);

  useEffect(() => {
    let ignore = false;
    getHealth()
      .then((res) => { if (!ignore) setHealth({ state: 'ok', detail: res }); })
      .catch((err) => { if (!ignore) setHealth({ state: 'error', detail: err.message || '서버 점검 필요' }); });
    return () => { ignore = true; };
  }, []);

  // MainPage 등에서 전달된 의도를 한 번만 실행
  useEffect(() => {
    const run = async () => {
      if (autoSample) {
        await handleSample();
        return;
      }
      if (autoIncomplete) {
        handleIncompleteTest();
        return;
      }
      if (initialNumber && autoLookup) {
        setTrackingNumber(initialNumber);
        await lookup(initialNumber);
      }
    };
    if (triggerId !== undefined) {
      run();
    }
  }, [triggerId]);
  
 const resetResult = () => {
    setTrackingNumber('');
    setSummary(null);
    setEvents([]);
    setAnyEvents(false);
    setError('');
    setPrediction([]);
    setDetails(null);
  };

 const lookup = async (number) => {
    const trimmed = number.trim();
    if (!trimmed) {
      setError('운송장 번호를 입력하세요.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      const data = await getNormalizedTracking(trimmed);
      setSummary(data?.summary || null);
      setEvents(Array.isArray(data?.normalized) ? data.normalized : []);
      setRawProviderEvents(Array.isArray(data?.raw_provider_events) ? data.raw_provider_events : []);
      setAnyEvents(Boolean(data?.any_events));
      setDetails(data?.details || null);
    } catch (err) {
      setError(err.message || '조회 중 오류가 발생했어요.');
      setSummary(null);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

 const handleSubmit = (e) => { e.preventDefault(); lookup(trackingNumber); };

 const handleSample = async () => {
      setLoading(true);
      setError('');
      try {
        await new Promise(resolve => setTimeout(resolve, 500));
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

 const handleIncompleteTest = () => {
    setLoading(true);
    setError('');
    const mockPreCustomsData = {
      summary: { status: "PRE_CUSTOMS", in_progress_at: null, cleared_at: null, has_delay: false, delays: [], duration_sec: null, },
      normalized: [ { desc: "Export customs clearance started, Carrier note: Export customs clearance started", stage: "IN_PROGRESS", ts: "2025-09-24T10:00:00Z" } ],
      any_events: true,
    };
    setTrackingNumber("INCOMPLETE_TEST");
    setTimeout(() => {
      setSummary(mockPreCustomsData.summary);
      setEvents(mockPreCustomsData.normalized);
      setAnyEvents(mockPreCustomsData.any_events);
      setLoading(false);
    }, 500);
  };

 const today = new Date();
 today.setHours(0, 0, 0, 0);
 const minDate = toYYYYMMDD(today);

  const handleDateChange = (e) => {
    const [year, month, day] = e.target.value.split('-').map(Number);
    setSelectedDate(new Date(year, month - 1, day));
    setPrediction([]);
  };

  const handlePrediction = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${API_BASE}/api/predict-delivery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracking_number: trackingNumber || 'TEMP_' + Date.now(),
          departure_date: selectedDate.toISOString(),
          hub: details?.hub || 'ICN',
          carrier: details?.carrier || 'Unknown',
          origin: details?.origin_country || 'Unknown'
        })
      });
      
      if (!response.ok) throw new Error('API 호출 실패');
      
      const data = await response.json();
      
      const fiveDayView = data.probability_distribution.map(item => ({
        date: new Date(item.date),
        probability: item.probability
      }));
      
      setPrediction(fiveDayView);
      
      setDetails(prev => ({
        ...prev,
        predicted_clearance_median_h: data.predicted_clearance_median_h,
        predicted_clearance_p90_h: data.predicted_clearance_p90_h,
        predicted_delivery_median_h: data.predicted_delivery_median_h,
        predicted_delivery_p90_h: data.predicted_delivery_p90_h,
        predicted_clearance_ts: data.predicted_clearance_ts,
        predicted_eta_ts: data.predicted_eta_ts,
        predicted_eta_p90_ts: data.predicted_eta_p90_ts
      }));
      
    } catch (err) {
      console.warn('백엔드 API 호출 실패, MOCK 데이터로 폴백:', err);
      
      const { transit, clearance } = MOCK_DATA_DISTRIBUTION;
      const departureDate = new Date(selectedDate);
      const finalProbabilities = {};
      transit.forEach(t => {
        const arrivalDate = new Date(departureDate);
        arrivalDate.setDate(departureDate.getDate() + t.days);
        clearance.forEach(c => {
          const finalDate = new Date(arrivalDate);
          finalDate.setDate(arrivalDate.getDate() + c.days);
          const finalDateStr = toYYYYMMDD(finalDate);
          const probability = t.probability * c.probability;
          if (finalProbabilities[finalDateStr]) {
            finalProbabilities[finalDateStr] += probability;
          } else {
            finalProbabilities[finalDateStr] = probability;
          }
        });
      });
      let initialPrediction = Object.entries(finalProbabilities).map(([date, prob]) => ({ date, probability: prob }));
      let randomizedPrediction = initialPrediction.map(p => {
        const randomFactor = (Math.random() - 0.5) * RANDOMNESS_FACTOR;
        return { ...p, probability: p.probability * (1 + randomFactor) };
      });

      const highestProbEntry = randomizedPrediction.reduce(
          (max, p) => (p.probability > max.probability ? p : max),
          { date: toYYYYMMDD(new Date()), probability: 0 }
      );

      const centerDate = new Date(highestProbEntry.date);
      const fiveDayView = Array.from({ length: 5 }).map((_, i) => {
        const date = new Date(centerDate);
        date.setDate(centerDate.getDate() + (i - 2));
        const dateStr = toYYYYMMDD(date);
        const predictionForDay = randomizedPrediction.find(p => p.date === dateStr);
        return {
          date: date,
          probability: predictionForDay ? predictionForDay.probability : 0,
        };
      });

      setPrediction(fiveDayView);
    } finally {
      setLoading(false);
    }
  };

  const handleResetSimulation = () => { setPrediction([]); };
  
  const getStyleForProbability = (probability, minProb, maxProb) => {
    const range = maxProb - minProb;
    if (range === 0) return { color: 'hsl(120, 95%, 45%)' };
    const relativeProb = (probability - minProb) / range;
    const hue = relativeProb * 120;
    const saturation = 95;
    const lightness = 45;
    return { color: `hsl(${hue}, ${saturation}%, ${lightness}%)` };
  };
  
  const probabilities = prediction.map(p => p.probability);
  const highestProbabilityInView = Math.max(...probabilities, 0);
  const lowestProbabilityInView = Math.min(...probabilities, 0);

  const statusKey = (summary?.status || 'UNKNOWN').toUpperCase();

  const needsTransitFallback = (!events || events.length === 0) && anyEvents && (statusKey === 'PRE_CUSTOMS' || statusKey === 'UNKNOWN');

  const fallbackFromRaw = needsTransitFallback
    ? (rawProviderEvents || []).filter(e => e && (e.ts || e.desc || e.location)).slice(-5).map(e => ({ 
        ts: e.ts || (details?.event_processed_at || details?.sync_processed_at || new Date().toISOString()), 
        stage: 'IN_PROGRESS', 
        desc: e?.desc || '이동', 
        location: e?.location || null, 
      }))
    : [];

  const normalizedWithLoc = Array.isArray(events) ? events.map(e => ({ 
      ts: e.ts, 
      stage: e.stage, 
      desc: e.desc || null, 
      location: e.location || null, 
    })) : [];

  const lastNormTs = normalizedWithLoc.length > 0 ? normalizedWithLoc[normalizedWithLoc.length - 1].ts : null;

  const rawTail = (rawProviderEvents || [])
    .filter(e => e && (e.ts || e.desc || e.location))
    .filter(e => !lastNormTs || (e.ts && new Date(e.ts) > new Date(lastNormTs)))
    .map(e => ({ 
      ts: e.ts || (details?.event_processed_at || details?.sync_processed_at || new Date().toISOString()), 
      stage: 'IN_PROGRESS', 
      desc: e.desc || '이동', 
      location: e.location || null, 
    }));

  const viewEvents = (() => {
    if (normalizedWithLoc.length > 0) {
      const merged = [...normalizedWithLoc];
      for (const r of rawTail) {
        const i = merged.findIndex(x => x.ts === r.ts && ((x.desc || '') === (r.desc || '')));
        if (i >= 0 && !merged[i].location && r.location) {
          merged[i] = { ...merged[i], location: r.location };
        }
      }
      return merged;
    }
    if (fallbackFromRaw && fallbackFromRaw.length > 0) return fallbackFromRaw;
    if (needsTransitFallback) {
      return [{ 
        ts: details?.event_processed_at || details?.sync_processed_at || new Date().toISOString(), 
        stage: 'IN_PROGRESS', 
        desc: '이동', 
        location: details?.last_location || null 
      }];
    }
    return [];
  })();

 return (
    <div className='bg-white/80 dark:bg-slate-900/80 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-sm'>
        <div className='flex flex-col gap-2 mb-6'>
            <div className='flex items-center justify-between'>
                <div>
                    <h3 className='text-xl font-semibold text-slate-800 dark:text-slate-50'>실시간 통관 상태 조회</h3>
                    <p className='text-sm text-slate-500 dark:text-slate-400'>FastAPI 백엔드의 <code>/debug/normalize</code> 결과</p>
                </div>
                <div className='flex items-center gap-2 text-sm'>
                    {health.state === 'checking' && <span className='text-slate-400 flex items-center gap-1'><Loader2 className='w-4 h-4 animate-spin'/> 서버 확인 중</span>}
                    {health.state === 'ok' && <span className='text-emerald-500 flex items-center gap-1'><CheckCircle2 className='w-4 h-4'/> 연결됨</span>}
                    {health.state === 'error' && <span className='text-red-500 flex items-center gap-1'><AlertTriangle className='w-4 h-4'/> 연결 실패</span>}
                </div>
            </div>
        </div>
        <form onSubmit={handleSubmit} className='space-y-4'>
            <div className='flex flex-col gap-3 md:flex-row'>
                <label className='flex-1 block'>
                    <span className='text-xs font-medium text-slate-500 dark:text-slate-400'>운송장 번호</span>
                    <input type='text' value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder='예: RB123456789CN' className='mt-1 w-full rounded-lg border border-slate-200/70 dark:border-slate-700 bg-white/90 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-3 py-2 text-sm shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500' disabled={loading} />
                </label>
                <div className='flex gap-2 items-end flex-wrap'>
                    <button type='submit' className='inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60' disabled={loading}>
                        {loading ? (<><Loader2 className='w-4 h-4 animate-spin'/> 조회 중</>) : (<><Search className='w-4 h-4'/> 조회</>)}
                    </button>
                    <button type='button' onClick={resetResult} className='inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800' disabled={loading}>
                        <RotateCcw className='w-4 h-4'/> 초기화
                    </button>
                    <button type='button' onClick={handleSample} className='inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800' disabled={loading}>
                        <LifeBuoy className='w-4 h-4'/> 샘플
                    </button>
                    <button type='button' onClick={handleIncompleteTest} className='inline-flex items-center gap-2 rounded-lg border border-amber-300 dark:border-amber-700 px-4 py-2 text-sm font-semibold text-amber-600 dark:text-amber-200 hover:bg-amber-100/60 dark:hover:bg-amber-800/40' disabled={loading}>
                        <Beaker className='w-4 h-4'/> 미완료 테스트
                    </button>
                </div>
            </div>
        </form>
        {error && ( <div className='mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/80 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200'><AlertTriangle className='mt-0.5 h-4 w-4 flex-shrink-0'/><span>{error}</span></div> )}
        
        {summary && !error && (
            <div className='mt-6 space-y-6'>
                <AnimatedBlock>
                  <div className="border-t border-slate-200/60 dark:border-slate-700/50 pt-6 space-y-4">
                    <div>
                      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                        <div className="relative">
                          <label htmlFor="date-picker" className="text-xs font-medium text-slate-500 dark:text-slate-400">예상 출발 날짜 선택</label>
                          <input
                            id="date-picker" type="date" min={minDate} value={toYYYYMMDD(selectedDate)} onChange={handleDateChange}
                            className="mt-1 w-full sm:w-auto rounded-lg border border-slate-200/70 dark:border-slate-700 bg-white/90 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-3 py-2 text-sm shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex gap-2 items-end">
                            <button type="button" onClick={handlePrediction} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500" disabled={loading}>
                              <Calculator className="w-4 h-4" /> 예상일 계산
                            </button>
                            <button type="button" onClick={handleResetSimulation} disabled={prediction.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">
                              <RotateCcw className="w-4 h-4" /> 초기화
                            </button>
                        </div>
                      </div>
                    </div>

                    {prediction.length > 0 && (
                      <div className="border-t border-slate-200/60 dark:border-slate-700/50 pt-4 mt-4">
                        <AnimatedBlock>
                          <div className="flex justify-center">
                            <div className="flex w-full bg-slate-50/70 dark:bg-slate-800/60 p-2 rounded-xl text-center">
                              {prediction.map(({ date, probability }, index) => {
                                  return (
                                      <div 
                                          key={date.toISOString()}
                                          className={`flex-1 flex-grow py-2 px-1 ${ index < prediction.length - 1 ? 'border-r border-slate-200/60 dark:border-slate-700/50' : '' }`}
                                      >
                                          <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                                              {date.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', weekday: 'short' })}
                                          </p>
                                          <p 
                                            className="text-lg font-bold mt-1"
                                            style={getStyleForProbability(probability, lowestProbabilityInView, highestProbabilityInView)}
                                            >
                                            {(probability * 100).toFixed(0)}%
                                            </p>
                                      </div>
                                  );
                              })}
                            </div>
                          </div>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-3 text-right">
                            * 가장 확률 높은 날의 좌우 2일 예측치
                          </p>
                          
                          {details?.predicted_eta_ts && (
                            <div className="mt-4 p-4 bg-blue-50/70 dark:bg-blue-900/20 rounded-lg border border-blue-200/60 dark:border-blue-800/50">
                              <h5 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2">
                                상세 예측 정보
                              </h5>
                              <dl className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <dt className="text-slate-600 dark:text-slate-400">예상 통관 완료:</dt>
                                  <dd className="font-medium text-slate-800 dark:text-slate-200">
                                    {formatDate(details.predicted_clearance_ts || details.predicted_eta_ts)}
                                  </dd>
                                </div>
                                <div className="flex justify-between">
                                  <dt className="text-slate-600 dark:text-slate-400">예상 최종 도착 (P50):</dt>
                                  <dd className="font-medium text-emerald-600 dark:text-emerald-400">
                                    {formatDate(details.predicted_eta_ts)}
                                  </dd>
                                </div>
                                <div className="flex justify-between">
                                  <dt className="text-slate-600 dark:text-slate-400">예상 최종 도착 (P90):</dt>
                                  <dd className="font-medium text-amber-600 dark:text-amber-400">
                                    {formatDate(details.predicted_eta_p90_ts)}
                                  </dd>
                                </div>
                              </dl>
                            </div>
                          )}
                        </AnimatedBlock>
                      </div>
                    )}
                  </div>
                </AnimatedBlock>
                
                <div className='flex flex-col gap-6 md:flex-row'>
                    <AnimatedBlock delay={150} className='flex-1 md:w-7/12 flex flex-col'>
                        <div className='space-y-3 flex flex-col flex-1'>
                            <h4 className='text-sm font-semibold text-slate-700 dark:text-slate-200'>
                                주요 배송 정보
                            </h4>
                            <div className='rounded-xl border border-slate-200/60 bg-white/70 dark:border-slate-700/60 dark:bg-slate-900/40 flex-1 flex flex-col'>
                                <div className="p-4 border-b border-slate-200/60 dark:border-slate-700/50">
                                    <JourneyProgressBar summary={summary} events={viewEvents} />
                                </div>
                                <div className="p-4 flex-1">
                                    <dl>
                                        {summary.has_delay ? (
                                            <div className="mb-3">
                                                <div className="flex justify-between items-center py-3 border-b border-slate-200/60 dark:border-slate-700/50">
                                                    <dt className="text-sm text-slate-500 dark:text-slate-400">지연 상태</dt>
                                                    <dd className="text-base font-medium text-right text-rose-600 dark:text-rose-400">{Array.isArray(summary.delays) ? summary.delays.length : 0}건 발생</dd>
                                                </div>
                                                <div className="mt-2 pl-3 space-y-2">
                                                    {Array.isArray(summary.delays) && summary.delays.map((d, i) => {
                                                        const translatedHint = TIMELINE_DESC_TRANSLATIONS[d.hint] || d.hint;
                                                        return ( <div key={i} className="text-xs text-rose-600 dark:text-rose-400"><p className="font-semibold">{formatDate(d.at, { year: undefined, hour12: true })}</p><p className="opacity-80">{translatedHint}</p></div> );
                                                    })}
                                                </div>
                                            </div>
                                        ) : ( <InfoItem label="지연 상태" value="지연 없음" /> )}
                                        <InfoItem label="적출국" value={(details && typeof details.origin_country !== 'undefined' && String(details.origin_country).trim() !== '') ? koCountry(details.origin_country) : '데이터 없음'} />
                                        <InfoItem label="입항일" value={details?.arrival_date ? formatDate(details.arrival_date, { hour: undefined, minute: undefined }) : '데이터 없음'} />
                                        <InfoItem label="처리일시(이벤트기준)" value={formatDate(details?.event_processed_at)} />
                                        <InfoItem label="처리일시(동기화기준)" value={formatDate(details?.sync_processed_at)} />
                                    </dl>
                                </div>
                            </div>
                        </div>
                    </AnimatedBlock>
                    <AnimatedBlock delay={300} className='flex-1 md:w-5/12'>
                        <div className='space-y-3'>
                            <h4 className='text-sm font-semibold text-slate-700 dark:text-slate-200'>처리 타임라인</h4>
                            <ul className='space-y-3'>
                              {viewEvents.length > 0 ? (
                                viewEvents.map((eventItem, index) => {
                                  const stage = STAGE_META[eventItem.stage] || { label: eventItem.stage, dot: 'bg-slate-400' };
                                  const findTranslation = (description) => {
                                    if (!description) return '설명 없음';
                                    const matchingKey = Object.keys(TIMELINE_DESC_TRANSLATIONS).find(key => description.startsWith(key));
                                    if (matchingKey) {
                                      const translation = TIMELINE_DESC_TRANSLATIONS[matchingKey];
                                      const dynamicPart = description.slice(matchingKey.length);
                                      return translation + dynamicPart;
                                    }
                                    return description;
                                  };
                                  const translatedDesc = findTranslation(eventItem.desc);
                                  return (
                                    <li key={`${eventItem.stage}-${index}`} className='flex items-start gap-3 rounded-xl border border-slate-200/60 bg-white/70 p-3 dark:border-slate-700/60 dark:bg-slate-900/40'>
                                      <span className={`mt-1 h-2.5 w-2.5 rounded-full ${stage.dot}`}/>
                                      <div className='flex-1'>
                                        <p className='text-xs font-semibold text-slate-500 dark:text-slate-300'>
                                          {stage.label} · {formatDate(eventItem.ts)}
                                        </p>
                                        <p className='mt-1 text-sm text-slate-700 dark:text-slate-100'>
                                          {translatedDesc}
                                          {eventItem?.location ? <span className='text-slate-500 dark:text-slate-400'> · {eventItem.location}</span> : null}
                                        </p>
                                      </div>
                                    </li>
                                  );
                                })
                              ) : (
                                <li className='rounded-xl border border-slate-200/60 bg-white/70 p-3 text-sm text-slate-500 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-200'>
                                  {anyEvents ? '통관 키워드에 해당하지 않는 일반 배송 이벤트만 감지됨 (운송중)' : '표시할 이벤트가 없습니다.'}
                                </li>
                              )}
                            </ul>
                        </div>
                    </AnimatedBlock>
                </div>
            </div>
        )}
    </div>
 );
}
