import { Bell, ChevronDown, Filter, Menu, Plus, Search, Settings, Sun } from 'lucide-react'
import React from 'react'

function Header({ sideBarCollapsed, onToggleSidebar }) {
  return (
    <div className='bg-white/80 dark:bg-slate-900/80 backdrop:backdrop-blur-xl border-b
    border-slate-200/50 dark:border-slate-700/50 px-6 py-4'>
      <div className='flex items-center justify-between'>
        {/* 왼쪽 영역 */}
        <div className='flex items-center sapce-x-4'>
          <button 
						className='p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100
						dark:hover:bg-slate-800 transition-colors' 
						onClick={onToggleSidebar}
					>
            <Menu className='w-5 h-5' />
          </button>

          <div className='hidden md:block'>
            <h1 className='text-2xl font-black text-slate-800 dark:text-white'>
              통관 알리미 대쉬보드
            </h1>
            <p>환영합니다 관리자 차민욱님! 오늘의 일정을 확인하세요!</p>
          </div>
        </div>

        {/* 가운데 영역 */}
        <div className='flex-1 max-w-md mx-8'>
          <div className='relative'>
            <Search className='w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2
            text-slate-400' />
            <input 
              type='text' 
              placeholder='통관번호를 입력하세요' 
              className='w-full pl-10 pr-4 py-2.5 bg-slate-100 dark:bg-slate-800 border 
              border-slate-200 dark:border-slate-700 rounded-xl text-slate-800
              dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2
              focus:ring-blue-500 focus:border-transparent transition-all' 
            />
            <button className='absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5
            text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'>
              <Filter />
            </button>
          </div>
        </div>

        {/* 오른쪽 영역 */}
        <div className='flex items-center space-x-3'>
          <button className='hidden lg:flex items-center space-x-2 py-2 px-4 bg-gradient-to-r
          from-blue-500 to-purple-600 text-white rounded-xl hover:shadow-lg transition-all'>
            <Plus className='w-4 h-4' />
            <span className='text-sm font-medium'>생성</span>
          </button>

          {/* 토글 */}
          <button className='p-2.5 rounded-xl text-slate-600 dark:text-slate-300
          hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors'>
            <Sun className='w-5 h-5' />
          </button>

          {/* 알림 */}
          <button className='relative p-2.5 rounded-xl text-slate-600 dark:text-slate-300
          hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors'>
            <Bell className='w-5 h-5' />
            <span className='absolute -top-1 w-5 h-5 bg-red-500 text-white text-xs
            rounded-full flex items-center justify-center'>
              3
            </span>
          </button>

          {/* 세팅 */}
          <button className='p-2.5 rounded-xl text-slate-600 dark:text-slate-300
          hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors'>
            <Settings className='w-5 h-5' />
          </button>

          {/* 유저 프로필 - 이 부분은 필요없을 시 삭제해도 상관없음 */}
          <div className='flex items-center space-x-3 pl-3 border-1 border-slate-200
          dark:border-slate-700'>
            <img 
              src='https://mblogthumb-phinf.pstatic.net/MjAyMDAyMTBfODAg/MDAxNTgxMzA0MTE3ODMy.ACRLtB9v5NH-I2qjWrwiXLb7TeUiG442cJmcdzVum7cg.eTLpNg_n0rAS5sWOsofRrvBy0qZk_QcWSfUiIagTfd8g.JPEG.lattepain/1581304118739.jpg?type=w800'
              alt='User'
              className='w-8 h-8 rounded-full ring-2 ring-blue-500'
            />
            <div className='hidden md:block'>
              <p className='text-sm font-medium text-slate-500 dark:text-slate-400'>
                차민욱
              </p>
              <p className='text-xs text-slate-500 dark:text-slate-400'>
                프론트엔드 총관리자 및 웹 디자이너
              </p>
            </div>
            <ChevronDown className='w-4 h-4 text-slate-400' />
          </div>
        </div>
      </div>
    </div>
  )
}

export default Header