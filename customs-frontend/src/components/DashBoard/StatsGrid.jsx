// src/components/DashBoard/StatsGrid.jsx

import React from 'react';
import { ArrowUpRight, ArrowDownRight, Package, Truck, FileText, XCircle } from 'lucide-react';

const stats = [
  {
    title: "총 통관 건수",
    value: "2,847",
    change: "+15.3%",
    trend: "up",
    icon: Package,
    color: "from-blue-500 to-indigo-600",
    bgcolor: "bg-blue-50 dark:bg-blue-900/20",
    textColor: "text-blue-600 dark:text-blue-400",
  },
  {
    title: "통관 완료 건수",
    value: "1,520",
    change: "+8.2%",
    trend: "up",
    icon: Truck,
    color: "from-emerald-500 to-teal-600",
    bgcolor: "bg-emerald-50 dark:bg-emerald-900/20",
    textColor: "text-emerald-600 dark:text-emerald-400",
  },
  {
    title: "세관 보류 건수",
    value: "58",
    change: "+2.1%",
    trend: "up",
    icon: FileText,
    color: "from-amber-500 to-orange-600",
    bgcolor: "bg-amber-50 dark:bg-amber-900/20",
    textColor: "text-amber-600 dark:text-amber-400",
  },
  {
    title: "반송 건수",
    value: "12",
    change: "-1.5%",
    trend: "down",
    icon: XCircle,
    color: "from-red-500 to-pink-600",
    bgcolor: "bg-red-50 dark:bg-red-900/20",
    textColor: "text-red-600 dark:text-red-400",
  },
];

function StatsGrid() {
  return (
    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'>
      {stats.map((stats, index) => (
        <div 
          key={index} 
          className='bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl border 
          border-slate-200/50 dark:border-slate-700/50 p-6 flex flex-col justify-between 
          transition-all duration-300 transform hover:scale-[1.02] relative group'
        >
          {/* ... (기존 JSX 구조) */}
          <div className='flex items-center justify-between'>
            <div className='flex-1'>
              <p className='text-sm font-medium text-slate-600 dark:text-slate-400 mb-2'>
                {stats.title}
              </p>
              <p className='text-3xl font-bold text-slate-800 dark:text-white mb-4'>
                {stats.value}
              </p>
              <div className='flex items-center space-x-2'>
                {stats.trend === "up" ? (
                  <ArrowUpRight className='w-4 h-4 text-emerald-500' />
                ) : (
                  <ArrowDownRight className='w-4 h-4 text-red-500' />
                )}
                <span 
                  className={`text-sm font-semibold ${
                    stats.trend === "up" ? "text-emerald-500" : "text-red-500"
                  }`}
                >
                  {stats.change}
                </span>
                <span className='text-sm text-slate-500 dark:text-slate-400'>
                  vs 지난달
                </span>
              </div>
            </div>
            <div 
              className={`p-3 rounded-xl ${stats.bgcolor} group-hover:scale-110 transition-all duration-200`}
            >
              {<stats.icon className={`w-6 h-6' ${stats.textColor}`} />}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default StatsGrid;