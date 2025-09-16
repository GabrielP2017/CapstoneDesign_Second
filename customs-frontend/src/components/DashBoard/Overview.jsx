import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip as ChartTooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

ChartJS.register(ArcElement, ChartTooltip, Legend);

const generateDummyData = (filters) => {
    // 필터 선택에 따라 더미 데이터의 양이 달라지도록 seed 값 변경
    const seed = filters.hub.length * 10 + filters.carrier.length * 5 + filters.origin.length * 2 + Math.random();
    const random = (s) => () => {
        s = Math.sin(s++) * 10000;
        return s - Math.floor(s);
    };
    const seededRandom = random(seed);

    // 데이터 양을 대폭 늘림
    const totalProcessed = 150000 + Math.floor(seededRandom() * 50000);
    const completed = 120000 + Math.floor(seededRandom() * 30000);
    const pending = 5000 + Math.floor(seededRandom() * 5000);
    const returned = 2000 + Math.floor(seededRandom() * 2000);
    const inspectionCount = 10000 + Math.floor(seededRandom() * 5000);
    const quarantineRate = (90 + seededRandom() * 9).toFixed(1);
    const lowConfidenceSample = 100 + Math.floor(seededRandom() * 250);

    const cards = [
        { title: "총 통관 건수", value: totalProcessed.toLocaleString(), change: "+15.3%", status: "up" },
        { title: "통관 완료 건수", value: completed.toLocaleString(), change: "+8.2%", status: "up" },
        { title: "보류 건수", value: pending.toLocaleString(), change: "+2.1%", status: "up" },
        { title: "반송 건수", value: returned.toLocaleString(), change: "-1.5%", status: "down" },
        { title: "세관 검사 건수", value: inspectionCount.toLocaleString(), change: "+5.0%", status: "up" },
        { title: "검역 통과율", value: `${quarantineRate}%`, change: "+0.5%", status: "up" }
    ];

    const sparklineData = Array.from({ length: 12 }, (_, i) => ({
        month: `${i + 1}월`,
        value: 15000 + Math.floor(seededRandom() * 5000),
    }));

    const heatmapData = Array.from({ length: 7 }, () =>
        Array.from({ length: 24 }, () => Math.floor(seededRandom() * 100))
    );

    const doughnutData = [
      { name: '통관 완료', value: completed, color: '#4F46E5' },
      { name: '통관 보류', value: pending, color: '#FCD34D' },
      { name: '세관 검사', value: inspectionCount, color: '#3B82F6' },
      { name: '반송', value: returned, color: '#EF4444' },
    ];

    return { cards, sparklineData, heatmapData, lowConfidenceSample, doughnutData };
};

const COLORS = ['#4F46E5', '#FCD34D', '#3B82F6', '#EF4444'];

const DoughnutChart = ({ data }) => {
    const chartData = {
        labels: data.map(item => item.name),
        datasets: [{
            data: data.map(item => item.value),
            backgroundColor: data.map(item => item.color),
            borderColor: ['#fff', '#fff', '#fff', '#fff'],
            borderWidth: 2,
        }],
    };

    const options = {
        responsive: true,
        cutout: '70%',
        plugins: {
            legend: {
                display: false,
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const label = context.label || '';
                        if (label) {
                            return `${label}: ${context.formattedValue}건`;
                        }
                        return '';
                    }
                }
            }
        },
    };

    return <Doughnut data={chartData} options={options} />;
};

