// 📁 src/server.js - 수정된 버전
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// ✅ 누락된 라우트 임포트 추가
import DatabaseManager from './database/DatabaseManager.js';
import AuthService from './services/AuthService.js';
import GameService from './services/GameService.js';
import createAuthRoutes from './routes/auth.js';
import createGameRoutes from './routes/game.js';

dotenv.config();

class GameServer {
    constructor() {
        this.app = express();
        this.server = createServer(this.app);
        this.gameService = null;
        this.io = new SocketIOServer(this.server, {
            cors: {
                // ✅ 보안 강화: 특정 도메인만 허용
                origin: process.env.ALLOWED_ORIGINS?.split(',') || ["http://localhost:3001"],
                methods: ["GET", "POST"],
                credentials: true
            }
        });
        
        this.port = process.env.PORT || 3000;
        
        // ✅ Socket.io 타이머 관리
        this.priceUpdateInterval = null;
        this.connectedClients = new Map();
        
        this.db = new DatabaseManager();
        this.authService = new AuthService(this.db);
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocket();
    }
    
    async initializeDatabase() {
        try {
            await this.db.initialize();
            await this.db.createTables();
            await this.db.createInitialData();
            this.gameService = new GameService(this.db);    
            console.log('✅ 데이터베이스 초기화 완료');
        } catch (error) {
            console.error('❌ 데이터베이스 초기화 실패:', error);
            throw error;
        }
    }
    
