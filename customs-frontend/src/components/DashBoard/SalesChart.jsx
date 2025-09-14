// src/components/DashBoard/SalesChart.jsx

import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

// Chart.js에 필요한 요소들을 등록합니다.
ChartJS.register(ArcElement, Tooltip, Legend);

function SalesChart() {
  const data = {
    labels: ['통관 완료', '통관 진행 중', '세관 보류', '반송'],
    datasets: [
      {
        label: '건수',
        data: [150, 80, 25, 15],
        backgroundColor: [
          'rgba(75, 192, 192, 0.8)', // 통관 완료 (청록색)
          'rgba(54, 162, 235, 0.8)', // 통관 진행 중 (파란색)
          'rgba(255, 206, 86, 0.8)', // 세관 보류 (노란색)
          'rgba(255, 99, 132, 0.8)', // 반송 (빨간색)
        ],
        borderColor: [
          'rgba(75, 192, 192, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(255, 99, 132, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right', // 범례 위치
      },
      title: {
        display: false,
      },
    },
  };

  return (
    <div className='bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl p-6
    border border-slate-200/50 dark:border-slate-700/50'>
      <div className='mb-6'>
        <h3 className='text-lg font-bold text-slate-800 dark:text-white'>
          통관 상태별 건수
        </h3>
        <p className='text-sm text-slate-500 dark:text-slate-400'>
          총 270건의 통관 내역
        </p>
      </div>
      <div className='h-48 flex items-center justify-center'>
        <Doughnut data={data} options={options} />
      </div>
    </div>
  );
}

export default SalesChart;