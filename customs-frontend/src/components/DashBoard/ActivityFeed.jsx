// src/components/DashBoard/ActivityFeed.jsx

import React, { useState } from 'react';
import {
  CheckCircle,
  Clock,
  Package,
  XCircle,
  Truck,
  Search,
  Filter,
  ChevronDown,
} from 'lucide-react';

const activities = [
  {
    id: 1,
    title: '통관 완료 - #20240913-001',
    description: '상품(스마트워치)의 통관이 완료되었습니다. 배송이 시작됩니다.',
    time: '5분 전',
    icon: CheckCircle,
    color: 'text-green-500',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    status: '통관 완료',
  },
  {
    id: 2,
    title: '배송 중 - #20240912-002',
    description: '상품(무선 이어폰)이 배송을 위해 출발했습니다.',
    time: '2시간 전',
    icon: Truck,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    status: '배송 중',
  },
  {
    id: 3,
    title: '세관 보류 - #20240911-003',
    description: '상품(노트북)에 대한 서류 보완이 필요합니다. 관리자에게 문의하세요.',
    time: '하루 전',
    icon: Package,
    color: 'text-amber-500',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    status: '세관 보류',
  },
  {
    id: 4,
    title: '통관 완료 - #20240910-004',
    description: '상품(마우스)의 통관이 완료되었습니다.',
    time: '2일 전',
    icon: CheckCircle,
    color: 'text-green-500',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    status: '통관 완료',
  },
  {
    id: 5,
    title: '반송 - #20240909-005',
    description: '상품(키보드)이 주소지 오류로 인해 반송 처리되었습니다.',
    time: '3일 전',
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    status: '반송',
  },
];

function ActivityFeed() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('전체');

  // 중복 없는 상태 목록 추출
  const uniqueStatuses = ['전체', ...new Set(activities.map(a => a.status))];

  const filteredActivities = activities.filter(activity => {
    const matchesSearch = activity.description
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesFilter = statusFilter === '전체' || activity.status === statusFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className='bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl border
    border-slate-200/50 dark:border-slate-700/50'>
      <div className='p-6 border-b border-slate-200/50 dark:border-slate-700/50'>
        <div className='flex items-center justify-between'>
          <div>
            <h3 className='text-lg font-bold text-slate-800 dark:text-white'>
              활동 피드
            </h3>
            <p className='text-sm text-slate-500 dark:text-slate-400'>
              Recent System Activities
            </p>
          </div>
          <button className='text-blue-600 hover:text-blue-700 text-sm font-medium'>
            전체 보기
          </button>
        </div>
        {/* 검색 및 필터 UI 추가 */}
        <div className='flex items-center space-x-2 mt-4'>
          <div className='relative flex-1'>
            <div className='absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none'>
              <Search className='w-4 h-4 text-slate-400' />
            </div>
            <input
              type='text'
              placeholder='활동 검색...'
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className='w-full pl-9 pr-3 py-2 rounded-xl text-sm bg-slate-100 dark:bg-slate-800
              placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500'
            />
          </div>
          <div className='relative'>
            <div className='absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none'>
              <Filter className='w-4 h-4 text-slate-400' />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className='w-full pl-9 pr-3 py-2 rounded-xl text-sm bg-slate-100 dark:bg-slate-800
              text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none'
            >
              {uniqueStatuses.map(status => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <div className='absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none'>
              <ChevronDown className='w-4 h-4 text-slate-400' />
            </div>
          </div>
        </div>
      </div>
      <div className='p-6'>
        <div className='space-y-4'>
          {filteredActivities.length > 0 ? (
            filteredActivities.map((activity) => (
              <div
                key={activity.id}
                className='flex items-start space-x-4 p-3 rounded-xl hover:bg-slate-50
              dark:hover:bg-slate-800/50 transition-colors'
              >
                <div className={`p-2 rounded-lg ${activity.bgColor}`}>
                  <activity.icon className={`w-5 h-5 ${activity.color}`} />
                </div>
                <div className='flex-1 min-w-0'>
                  <h4 className='text-sm font-semibold text-slate-800 dark:text-white'>
                    {activity.title}
                  </h4>
                  <p className='text-sm text-slate-600 dark:text-slate-400 truncate'>
                    {activity.description}
                  </p>
                  <div className='flex items-center-safe space-x-1 mt-1'>
                    <Clock className='w-3 h-3 text-slate-400' />
                    <span className='text-xs text-slate-500 dark:text-slate-400'>
                      {activity.time}
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className='text-center text-slate-500 dark:text-slate-400'>
              일치하는 활동이 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ActivityFeed;