    setupMiddleware() {
        // ✅ 보안 헤더 강화
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", "data:", "https:"],
                },
            },
        }));
        
        // ✅ CORS 설정 개선
        this.app.use(cors({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || ["http://localhost:3001"],
            credentials: true
        }));
        
        this.app.use(express.json({ limit: '10mb' }));
        
        // ✅ Rate limiting 강화
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15분
            max: 100, // 요청 제한
            message: {
                error: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.'
            },
            standardHeaders: true,
            legacyHeaders: false,
        });
        this.app.use('/api/', limiter);
        
        // ✅ 요청 로깅 개선
        this.app.use((req, res, next) => {
            const timestamp = new Date().toISOString();
            const ip = req.ip || req.connection.remoteAddress;
            console.log(`${timestamp} - ${req.method} ${req.url} from ${ip}`);
            next();
        });
    }
    
    setupRoutes() {
        // 기본 라우트들...
        this.app.get('/', (req, res) => {
            res.json({
                message: '🎮 서울 대무역상 게임 서버',
                version: '1.0.0',
                status: 'running',
                database: 'connected',
                features: ['auth', 'trading', 'realtime'],
                timestamp: new Date().toISOString()
            });
        });
        
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                database: 'connected',
                timestamp: new Date().toISOString()
            });
        });
        
        // ✅ 라우트 등록 수정
        this.app.use('/api/auth', createAuthRoutes(this.authService));
        this.app.use('/api/game', createGameRoutes(this.gameService, this.db));

        // 404 핸들러
        this.app.use('*', (req, res) => {
            res.status(404).json({
                error: 'Route not found',
                path: req.originalUrl
            });
        });
        
        // ✅ 에러 핸들러 개선
        this.app.use((err, req, res, next) => {
            console.error('Server Error:', err);
            
            // 프로덕션에서는 상세한 에러 정보 숨김
            const isDevelopment = process.env.NODE_ENV === 'development';
            
            res.status(err.status || 500).json({
                error: isDevelopment ? err.message : 'Internal server error',
                ...(isDevelopment && { stack: err.stack })
            });
        });
    }
    
    // ✅ Socket.io 설정 개선
    setupSocket() {
        this.io.on('connection', (socket) => {
            console.log(`👤 클라이언트 연결: ${socket.id}`);
            
            // ✅ 클라이언트 추적
            this.connectedClients.set(socket.id, {
                connectedAt: Date.now(),
                lastActivity: Date.now()
            });
            
            // 환영 메시지
            socket.emit('welcome', {
                message: '서버에 연결되었습니다!',
                socketId: socket.id,
                timestamp: new Date().toISOString()
            });
            
            // ✅ 위치 업데이트 (throttling 적용)
            let lastLocationUpdate = 0;
            socket.on('updateLocation', async (data) => {
                const now = Date.now();
                if (now - lastLocationUpdate < 5000) return; // 5초 제한
                lastLocationUpdate = now;
                
                try {
                    const { lat, lng } = data;
                    
                    if (!this.isValidCoordinate(lat, lng)) {
                        socket.emit('error', { message: '유효하지 않은 좌표입니다.' });
                        return;
                    }
                    
                    const nearbyMerchants = await this.gameService?.findNearbyMerchants(lat, lng);
                    socket.emit('nearbyMerchants', nearbyMerchants || []);
                    
                    // 활동 시간 업데이트
                    if (this.connectedClients.has(socket.id)) {
                        this.connectedClients.get(socket.id).lastActivity = now;
                    }
                } catch (error) {
                    console.error('위치 업데이트 오류:', error);
                    socket.emit('error', { message: '위치 업데이트 실패' });
                }
            });
            
            // 룸 참가
            socket.on('joinRoom', (roomId) => {
                if (typeof roomId === 'string' && roomId.length < 50) {
                    socket.join(roomId);
                    console.log(`${socket.id} joined room: ${roomId}`);
                }
            });
            
            socket.on('disconnect', (reason) => {
                console.log(`👋 클라이언트 연결 해제: ${socket.id} (이유: ${reason})`);
                this.connectedClients.delete(socket.id);
            });
        });
        
        // ✅ 전역 가격 업데이트 (중복 방지)
        if (!this.priceUpdateInterval) {
            this.priceUpdateInterval = setInterval(() => {
                this.broadcastPriceUpdates();
            }, 3 * 60 * 60 * 1000); // 3시간마다
        }
    }
    
    // ✅ 헬퍼 메서드들
    isValidCoordinate(lat, lng) {
        return (
            typeof lat === 'number' && 
            typeof lng === 'number' &&
            lat >= -90 && lat <= 90 &&
            lng >= -180 && lng <= 180
        );
    }
    
    async broadcastPriceUpdates() {
        try {
            if (!this.gameService) return;
            
            const priceUpdates = await this.gameService.getCurrentPrices();
            this.io.emit('priceUpdate', priceUpdates);
            console.log('📊 가격 업데이트 브로드캐스트 완료');
        } catch (error) {
            console.error('가격 업데이트 오류:', error);
        }
    }
    
    async start() {
        try {
            await this.initializeDatabase();
            
            this.server.listen(this.port, () => {
                console.log('🎉 서버 시작!');
                console.log(`📍 주소: http://localhost:${this.port}`);
                console.log(`💊 헬스체크: http://localhost:${this.port}/health`);
                console.log(`🔌 Socket.IO: ws://localhost:${this.port}`);
                console.log(`📊 API: http://localhost:${this.port}/api`);
            });
        } catch (error) {
            console.error('❌ 서버 시작 실패:', error);
            process.exit(1);
        }
    }
    
    async stop() {
        console.log('🛑 서버 종료 중...');
        
        // ✅ 타이머 정리
        if (this.priceUpdateInterval) {
            clearInterval(this.priceUpdateInterval);
        }
        
        // Socket.io 연결 종료
        this.io.close();
        
        // 데이터베이스 연결 종료
        await this.db.close();
        
        this.server.close(() => {
            console.log('✅ 서버 종료 완료');
            process.exit(0);
        });
    }
}

// 서버 실행
const server = new GameServer();

// ✅ 우아한 종료 처리
process.on('SIGTERM', () => server.stop());
process.on('SIGINT', () => server.stop());
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    server.stop();
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    server.stop();
});

server.start();