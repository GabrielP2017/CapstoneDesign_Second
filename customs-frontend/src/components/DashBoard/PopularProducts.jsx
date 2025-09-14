// src/components/DashBoard/PopularProducts.jsx

import React from 'react';
import { TrendingUp, MoreHorizontal } from 'lucide-react';

const popularProducts = [
  {
    name: '아이폰 16 프로',
    discount: '15%',
    revenue: '$12,345',
    trend: 'up',
  },
  {
    name: '맥북 16 프로',
    discount: '10%',
    revenue: '$10,230',
    trend: 'up',
  },
  {
    name: '에어팟 맥스',
    discount: '5%',
    revenue: '$8,765',
    trend: 'down',
  },
];

const getTrendIconColor = (trend) => {
  return trend === 'up' ? 'text-emerald-500' : 'text-red-500';
};

function PopularProducts() {
  return (
    <div className='p-6 border-t border-slate-200/50 dark:border-slate-700/50'>
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h3 className='text-lg font-bold text-slate-800 dark:text-white'>
            인기 상품
          </h3>
          <p className='text-sm text-slate-500 dark:text-slate-400'>
            지난 주 가장 많이 팔린 상품
          </p>
        </div>
        <button className='text-blue-600 hover:text-blue-700 text-sm font-medium'>
          전체 보기
        </button>
      </div>

      <div className='p-2 space-y-4'>
        {popularProducts.map((product, index) => (
          <div
            key={index}
            className='flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors'
          >
            <div className='flex-1'>
              <h4 className='text-sm font-semibold text-slate-800 dark:text-white'>
                {product.name}
              </h4>
              <p className='text-xs text-slate-500 dark:text-slate-400'>
                {product.discount} 할인
              </p>
            </div>
            <div className='text-right'>
              <p className='text-sm font-semibold text-slate-800 dark:text-white'>
                {product.revenue}
              </p>
              <div className='flex items-center space-x-1 mt-1 justify-end'>
                <TrendingUp className={`w-4 h-4 ${getTrendIconColor(product.trend)}`} />
                <span className={`text-xs font-medium ${getTrendIconColor(product.trend)}`}>
                  {product.trend === 'up' ? '+5.3%' : '-2.1%'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PopularProducts;