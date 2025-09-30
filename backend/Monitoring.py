# 시뮬레이션 코드 (아직 연동 없음)

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass
from enum import Enum
import warnings
import json
from scipy import stats
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import LabelEncoder, StandardScaler
import lightgbm as lgb

warnings.filterwarnings('ignore')

# 이벤트 코드 정의
class EventCode(Enum):
    ARRIVAL_KR = "ARRIVAL_KR" # 한국 입항
    CUSTOMS_START = "CUSTOMS_START" # 통관 시작
    CUSTOMS_CLEARED = "CUSTOMS_CLEARED" # 통관 완료
    DELIVERY_START = "DELIVERY_START" # 배송 시작
    DELIVERED = "DELIVERED" # 배송 완료

# 스파이크 탐지 설정
@dataclass
class SpikeConfig:
    delta_threshold: float = 0.40 # 40% 증가시 스파이크
    z_score_threshold: float = 2.5 # z-score 임계값
    p90_threshold: float = 0.30 # P90 30% 증가시 스파이크
    min_sample_size: int = 30 # 최소 표본 수

# 시간 윈도우별 통계
@dataclass
class WindowStats:
    hub: str
    carrier: str
    origin: str
    window: str
    n: int
    median_h: float
    p90_h: float
    ci95_h: Tuple[float, float]
    delta_vs_baseline: float
    z_score: float
    spike: bool
    spike_reasons: List[str]
    observed_range_h: Tuple[float, float]
    
    def to_dict(self) -> Dict:
        return {
            'key': {'hub': self.hub, 'carrier': self.carrier, 'origin': self.origin},
            'window': self.window,
            'n': self.n,
            'median_h': round(self.median_h, 1),
            'p90_h': round(self.p90_h, 1),
            'ci95_h': [round(self.ci95_h[0], 1), round(self.ci95_h[1], 1)],
            'delta_vs_4w': round(self.delta_vs_baseline, 2),
            'z_score': round(self.z_score, 2) if not np.isnan(self.z_score) else None,
            'spike': self.spike,
            'spike_reasons': self.spike_reasons,
            'observed_range_h': [round(self.observed_range_h[0], 1), 
                                round(self.observed_range_h[1], 1)]
        }

