import React from 'react'
import StatsGrid from './StatsGrid'
import ChartSection from './ChartSection';
import TableSection from './TableSection';
import ActivityFeed from './ActivityFeed';
import TrackingStatus from './TrackingStatus';

function Dashboard({ onTrackingNumberClick }) {
	return (
		<div className='space-y-6'>

			{/* FastAPI 연동 */}
			<TrackingStatus />

			{/* 차트 */}
			<ChartSection />

			{/* 통계 */}
			<StatsGrid />

			<div className='grid grid-cols-1 xl:grid-cols-3 gap-6'>
				<div className='xl:col-span-2'>
					<TableSection />
				</div>
				<div>
					<ActivityFeed onTrackingNumberClick={onTrackingNumberClick} />
				</div>
			</div>
		</div>
	);
}

export default Dashboard