const SparklineChart = ({ data }) => {
    return (
        <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
                <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <RechartsTooltip  formatter={(value) => [`${value}건`, '']}/>
                    <Line type="monotone" dataKey="value" stroke="#4F46E5" strokeWidth={2} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

const HeatmapChart = ({ heatmapData }) => {
    const [tooltipContent, setTooltipContent] = useState(null);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    const containerRef = useRef(null);

    const handleMouseMove = (day, hour, value, e) => {
        if (!containerRef.current) return;
        
        const containerRect = containerRef.current.getBoundingClientRect();
        
        const x = e.clientX - containerRect.left;
        const y = e.clientY - containerRect.top;

        setTooltipContent(`${day} ${hour}시: ${value}건`);
        setTooltipPosition({ x: x + 10, y: y - 20 });
    };

    const handleMouseLeave = () => {
        setTooltipContent(null);
    };

    const days = ['월', '화', '수', '목', '금', '토', '일'];

    return (
        <div ref={containerRef} className="bg-white dark:bg-slate-900 rounded-lg shadow p-6 col-span-2 relative">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">주간 시간대별 통관 활동</h3>
            <div className="grid gap-1 w-full overflow-x-auto">
                <div className="grid grid-cols-24 text-center text-[10px] text-slate-500 dark:text-slate-400">
                    {Array.from({ length: 24 }).map((_, i) => <div key={i}>{i}</div>)}
                </div>
                {heatmapData.map((week, weekIndex) => (
                    <div key={weekIndex} className="grid grid-cols-25 gap-1">
                        <div className="text-right text-xs text-slate-500 dark:text-slate-400">{days[weekIndex]}</div>
                        {week.map((hour, hourIndex) => (
                            <div
                                key={hourIndex}
                                className="h-4 w-full rounded-sm transition-colors duration-300"
                                style={{ backgroundColor: `rgba(59, 130, 246, ${hour / 100})` }}
                                onMouseMove={(e) => handleMouseMove(days[weekIndex], hourIndex, hour, e)}
                                onMouseLeave={handleMouseLeave}
                            ></div>
                        ))}
                    </div>
                ))}
            </div>

            {tooltipContent && (
                <div 
                    className="absolute z-50 p-2 text-xs bg-slate-700 text-white rounded shadow-lg transition-opacity duration-300"
                    style={{ top: tooltipPosition.y - 40, left: tooltipPosition.x + 10, pointerEvents: 'none' }}
                >
                    {tooltipContent}
                </div>
            )}
        </div>
    );
};

const Overview = () => {
    const [selectedFilters, setSelectedFilters] = useState({
        hub: 'all',
        carrier: 'all',
        origin: 'all',
    });
    const [activeFilters, setActiveFilters] = useState(selectedFilters);
    const [data, setData] = useState(null);

    const fetchData = useCallback(() => {
        const dummyData = generateDummyData(activeFilters);
        setData(dummyData);
    }, [activeFilters]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleFilterChange = (filterName, value) => {
        setSelectedFilters(prevFilters => ({
            ...prevFilters,
            [filterName]: value,
        }));
    };

    const handleSearch = () => {
        setActiveFilters(selectedFilters);
    };

    const handleReset = () => {
        const initialFilters = { hub: 'all', carrier: 'all', origin: 'all' };
        setSelectedFilters(initialFilters);
        setActiveFilters(initialFilters);
    };

    if (!data) {
        return <div>데이터를 불러오는 중입니다...</div>;
    }

    const isLowConfidence = data.lowConfidenceSample < 30;

    return (
        <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">통관 현황</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                현재 시스템에 등록된 모든 통관 물품의 실시간 통계입니다.
            </p>

            <div className="flex space-x-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg shadow-sm mb-6 items-end">
                <div>
                    <label htmlFor="hub-select" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                        허브
                    </label>
                    <select id="hub-select" value={selectedFilters.hub} onChange={(e) => handleFilterChange('hub', e.target.value)}
                        className="p-2 border border-slate-300 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200">
                        <option value="all">전체</option>
                        <option value="icn">인천공항</option>
                        <option value="pusan">부산항</option>
                        <option value="gimhae">김해공항</option>
                        <option value="pyeongtaek">평택항</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="carrier-select" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                        운송사
                    </label>
                    <select id="carrier-select" value={selectedFilters.carrier} onChange={(e) => handleFilterChange('carrier', e.target.value)}
                        className="p-2 border border-slate-300 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200">
                        <option value="all">전체</option>
                        <option value="cj">CJ대한통운</option>
                        <option value="epost">우체국택배</option>
                        <option value="dhl">DHL</option>
                        <option value="fedex">FedEx</option>
                        <option value="ups">UPS</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="origin-select" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                        출발국
                    </label>
                    <select id="origin-select" value={selectedFilters.origin} onChange={(e) => handleFilterChange('origin', e.target.value)}
                        className="p-2 border border-slate-300 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200">
                        <option value="all">전체</option>
                        <option value="china">중국</option>
                        <option value="usa">미국</option>
                        <option value="japan">일본</option>
                        <option value="germany">독일</option>
                        <option value="vietnam">베트남</option>
                        <option value="uk">영국</option>
                    </select>
                </div>

                <div className="flex space-x-2 ml-auto">
                    <button onClick={handleReset} className="p-2 bg-gray-200 dark:bg-gray-700 text-slate-700 dark:text-slate-200 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition">
                        초기화
                    </button>
                    <button onClick={handleSearch} className="p-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 transition">
                        검색
                    </button>
                </div>
            </div>

            {isLowConfidence && (
                <div className="text-right text-sm text-slate-400 dark:text-slate-600 mb-4">
                    저신뢰(N &lt; 30)
                </div>
            )}
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                {data.cards.map((card, index) => (
                    <div key={index} 
                         className="bg-white dark:bg-slate-900 rounded-lg shadow p-6 transition-transform duration-300 hover:scale-105 transform"
                    >
                        <div className="text-sm font-medium text-slate-500 dark:text-slate-400">{card.title}</div>
                        <div className="mt-1 text-2xl md:text-3xl font-bold text-slate-800 dark:text-white transition-colors duration-300">{card.value}</div>
                        <div className={`text-xs mt-2 font-medium transition-colors duration-300 ${card.status === 'up' ? 'text-green-500' : 'text-red-500'}`}>
                            {card.change} vs 지난 달
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 rounded-lg shadow p-6 relative">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">월별 통관 처리량</h3>
                    <SparklineChart data={data.sparklineData} />
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-lg shadow p-6 flex flex-col items-center relative">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">통관 상태별 건수</h3>
                    <div className="flex justify-center items-center relative">
                        <DoughnutChart data={data.doughnutData} />
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
                            <div className="text-sm font-bold text-slate-800 dark:text-white">{data.cards[0].value}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-100">총 통관 건수</div>
                        </div>
                    </div>
                    <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs font-medium">
                        {data.doughnutData.map((item, index) => (
                            <div key={index} className="flex items-center space-x-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                                <span>{item.name} ({item.value.toLocaleString()})</span>
                            </div>
                        ))}
                    </div>
                </div>
                
                <HeatmapChart heatmapData={data.heatmapData} />
            </div>
        </div>
    );
};

export default Overview;