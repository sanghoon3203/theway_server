// 간단한 테스트 서버
import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3001;

// CORS 설정
app.use(cors({
    origin: ["http://localhost:3001"],
    credentials: true
}));

app.use(express.json());

// 헬스체크
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        port: port,
        timestamp: new Date().toISOString()
    });
});

// API 테스트 엔드포인트
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'Server is working',
        data: {
            maxInventorySize: 5,
            money: 50000,
            trustPoints: 100
        }
    });
});

// 서버 시작
app.listen(port, () => {
    console.log(`🎉 Test server running on port ${port}`);
    console.log(`📍 Health: http://localhost:${port}/health`);
    console.log(`📍 Test API: http://localhost:${port}/api/test`);
});