# 데이터 정규화 및 전처리
class DataProcessor:

    def __init__(self, timezone: str = 'Asia/Seoul'):
        self.timezone = timezone
        
    def normalize_timestamps(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df['ts'] = pd.to_datetime(df['ts'])
        
        if df['ts'].dt.tz is None:
            df['ts'] = df['ts'].dt.tz_localize('UTC')
        df['ts'] = df['ts'].dt.tz_convert(self.timezone)
        
        return df
    
    def build_customs_windows(self, 
                            df_raw: pd.DataFrame,
                            min_hours: float = 0.1,
                            max_hours: float = 720) -> pd.DataFrame:
        
        df = self.normalize_timestamps(df_raw)
        
        arrivals = df[df['event_code'] == EventCode.ARRIVAL_KR.value].copy()
        arrivals = arrivals.sort_values(['shipment_id', 'ts']).groupby('shipment_id').first().reset_index()
        arrivals = arrivals[['shipment_id', 'hub', 'carrier', 'origin', 'destination_city', 'ts']]
        arrivals.rename(columns={'ts': 'arrival_ts'}, inplace=True)
        
        cleared = df[df['event_code'] == EventCode.CUSTOMS_CLEARED.value].copy()
        cleared = cleared.sort_values(['shipment_id', 'ts']).groupby('shipment_id').first().reset_index()
        cleared = cleared[['shipment_id', 'ts']]
        cleared.rename(columns={'ts': 'cleared_ts'}, inplace=True)
        
        merged = pd.merge(arrivals, cleared, on='shipment_id', how='inner')
        
        merged['hours'] = (merged['cleared_ts'] - merged['arrival_ts']).dt.total_seconds() / 3600
        
        valid_mask = (merged['hours'] > min_hours) & (merged['hours'] < max_hours)
        valid = merged[valid_mask].reset_index(drop=True)
        
        print(f"통관 윈도우 생성 완료: {len(valid)}/{len(merged)} 유효 송장")
        if len(merged) > len(valid):
            invalid_count = len(merged) - len(valid)
            print(f"  - {invalid_count}개 필터됨 (음수 또는 {max_hours}시간 초과)")
            
        return valid

    def build_delivery_windows(self, 
                             df_raw: pd.DataFrame,
                             min_hours: float = 1,
                             max_hours: float = 336) -> pd.DataFrame:
        
        df = self.normalize_timestamps(df_raw)
        
        cleared = df[df['event_code'] == EventCode.CUSTOMS_CLEARED.value].copy()
        cleared = cleared.sort_values(['shipment_id', 'ts']).groupby('shipment_id').first().reset_index()
        cleared = cleared[['shipment_id', 'hub', 'carrier', 'origin', 'destination_city', 'ts']]
        cleared.rename(columns={'ts': 'cleared_ts'}, inplace=True)
        
        delivered = df[df['event_code'] == EventCode.DELIVERED.value].copy()
        delivered = delivered.sort_values(['shipment_id', 'ts']).groupby('shipment_id').first().reset_index()
        delivered = delivered[['shipment_id', 'ts']]
        delivered.rename(columns={'ts': 'delivered_ts'}, inplace=True)
        
        merged = pd.merge(cleared, delivered, on='shipment_id', how='inner')
        
        merged['hours'] = (merged['delivered_ts'] - merged['cleared_ts']).dt.total_seconds() / 3600
        
        valid_mask = (merged['hours'] > min_hours) & (merged['hours'] < max_hours)
        valid = merged[valid_mask].reset_index(drop=True)
        
        print(f"국내 배송 윈도우 생성 완료: {len(valid)}/{len(merged)} 유효 송장")
        if len(merged) > len(valid):
            invalid_count = len(merged) - len(valid)
            print(f"  - {invalid_count}개 필터됨 (음수 또는 {max_hours}시간 초과)")
            
        return valid

    def winsorize(self, values: pd.Series, 
                 lower_quantile: float = 0.01,
                 upper_quantile: float = 0.99,
                 min_samples: int = 50) -> pd.Series:
        if len(values) < min_samples:
            return values.clip(0.1, 720)
            
        q_low, q_high = values.quantile([lower_quantile, upper_quantile])
        return values.clip(q_low, q_high)


# 통계 계산 엔진
class StatisticsEngine:

    @staticmethod
    def bootstrap_ci(values: np.ndarray,
                    statistic=np.median,
                    confidence: float = 0.95,
                    n_bootstrap: int = 1000,
                    random_state: int = 42) -> Tuple[float, float]:
        if len(values) == 0:
            return (np.nan, np.nan)
            
        rng = np.random.RandomState(random_state)
        bootstrap_samples = []
        
        for _ in range(n_bootstrap):
            sample = rng.choice(values, size=len(values), replace=True)
            bootstrap_samples.append(statistic(sample))
            
        alpha = 1 - confidence
        lower = np.percentile(bootstrap_samples, 100 * alpha / 2)
        upper = np.percentile(bootstrap_samples, 100 * (1 - alpha / 2))
        
        return float(lower), float(upper)
    
    @staticmethod
    def calculate_mad(values: np.ndarray) -> float:
        if len(values) == 0:
            return np.nan
        median = np.median(values)
        mad = np.median(np.abs(values - median))
        return float(mad)
    
    @staticmethod
    def calculate_group_stats(df: pd.DataFrame,
                             value_col: str = 'hours',
                             n_bootstrap: int = 1000) -> Dict:
        if len(df) == 0:
            return {
                'n': 0, 'median': np.nan, 'p90': np.nan,
                'ci95': (np.nan, np.nan), 'mad': np.nan,
                'min': np.nan, 'max': np.nan
            }
            
        values = df[value_col].values
        
        return {
            'n': len(values),
            'median': float(np.median(values)),
            'p90': float(np.percentile(values, 90)),
            'ci95': StatisticsEngine.bootstrap_ci(values, n_bootstrap=n_bootstrap),
            'mad': StatisticsEngine.calculate_mad(values),
            'min': float(np.min(values)),
            'max': float(np.max(values))
        }


# 다중 방법론 기반으로 한 스파이크 탐지
class SpikeDetector:
    
    def __init__(self, config: SpikeConfig = None):
        self.config = config or SpikeConfig()
    
    def detect(self, 
              recent_stats: Dict,
              baseline_stats: Dict) -> Tuple[bool, List[str]]:
        
        spike = False
        reasons = []
        
        if (recent_stats['n'] < self.config.min_sample_size or 
            baseline_stats['n'] < self.config.min_sample_size):
            return False, ['insufficient_samples']
            
        if baseline_stats['median'] > 0:
            delta = (recent_stats['median'] / baseline_stats['median']) - 1
            if delta >= self.config.delta_threshold:
                spike = True
                reasons.append(f'delta_{delta:.1%}')
                
        if baseline_stats['mad'] > 0:
            z_score = (recent_stats['median'] - baseline_stats['median']) / baseline_stats['mad']
            if z_score >= self.config.z_score_threshold:
                spike = True
                reasons.append(f'z_score_{z_score:.1f}')
                
        if baseline_stats['p90'] > 0:
            p90_delta = (recent_stats['p90'] / baseline_stats['p90']) - 1
            if p90_delta >= self.config.p90_threshold:
                spike = True
                reasons.append(f'p90_{p90_delta:.1%}')
                
        return spike, reasons

# 머신러닝 기반 이상탐지
class MLAnomalyDetector:
    
    def __init__(self):
        self.isolation_forest = IsolationForest(contamination=0.1, random_state=42, n_estimators=100)
        self.scaler = StandardScaler()
        self.is_fitted = False

    def prepare_features(self, df: pd.DataFrame, ts_col: str) -> np.ndarray:
        features = []
        for _, row in df.iterrows():
            ts = row[ts_col]
            feat = [
                row['hours'],
                ts.hour,
                ts.dayofweek,
                ts.month,
                1 if ts.dayofweek >= 5 else 0,
            ]
            features.append(feat)
        return np.array(features)

    def fit(self, df_historical: pd.DataFrame, ts_col: str):
        X = self.prepare_features(df_historical, ts_col)
        X_scaled = self.scaler.fit_transform(X)
        self.isolation_forest.fit(X_scaled)
        self.is_fitted = True

    def predict_anomalies(self, df: pd.DataFrame, ts_col: str) -> np.ndarray:
        if not self.is_fitted:
            return np.array([False] * len(df))
        X = self.prepare_features(df, ts_col)
        X_scaled = self.scaler.transform(X)
        predictions = self.isolation_forest.predict(X_scaled)
        return predictions == -1

# 통관 시간 예측 모델
class ClearancePredictor:
    
    def __init__(self):
        self.model_p50 = None
        self.model_p90 = None
        self.label_encoders = {}
        self.is_fitted = False

    def prepare_features(self, df: pd.DataFrame) -> pd.DataFrame:
        features = pd.DataFrame(index=df.index)
        
        for col in ['hub', 'carrier', 'origin']:
            if col not in self.label_encoders:
                self.label_encoders[col] = LabelEncoder()
                features[f'{col}_encoded'] = self.label_encoders[col].fit_transform(df[col])
            else:
                features[f'{col}_encoded'] = df[col].apply(
                    lambda x: self.label_encoders[col].transform([x])[0] 
                    if x in self.label_encoders[col].classes_ else -1
                )
        
        features['hour'] = df['arrival_ts'].dt.hour
        features['day_of_week'] = df['arrival_ts'].dt.dayofweek
        features['month'] = df['arrival_ts'].dt.month
        features['is_weekend'] = (df['arrival_ts'].dt.dayofweek >= 5).astype(int)
        
        kr_holidays = ['2025-01-01', '2025-02-08', '2025-02-09', '2025-02-10', '2025-09-15', '2025-09-16', '2025-09-17']
        features['is_holiday'] = df['arrival_ts'].dt.date.astype(str).isin(kr_holidays).astype(int)
        
        return features
    
    def train(self, df_historical: pd.DataFrame):
        X = self.prepare_features(df_historical)
        y = df_historical['hours']
        
        self.model_p50 = lgb.LGBMRegressor(objective='quantile', alpha=0.5, n_estimators=100, random_state=42, verbose=-1)
        self.model_p50.fit(X, y)
        
        self.model_p90 = lgb.LGBMRegressor(objective='quantile', alpha=0.9, n_estimators=100, random_state=42, verbose=-1)
        self.model_p90.fit(X, y)
        
        self.is_fitted = True
     
    def predict(self, df: pd.DataFrame) -> pd.DataFrame:
        if not self.is_fitted:
            return pd.DataFrame({'predicted_clearance_median_h': [], 'predicted_clearance_p90_h': []})
            
        X = self.prepare_features(df)
        
        predictions = pd.DataFrame({
            'predicted_clearance_median_h': self.model_p50.predict(X),
            'predicted_clearance_p90_h': self.model_p90.predict(X)
        })
        
        return predictions

# 국내 배송 시간 예측 모델
class DeliveryPredictor:
    
    def __init__(self):
        self.model_p50 = None
        self.model_p90 = None
        self.label_encoders = {}
        self.is_fitted = False

    def prepare_features(self, df: pd.DataFrame) -> pd.DataFrame:
        features = pd.DataFrame(index=df.index)
        
        for col in ['hub', 'carrier', 'destination_city']:
            if col not in self.label_encoders:
                self.label_encoders[col] = LabelEncoder()
                features[f'{col}_encoded'] = self.label_encoders[col].fit_transform(df[col])
            else:
                features[f'{col}_encoded'] = df[col].apply(
                    lambda x: self.label_encoders[col].transform([x])[0] 
                    if x in self.label_encoders[col].classes_ else -1
                )
        
        # 통관 완료 시점 기준 시간 특징
        ts_col = 'cleared_ts'
        features['hour'] = df[ts_col].dt.hour
        features['day_of_week'] = df[ts_col].dt.dayofweek
        features['month'] = df[ts_col].dt.month
        features['is_weekend'] = (df[ts_col].dt.dayofweek >= 5).astype(int)
        
        kr_holidays = ['2025-01-01', '2025-02-08', '2025-02-09', '2025-02-10', '2025-09-15', '2025-09-16', '2025-09-17']
        features['is_holiday'] = df[ts_col].dt.date.astype(str).isin(kr_holidays).astype(int)
        
        return features
    
    def train(self, df_historical: pd.DataFrame):
        X = self.prepare_features(df_historical)
        y = df_historical['hours']
        
        self.model_p50 = lgb.LGBMRegressor(objective='quantile', alpha=0.5, n_estimators=100, random_state=42, verbose=-1)
        self.model_p50.fit(X, y)
        
        self.model_p90 = lgb.LGBMRegressor(objective='quantile', alpha=0.9, n_estimators=100, random_state=42, verbose=-1)
        self.model_p90.fit(X, y)
        
        self.is_fitted = True
     
    def predict(self, df: pd.DataFrame) -> pd.DataFrame:
        if not self.is_fitted:
            return pd.DataFrame({'predicted_delivery_median_h': [], 'predicted_delivery_p90_h': []})

        # 예측 시점에는 cleared_ts가 없으므로 arrival_ts를 기반으로 추정
        df_pred = df.copy()
        if 'cleared_ts' not in df_pred.columns:
             # 임시로 arrival_ts + 평균 통관 시간으로 가정. 더 정교한 추정 가능
            df_pred['cleared_ts'] = df_pred['arrival_ts'] + pd.to_timedelta(48, unit='h')
            
        X = self.prepare_features(df_pred)
        
        predictions = pd.DataFrame({
            'predicted_delivery_median_h': self.model_p50.predict(X),
            'predicted_delivery_p90_h': self.model_p90.predict(X)
        })
        
        return predictions

# BE3 통관 모니터링 및 예측 통합 파이프라인
class BE3Pipeline:
    
    def __init__(self, 
                timezone: str = 'Asia/Seoul',
                spike_config: SpikeConfig = None):
        self.timezone = timezone
        self.spike_config = spike_config or SpikeConfig()
        
        self.processor = DataProcessor(timezone)
        self.stats_engine = StatisticsEngine()
        self.spike_detector = SpikeDetector(spike_config)
        self.ml_detector = MLAnomalyDetector()
        self.clearance_predictor = ClearancePredictor()
        self.delivery_predictor = DeliveryPredictor()

    def process(self, 
               df_raw: pd.DataFrame,
               current_time: datetime = None) -> List[WindowStats]:
        
        if current_time is None:
            current_time = pd.Timestamp.now(tz=self.timezone)
        else:
            current_time = pd.Timestamp(current_time)
            if current_time.tzinfo is None:
                current_time = current_time.tz_localize(self.timezone)
            else:
                current_time = current_time.tz_convert(self.timezone)
            
        # 1. 통관 윈도우 생성 및 분석
        df_customs_windows = self.processor.build_customs_windows(df_raw)
        if len(df_customs_windows) == 0:
            print("경고: 유효한 통관 윈도우가 없습니다.")
            return []
            
        # 2. 국내 배송 윈도우 생성
        df_delivery_windows = self.processor.build_delivery_windows(df_raw)
            
        # 3. 기간 분할
        end_time = current_time
        start_4w = end_time - timedelta(days=28)
        
        df_customs_4w = df_customs_windows[
            (df_customs_windows['arrival_ts'] >= start_4w) & 
            (df_customs_windows['arrival_ts'] <= end_time)
        ]
        df_delivery_4w = df_delivery_windows[
            (df_delivery_windows['cleared_ts'] >= start_4w) & 
            (df_delivery_windows['cleared_ts'] <= end_time)
        ]
        
        # 4. ML 모델 학습 (4주 데이터로)
        print("\nML 모델 학습 시작...")
        if len(df_customs_4w) >= 100:
            self.ml_detector.fit(df_customs_4w, ts_col='arrival_ts')
            self.clearance_predictor.train(df_customs_4w)
            print("  - 통관 시간 예측 모델 학습 완료.")
        else:
            print("  - 통관 시간 데이터 부족으로 모델 학습 스킵.")
            
        if len(df_delivery_4w) >= 100:
            self.delivery_predictor.train(df_delivery_4w)
            print("  - 국내 배송 시간 예측 모델 학습 완료.")
        else:
            print("  - 국내 배송 시간 데이터 부족으로 모델 학습 스킵.")
        print("ML 모델 학습 완료.")

        # 5. 그룹별 통계 및 스파이크 탐지 (통관 기준)
        group_cols = ['hub', 'carrier', 'origin']
        results = []
        
        df_7d = df_customs_4w[df_customs_4w['arrival_ts'] >= (end_time - timedelta(days=7))]

        for group_key, df_group_4w in df_customs_4w.groupby(group_cols):
            mask = (df_7d['hub'] == group_key[0]) & (df_7d['carrier'] == group_key[1]) & (df_7d['origin'] == group_key[2])
            df_group_7d = df_7d[mask]
            
            if len(df_group_7d) == 0: continue
                
            hours_7d = self.processor.winsorize(df_group_7d['hours'])
            hours_4w = self.processor.winsorize(df_group_4w['hours'])
            
            stats_7d = self.stats_engine.calculate_group_stats(pd.DataFrame({'hours': hours_7d}))
            stats_4w = self.stats_engine.calculate_group_stats(pd.DataFrame({'hours': hours_4w}))
            
            spike, reasons = self.spike_detector.detect(stats_7d, stats_4w)
            
            if self.ml_detector.is_fitted:
                ml_anomalies = self.ml_detector.predict_anomalies(df_group_7d, ts_col='arrival_ts')
                ml_anomaly_rate = np.mean(ml_anomalies)
                if ml_anomaly_rate > 0.3:
                    spike = True
                    reasons.append(f'ml_anomaly_{ml_anomaly_rate:.1%}')
                    
            delta = (stats_7d['median'] / stats_4w['median'] - 1) if stats_4w['median'] > 0 else 0
            z_score = (stats_7d['median'] - stats_4w['median']) / stats_4w['mad'] if stats_4w['mad'] > 0 else 0
            
            window_stat = WindowStats(
                hub=group_key[0], carrier=group_key[1], origin=group_key[2],
                window='last_7d', n=stats_7d['n'], median_h=stats_7d['median'],
                p90_h=stats_7d['p90'], ci95_h=stats_7d['ci95'], delta_vs_baseline=delta,
                z_score=z_score, spike=spike, spike_reasons=reasons,
                observed_range_h=(stats_7d['min'], stats_7d['max'])
            )
            results.append(window_stat)
            
        return results
    
    def predict_end_to_end(self, df_new_shipments: pd.DataFrame) -> pd.DataFrame:
        if not self.clearance_predictor.is_fitted or not self.delivery_predictor.is_fitted:
            print("오류: 예측 모델이 학습되지 않았습니다. process()를 먼저 실행하세요.")
            return df_new_shipments

        df = df_new_shipments.copy()
        
        # 1. 통관 시간 예측
        clearance_predictions = self.clearance_predictor.predict(df)
        
        # 2. 국내 배송 시간 예측
        delivery_predictions = self.delivery_predictor.predict(df)
        
        # 3. 예측 결과 병합
        df = pd.concat([df.reset_index(drop=True), clearance_predictions, delivery_predictions], axis=1)
        
        # 4. 최종 ETA 계산 (P50과 P90 모두 계산)
        arrival_ts_series = pd.to_datetime(df['arrival_ts'])
        
        # P50 (Median) 계산
        df['total_predicted_median_h'] = df['predicted_clearance_median_h'] + df['predicted_delivery_median_h']
        df['predicted_clearance_ts'] = arrival_ts_series + pd.to_timedelta(df['predicted_clearance_median_h'], unit='h')
        df['predicted_eta_ts'] = arrival_ts_series + pd.to_timedelta(df['total_predicted_median_h'], unit='h')

        # P90 계산 (수정된 부분)
        df['total_predicted_p90_h'] = df['predicted_clearance_p90_h'] + df['predicted_delivery_p90_h']
        df['predicted_eta_p90_ts'] = arrival_ts_series + pd.to_timedelta(df['total_predicted_p90_h'], unit='h')

        return df

    def generate_report(self, results: List[WindowStats]) -> Dict:
        report = {
            'timestamp': datetime.now().isoformat(),
            'total_routes': len(results),
            'spike_count': sum(1 for r in results if r.spike),
            'stats': [r.to_dict() for r in results],
            'summary': {}
        }
        
        spike_routes = [r for r in results if r.spike]
        if spike_routes:
            report['summary']['spike_routes'] = [
                f"{r.hub}-{r.carrier}-{r.origin}: {', '.join(r.spike_reasons)}" for r in spike_routes
            ]
            
        if results:
            slowest = max(results, key=lambda x: x.median_h)
            report['summary']['slowest_route'] = {
                'route': f"{slowest.hub}-{slowest.carrier}-{slowest.origin}",
                'median_hours': slowest.median_h
            }
        return report

# 테스트용 데이터 생성
class TestDataGenerator:
    
    @staticmethod
    def generate_normal_data(n_days: int = 28, 
                           shipments_per_day: int = 20,
                           mean_hours_clearance: float = 40,
                           std_hours_clearance: float = 8,
                           mean_hours_delivery: float = 24,
                           std_hours_delivery: float = 6,
                           hub: str = 'ICN',
                           carrier: str = 'DHL',
                           origin: str = 'US',
                           start_date: str = '2025-08-20',
                           seed: int = 42) -> pd.DataFrame:
        np.random.seed(seed)
        rows = []
        cities = ['Seoul', 'Busan', 'Incheon', 'Daegu', 'Gwangju']
        base_date = pd.Timestamp(start_date, tz='Asia/Seoul')
        
        for day in range(n_days):
            current_date = base_date + timedelta(days=day)
            for i in range(shipments_per_day):
                shipment_id = f"NORM_{hub}_{carrier}_{origin}_{day:02d}_{i:02d}"
                destination_city = np.random.choice(cities)
                
                arrival_hour = np.random.randint(6, 18)
                arrival_time = current_date.replace(hour=arrival_hour, minute=np.random.randint(0,60))
                
                clearance_hours = max(1, np.random.normal(mean_hours_clearance, std_hours_clearance))
                cleared_time = arrival_time + timedelta(hours=clearance_hours)
                
                delivery_start_lag = np.random.uniform(2, 6) # 통관 후 2-6시간 뒤 배송 시작
                delivery_start_time = cleared_time + timedelta(hours=delivery_start_lag)
                
                delivery_hours = max(5, np.random.normal(mean_hours_delivery, std_hours_delivery))
                delivered_time = delivery_start_time + timedelta(hours=delivery_hours)
                
                common_data = [shipment_id, hub, carrier, origin, destination_city]
                rows.append(common_data + [EventCode.ARRIVAL_KR.value, arrival_time])
                rows.append(common_data + [EventCode.CUSTOMS_CLEARED.value, cleared_time])
                rows.append(common_data + [EventCode.DELIVERY_START.value, delivery_start_time])
                rows.append(common_data + [EventCode.DELIVERED.value, delivered_time])
                
        return pd.DataFrame(rows, columns=['shipment_id', 'hub', 'carrier', 'origin', 'destination_city', 'event_code', 'ts'])
    
    @staticmethod
    def generate_spike_data(n_days: int = 7,
                          shipments_per_day: int = 20,
                          mean_hours_clearance: float = 60,
                          std_hours_clearance: float = 12,
                          mean_hours_delivery: float = 30,
                          std_hours_delivery: float = 8,
                          hub: str = 'ICN',
                          carrier: str = 'DHL',
                          origin: str = 'US',
                          start_date: str = '2025-09-10',
                          seed: int = 43) -> pd.DataFrame:
        np.random.seed(seed)
        rows = []
        cities = ['Seoul', 'Busan', 'Incheon', 'Daegu', 'Gwangju']
        base_date = pd.Timestamp(start_date, tz='Asia/Seoul')
        
        for day in range(n_days):
            current_date = base_date + timedelta(days=day)
            for i in range(shipments_per_day):
                shipment_id = f"SPIKE_{hub}_{carrier}_{origin}_{day:02d}_{i:02d}"
                destination_city = np.random.choice(cities)
                
                arrival_hour = np.random.randint(6, 18)
                arrival_time = current_date.replace(hour=arrival_hour, minute=np.random.randint(0,60))
                
                if np.random.random() < 0.2:
                    clearance_hours = np.random.uniform(80, 120)
                else:
                    clearance_hours = max(1, np.random.normal(mean_hours_clearance, std_hours_clearance))
                cleared_time = arrival_time + timedelta(hours=clearance_hours)

                delivery_start_lag = np.random.uniform(3, 8)
                delivery_start_time = cleared_time + timedelta(hours=delivery_start_lag)
                
                delivery_hours = max(5, np.random.normal(mean_hours_delivery, std_hours_delivery))
                delivered_time = delivery_start_time + timedelta(hours=delivery_hours)
                
                common_data = [shipment_id, hub, carrier, origin, destination_city]
                rows.append(common_data + [EventCode.ARRIVAL_KR.value, arrival_time])
                rows.append(common_data + [EventCode.CUSTOMS_CLEARED.value, cleared_time])
                rows.append(common_data + [EventCode.DELIVERY_START.value, delivery_start_time])
                rows.append(common_data + [EventCode.DELIVERED.value, delivered_time])
                
        return pd.DataFrame(rows, columns=['shipment_id', 'hub', 'carrier', 'origin', 'destination_city', 'event_code', 'ts'])


# 종합 테스트
def run_comprehensive_test():
    print("BE3 종합 테스트 및 예측 시스템")
    
    # 1. 시나리오 기반 데이터 생성
    print("\n1. 테스트 데이터 생성")
    scenarios = [
        {'hub': 'ICN', 'carrier': 'DHL', 'origin': 'US', 'mean_c': 40, 'spike_mean_c': 60, 'mean_d': 24, 'spike_mean_d': 30},
        {'hub': 'ICN', 'carrier': 'FedEx', 'origin': 'CN', 'mean_c': 35, 'spike_mean_c': 50, 'mean_d': 22, 'spike_mean_d': 28},
        {'hub': 'GMP', 'carrier': 'UPS', 'origin': 'JP', 'mean_c': 30, 'spike_mean_c': 45, 'mean_d': 20, 'spike_mean_d': 25},
        {'hub': 'PUS', 'carrier': 'EMS', 'origin': 'EU', 'mean_c': 55, 'spike_mean_c': 85, 'mean_d': 30, 'spike_mean_d': 40},
    ]
    all_data = []
    
    for i, scenario in enumerate(scenarios):
        normal = TestDataGenerator.generate_normal_data(
            n_days=21, shipments_per_day=25,
            mean_hours_clearance=scenario['mean_c'], std_hours_clearance=scenario['mean_c'] * 0.2,
            mean_hours_delivery=scenario['mean_d'], std_hours_delivery=scenario['mean_d'] * 0.2,
            hub=scenario['hub'], carrier=scenario['carrier'], origin=scenario['origin'], seed=42+i
        )
        all_data.append(normal)
        
        spike = TestDataGenerator.generate_spike_data(
            n_days=7, shipments_per_day=25,
            mean_hours_clearance=scenario['spike_mean_c'], std_hours_clearance=scenario['spike_mean_c'] * 0.3,
            mean_hours_delivery=scenario['spike_mean_d'], std_hours_delivery=scenario['spike_mean_d'] * 0.3,
            hub=scenario['hub'], carrier=scenario['carrier'], origin=scenario['origin'], seed=142+i
        )
        all_data.append(spike)
    
    df_all = pd.concat(all_data, ignore_index=True)
    
    print(f"\n데이터 요약:")
    print(f"  - 총 이벤트: {len(df_all):,}")
    print(f"  - 송장 수: {df_all['shipment_id'].nunique():,}")
    print(f"  - 허브: {df_all['hub'].nunique()}개, 캐리어: {df_all['carrier'].nunique()}개, 출발국: {df_all['origin'].nunique()}개")
    
    # 2. 파이프라인 실행 (모니터링 및 모델 학습)
    print("\n2. 파이프라인 실행 (모니터링 & 모델 학습)")
    pipeline = BE3Pipeline()
    current_time = pd.Timestamp('2025-09-17 12:00', tz='Asia/Seoul')
    results = pipeline.process(df_all, current_time)
    
    # 3. 모니터링 결과 분석
    print("\n3. 통관 시간 모니터링 결과")
    spike_count = sum(1 for r in results if r.spike)
    print(f"\n스파이크 탐지: {spike_count}/{len(results)} 경로")
    
    for stat in results:
        if stat.spike:
            print(f"\n  [스파이크] 경로: {stat.hub}-{stat.carrier}-{stat.origin}")
            print(f"     - 중간값: {stat.median_h:.1f}시간 (4주 대비: {stat.delta_vs_baseline:+.1%})")
            print(f"     - 원인: {', '.join(stat.spike_reasons)}")

    # 4. 종합 리포트 생성
    print("\n4. 종합 리포트 (JSON 예시)")
    report = pipeline.generate_report(results)
    print(f"분석 시간: {report['timestamp']}")
    print(f"총 분석 경로: {report['total_routes']}, 스파이크 감지: {report['spike_count']}개")
    if 'slowest_route' in report['summary']:
        slowest = report['summary']['slowest_route']
        print(f"가장 느린 통관 경로: {slowest['route']} (중간값: {slowest['median_hours']:.1f}시간)")
        
    # 5. SLA 분석 (예시)
    print("\n5. SLA 준수율 분석 (예시)")
    df_windows_delivery = pipeline.processor.build_delivery_windows(df_all)
    sla_hours = 48 # 통관완료 후 48시간 내 배송완료
    df_windows_delivery['sla_compliant'] = df_windows_delivery['hours'] <= sla_hours
    sla_by_carrier = df_windows_delivery.groupby('carrier')['sla_compliant'].mean() * 100
    print(f"국내 배송 SLA ({sla_hours}시간) 준수율:")
    for carrier, rate in sla_by_carrier.items():
        print(f"  - {carrier}: {rate:.1f}%")

    # 6. 최종 도착 시간 예측 시뮬레이션
    print("\n6. 최종 도착 시간 예측 시뮬레이션")
    print("새로 도착한 화물에 대한 End-to-End 예측:")
    
    # 예측할 새로운 화물 데이터 생성 (한국에 막 도착한 상황 가정)
    new_shipments_data = [
        {'shipment_id': 'NEW_001', 'hub': 'ICN', 'carrier': 'DHL', 'origin': 'US', 'destination_city': 'Seoul', 'arrival_ts': '2025-09-17 08:00:00'},
        {'shipment_id': 'NEW_002', 'hub': 'ICN', 'carrier': 'FedEx', 'origin': 'CN', 'destination_city': 'Busan', 'arrival_ts': '2025-09-17 10:30:00'},
        {'shipment_id': 'NEW_003', 'hub': 'PUS', 'carrier': 'EMS', 'origin': 'EU', 'destination_city': 'Daegu', 'arrival_ts': '2025-09-17 11:00:00'}
    ]
    new_shipments = pd.DataFrame(new_shipments_data)
    new_shipments['arrival_ts'] = pd.to_datetime(new_shipments['arrival_ts']).dt.tz_localize('Asia/Seoul')
    
    # 예측 실행
    predictions = pipeline.predict_end_to_end(new_shipments)
    
    # 결과 출력 (수정된 부분)
    for _, row in predictions.iterrows():
        print(f"\n> 화물 ID: {row['shipment_id']} ({row['hub']}/{row['carrier']}/{row['origin']} -> {row['destination_city']})")
        print(f"  - 한국 도착 시간: {row['arrival_ts'].strftime('%Y-%m-%d %H:%M')}")
        print(f"  - 예측 통관 소요 시간 (P50~P90): {row['predicted_clearance_median_h']:.1f} ~ {row['predicted_clearance_p90_h']:.1f} 시간")
        print(f"  - 예측 국내 배송 소요 시간 (P50~P90): {row['predicted_delivery_median_h']:.1f} ~ {row['predicted_delivery_p90_h']:.1f} 시간")
        print(f"  - **예상 통관 완료 시간**: {row['predicted_clearance_ts'].strftime('%Y-%m-%d %H:%M')}")
        print(f"  - **예상 최종 배송 완료 시간 (확률적 범위)**: {row['predicted_eta_ts'].strftime('%Y-%m-%d %H:%M')} (50% 확률)  ~  {row['predicted_eta_p90_ts'].strftime('%Y-%m-%d %H:%M')} (90% 확률)")
        
    return pipeline, results


# 메인 실행
if __name__ == "__main__":
    print(" BE3 통합 물류 모니터링 및 예측 시스템 시작")
    
    # 종합 테스트 실행
    pipeline, results = run_comprehensive_test()
    
    print(" 시스템 테스트 완료")