#!/bin/bash

# 🔄 theway_server 재시작 스크립트

echo "🛑 기존 서버 프로세스 종료 중..."

# 포트 3000-3010 범위에서 실행 중인 Node.js 프로세스 종료
for port in {3000..3010}; do
    lsof -ti:$port 2>/dev/null | xargs kill -9 2>/dev/null
done

# Node.js 프로세스 중 theway_server 관련 프로세스 종료
pkill -f "node src/server.js" 2>/dev/null
pkill -f "npm start" 2>/dev/null

echo "⏳ 잠시 대기 중..."
sleep 2

echo "🔄 서버 시작 중..."

# 서버 디렉토리로 이동
cd "$(dirname "$0")"

# npm 패키지 상태 확인
if [ ! -d "node_modules" ]; then
    echo "📦 npm install 실행 중..."
    npm install
fi

# 서버 시작
echo "🚀 서버 시작..."
npm start

echo "✅ 스크립트 실행 완료"