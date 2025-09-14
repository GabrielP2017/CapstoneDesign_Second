// src/components/DashBoard/RevenueChart.jsx

import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

// Chart.js에 필요한 요소들을 등록합니다.
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler //
);

function RevenueChart() {
  const data = {
    labels: ['1월', '2월', '3월', '4월', '5월', '6월'],
    datasets: [
      {
        label: '통관 건수',
        data: [150, 180, 250, 220, 280, 310],
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
        fill: true,
        tension: 0.4, // 곡선 부드럽게
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: false,
        text: '월별 통관 처리량',
      },
    },
    maintainAspectRatio: false, // 컨테이너 크기에 맞게 조절
  };

  return (
    <div className='bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl border
    border-slate-200/50 dark:border-slate-700/50 p-6'>
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h3 className='text-xl font-bold text-slate-800 dark:text-white'>
            월별 통관 처리량
          </h3>
          <p className='text-sm text-slate-500 dark:text-slate-400'>
            최근 6개월 간의 통관 추세
          </p>
        </div>
      </div>
      <div className='h-80'>
        <Line data={data} options={options} />
      </div>
    </div>
  );
}

export default RevenueChart;