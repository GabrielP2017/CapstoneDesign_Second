## 기술 스택·아키텍처(예시)

BE: FastAPI + PostgreSQL/Timescale(롤업) + Celery/APS(스케줄), Requests/HTTPX + Pydantic.

FE: React + Recharts/visx, Tailwind, SWR/React Query.

데이터 소스: UPS/DHL/FedEx(공식 포털) + UNI-PASS 오픈API + (옵션) AfterShip/17TRACK 웹훅. 

컴플라이언스: 개인식별 최소(송장·전화·이메일 저장 금지), 근거 링크 고정 노출(관세청·캐리어 공지).

## 팀 편성및 역할(예시)

- BE1(캐리어 연동 A): DHL/UPS 트래킹 API 연동·웹훅/폴링, 인증·쿼터·리트라이.

- BE2(캐리어 연동 B): FedEx Track(폴링 10k/일) 연동, 이벤트 스키마 표준화.

- BE3(데이터·통계): 이벤트→통관 구간(입항→통관진행→통관완료) 추출, 중간값/p90/N/95% CI(부트스트랩), 스파이크 탐지(7일 vs 4주).

- BE4(규정·세금·알림): UNI-PASS 조회, 관세 기준/면세/합산과세 규칙 엔진, 법·규제/서비스 알림 수집(관세청·UPS/FedEx/DHL) 및 분류. 

- FE1(대시보드): 허브/노선/업체 카드(중간값·p90·N·CI·전주대비), 히트맵·스파크라인.

- FE2(사전·비교·알림 UI): 사전 리스크/세금 위저드, 국내가 vs 직구 총비용 비교(사용자 입력 국내가 기준), 알림 센터.

---

| 코드 | 마일스톤               | 기간(월/일)     | 핵심 목표                                       | DoD(요약)                                                           |
| -- | ------------------ | ----------- | ------------------------------------------- | ----------------------------------------------------------------- |
| M0 | 프로젝트 세팅            | 09/01–09/07 | 리포지토리, CI/CD, 비밀키/권한, 라벨·보드                 | CI 녹색, 환경변수/시크릿 정리, 이슈 템플릿 반영, 라벨/보드 생성                           |
| M1 | 캐리어/정부 키 & 이벤트 표준화 | 09/08–09/21 | DHL·UPS·FedEx·UNI-PASS 온보딩, **상태문구→공통코드** 맵 | 각 소스에서 샘플 50건 수집, `ARRIVAL/CUSTOMS_IN_PROGRESS/CLEARED` 매핑 커버≥95% |
| M2 | 통관구간 산출 & 통계 엔진    | 09/22–10/05 | 구간(입항→통관완료) 추출, **median/p90/N/CI95** 함수    | 음수/중복/역순 이벤트 방어, 부트스트랩 CI(1,000회) 검증, 단위테스트 p95<1s                |
| M3 | 대시보드 MVP           | 10/06–10/19 | 카드( median/p90/N/CI/Δ4w ), 히트맵, 스파크라인       | API p95<300ms, 빈·저신뢰(N<30) 스타일 처리, 접근성 탭/키보드 동작                   |
| M4 | 사전 리스크·세금 위저드      | 10/20–11/02 | 품목/국가/운송/가격 입력→ **반입 라벨+예상세액**              | 면세(150\$/US200\$) 규칙 반영·출처 링크, 예시 20건 스냅샷 리포트                     |
| M5 | 법·규제/서비스 알림 수집     | 11/03–11/09 | 관세청/UPS/FedEx/DHL 공지 파서, **예고 경보** 카드       | 출처·시점·카테고리(세금/서류/검역/운임/파업/기상) 태깅, 중복머지 규칙                         |
| M6 | 국내가 vs 직구 총비용 비교   | 11/10–11/16 | 국내가 입력→ CIF+관세·부가세 비교                       | 계산 로직 문서화·출처 링크, 10건 회귀테스트(경계값)                                   |
| M7 | 베타·보안·성능           | 11/17–11/23 | 이메일/웹푸시 알림, 로그/PII 최소화, 캐시                  | PII 미저장(송장 해시), 알림 쿨다운, p95<300ms·에러율<1%                          |
| M8 | 릴리스 버퍼/QA          | 11/24–11/30 | 회귀·접근성·문서 마감                                | 체계적 회귀표, 사용자 가이드/면책·근거 고정                                         |

## 로컬 연동 실행 가이드

1. 백엔드(FastAPI)
   - 터미널 gitbash 열기
   - `cd backend`
	 - venv 폴더없으면 `python -m venv venv`
   - `source ./venv/Scripts/Activate` ((venv)라고 뜨면 성공)
   - 필요한 패키지 설치: `pip install -r requirements.txt` (또는 README 상단 명령 참고)
   - backend 폴더에 백엔드 .env 파일 없으면 넣기.
   - 개발 서버 실행: `uvicorn 17web:app --reload --port 8000`

2. 프론트엔드(Vite)
   - 터미널 gitbash 열기
   - `cd customs-frontend`
   - 의존성 설치: `npm install`
   - customs-frontend 폴더에 프론트엔드 .env 파일 없으면 넣기.
   - `npm run dev`로 개발 서버 실행 (기본 포트 5173)
   - `.env`에 `VITE_API_BASE_URL=http://localhost:8000`를 설정하면 다른 포트/도메인에서도 활용 가능

FastAPI 앱에는 CORS가 활성화되어 있으며, 프론트엔드의 `TrackingStatus` 카드에서 `/debug/normalize`와 `/test/webhook`을 직접 호출해 상태를 확인할 수 있습니다.

---

백엔드 : uvicorn 17web:app --reload --port 8000

프론트 : npm run dev

## 로컬 배포 가이드
1. 백엔드(FastAPI)
   - 추가한 pip 라이브러리가 있다면 있다면 venv 활성화된 상태에서 `pip freeze > requirements.txt`

## ML 분석 
- 시뮬레이션 돌리실 때 필요한 라이브러리
```
pip install pandas numpy scipy scikit-learn lightgbm
```

## 현 시뮬레이션 문제점
- DB의 진짜 배송 데이터로 미리 학습하고 유저 요청 시엔 예측만 빠르게 수행해야 하지만 현재는 테스트라서 매번 전체 과정을 반복
- 가짜로 모델 학습 -> 고른 날짜를 기준으로 예측

## 향후 계획
- ShipmentEvent 테이블에 이미 저장 중인 통관/배송 이벤트 활용
- Be4 작성
- API 연동
- 최소 3개월치 데이터 필요
- 필요 정보: hub, carrier, origin, 입항시간, 통관완료시간, 배송완료시간
- DB에서 데이터 추출 쿼리 작성
- TestDataGenerator.generate_normal_data()를 DB 쿼리로 교체가 다음 해야할 일로 에상
