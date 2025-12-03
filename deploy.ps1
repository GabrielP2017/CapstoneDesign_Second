# Cargomon.kr 배포 스크립트 (PowerShell)
# 사용법: .\deploy.ps1 [backend|frontend|all]

param(
    [string]$Target = "all"
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Cargomon.kr 배포 시작..." -ForegroundColor Green

# 백엔드 배포
if ($Target -eq "backend" -or $Target -eq "all") {
    Write-Host "📦 백엔드 배포 중..." -ForegroundColor Cyan
    Set-Location backend
    
    # 가상환경 확인 및 생성
    if (-not (Test-Path "venv")) {
        Write-Host "가상환경 생성 중..." -ForegroundColor Yellow
        python -m venv venv
    }
    
    # 가상환경 활성화
    & .\venv\Scripts\Activate.ps1
    
    # 의존성 설치
    Write-Host "의존성 설치 중..." -ForegroundColor Yellow
    pip install -r requirements.txt
    
    # 환경 변수 확인
    if (-not (Test-Path ".env")) {
        Write-Host "⚠️  경고: .env 파일이 없습니다. .env.example을 참고하여 생성하세요." -ForegroundColor Yellow
    }
    
    Write-Host "✅ 백엔드 준비 완료" -ForegroundColor Green
    Write-Host "백엔드 실행 명령: uvicorn 17web:app --host 0.0.0.0 --port 8000"
    Set-Location ..
}

# 프론트엔드 배포
if ($Target -eq "frontend" -or $Target -eq "all") {
    Write-Host "📦 프론트엔드 빌드 중..." -ForegroundColor Cyan
    Set-Location customs-frontend
    
    # 의존성 설치
    if (-not (Test-Path "node_modules")) {
        Write-Host "npm 패키지 설치 중..." -ForegroundColor Yellow
        npm install
    }
    
    # 환경 변수 확인
    if (-not (Test-Path ".env.production")) {
        Write-Host "⚠️  경고: .env.production 파일이 없습니다." -ForegroundColor Yellow
        Write-Host "   .env.production.example을 참고하여 생성하세요."
    }
    
    # 프로덕션 빌드
    Write-Host "빌드 중..." -ForegroundColor Yellow
    npm run build
    
    Write-Host "✅ 프론트엔드 빌드 완료" -ForegroundColor Green
    Write-Host "빌드 결과물: customs-frontend/dist"
    Set-Location ..
}

Write-Host ""
Write-Host "✨ 배포 준비 완료!" -ForegroundColor Green
Write-Host ""
Write-Host "다음 단계:"
Write-Host "1. 백엔드: uvicorn 17web:app --host 0.0.0.0 --port 8000"
Write-Host "2. 프론트엔드: dist 폴더를 웹 서버에 배포"
Write-Host "3. DNS 및 SSL 설정 확인"

