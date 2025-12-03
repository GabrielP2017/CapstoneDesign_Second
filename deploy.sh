#!/bin/bash

# Cargomon.kr 배포 스크립트
# 사용법: ./deploy.sh [backend|frontend|all]

set -e  # 오류 발생 시 중단

DEPLOY_TARGET=${1:-all}

echo "🚀 Cargomon.kr 배포 시작..."

# 백엔드 배포
if [ "$DEPLOY_TARGET" = "backend" ] || [ "$DEPLOY_TARGET" = "all" ]; then
    echo "📦 백엔드 배포 중..."
    cd backend
    
    # 가상환경 활성화
    if [ ! -d "venv" ]; then
        echo "가상환경 생성 중..."
        python3 -m venv venv
    fi
    
    source venv/bin/activate  # Windows: venv\Scripts\activate
    
    # 의존성 설치
    echo "의존성 설치 중..."
    pip install -r requirements.txt
    
    # 환경 변수 확인
    if [ ! -f ".env" ]; then
        echo "⚠️  경고: .env 파일이 없습니다. .env.example을 참고하여 생성하세요."
    fi
    
    echo "✅ 백엔드 준비 완료"
    echo "백엔드 실행 명령: uvicorn 17web:app --host 0.0.0.0 --port 8000"
    cd ..
fi

# 프론트엔드 배포
if [ "$DEPLOY_TARGET" = "frontend" ] || [ "$DEPLOY_TARGET" = "all" ]; then
    echo "📦 프론트엔드 빌드 중..."
    cd customs-frontend
    
    # 의존성 설치
    if [ ! -d "node_modules" ]; then
        echo "npm 패키지 설치 중..."
        npm install
    fi
    
    # 환경 변수 확인
    if [ ! -f ".env.production" ]; then
        echo "⚠️  경고: .env.production 파일이 없습니다."
        echo "   .env.production.example을 참고하여 생성하세요."
    fi
    
    # 프로덕션 빌드
    echo "빌드 중..."
    npm run build
    
    echo "✅ 프론트엔드 빌드 완료"
    echo "빌드 결과물: customs-frontend/dist"
    cd ..
fi

echo "✨ 배포 준비 완료!"
echo ""
echo "다음 단계:"
echo "1. 백엔드: uvicorn 17web:app --host 0.0.0.0 --port 8000"
echo "2. 프론트엔드: dist 폴더를 웹 서버에 배포"
echo "3. DNS 및 SSL 설정 확인"

