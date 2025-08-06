// 📁 src/utils/Logger.js - 통합 로깅 시스템
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Logger {
    constructor() {
        this.logDir = path.join(__dirname, '../../logs');
        this.ensureLogDirectory();
    }
    
    async ensureLogDirectory() {
        try {
            await fs.access(this.logDir);
        } catch {
            await fs.mkdir(this.logDir, { recursive: true });
        }
    }
    
    async log(level, message, metadata = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            message,
            ...metadata
        };
        
        // 콘솔 출력
        const colors = {
            ERROR: '\x1b[31m',
            WARN: '\x1b[33m',
            INFO: '\x1b[36m',
            DEBUG: '\x1b[90m',
            RESET: '\x1b[0m'
        };
        
        const color = colors[level.toUpperCase()] || colors.INFO;
        console.log(`${color}[${timestamp}] ${level.toUpperCase()}: ${message}${colors.RESET}`);
        
        // 파일 출력
        if (process.env.NODE_ENV === 'production') {
            await this.writeToFile(logEntry);
        }
    }
    
    async writeToFile(logEntry) {
        try {
            const date = new Date().toISOString().split('T')[0];
            const filename = `app-${date}.log`;
            const filepath = path.join(this.logDir, filename);
            
            const logLine = JSON.stringify(logEntry) + '\n';
            await fs.appendFile(filepath, logLine);
        } catch (error) {
            console.error('로그 파일 쓰기 실패:', error);
        }
    }
    
    error(message, metadata = {}) {
        return this.log('error', message, metadata);
    }
    
    warn(message, metadata = {}) {
        return this.log('warn', message, metadata);
    }
    
    info(message, metadata = {}) {
        return this.log('info', message, metadata);
    }
    
    debug(message, metadata = {}) {
        if (process.env.NODE_ENV === 'development') {
            return this.log('debug', message, metadata);
        }
    }
}

export default new Logger();

// 📁 src/middleware/monitoring.js - 성능 모니터링
import logger from '../utils/Logger.js';

// ✅ 요청 성능 모니터링 미들웨어
export const performanceMonitoring = (req, res, next) => {
    const start = Date.now();
    
    // 응답 완료 시 로깅
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logData = {
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            userAgent: req.get('User-Agent'),
            ip: req.ip || req.connection.remoteAddress
        };
        
        if (duration > 1000) {
            logger.warn('느린 요청 감지', logData);
        } else if (res.statusCode >= 400) {
            logger.error('HTTP 오류', logData);
        } else {
            logger.info('요청 처리 완료', logData);
        }
    });
    
    next();
};

// ✅ 에러 추적 미들웨어
export const errorTracking = (err, req, res, next) => {
    logger.error('서버 에러', {
        error: err.message,
        stack: err.stack,
        method: req.method,
        url: req.originalUrl,
        body: req.body,
        query: req.query,
        userAgent: req.get('User-Agent'),
        ip: req.ip
    });
    
    next(err);
};

// ✅ 시스템 리소스 모니터링
export class SystemMonitor {
    constructor() {
        this.metrics = {
            requests: { total: 0, errors: 0 },
            memory: { used: 0, free: 0 },
            cpu: { usage: 0 },
            database: { connections: 0, queries: 0 }
        };
        
        this.startMonitoring();
    }
    
    startMonitoring() {
        // 1분마다 시스템 메트릭 수집
        setInterval(() => {
            this.collectMetrics();
        }, 60000);
    }
    
    collectMetrics() {
        const memoryUsage = process.memoryUsage();
        
        this.metrics.memory = {
            used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
            total: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
            external: Math.round(memoryUsage.external / 1024 / 1024) // MB
        };
        
        // CPU 사용률 (간단한 추정)
        const usage = process.cpuUsage();
        this.metrics.cpu.usage = Math.round((usage.user + usage.system) / 1000000); // ms
        
        logger.info('시스템 메트릭', this.metrics);
        
        // 임계값 체크
        if (this.metrics.memory.used > 500) { // 500MB 초과
            logger.warn('높은 메모리 사용량', { memory: this.metrics.memory });
        }
    }
    
    incrementRequest() {
        this.metrics.requests.total++;
    }
    
    incrementError() {
        this.metrics.requests.errors++;
    }
    
    getMetrics() {
        return { ...this.metrics };
    }
}

// 📁 src/utils/GameAnalytics.js - 게임 분석
export class GameAnalytics {
    constructor(database) {
        this.db = database;
    }
    
    // ✅ 플레이어 행동 분석
    async analyzePlayerBehavior(playerId, timeframe = '7 days') {
        try {
            const analysis = {};
            
            // 거래 패턴 분석
            const trades = await this.db.all(`
                SELECT * FROM trades 
                WHERE (seller_id = ? OR buyer_id = ?) 
                AND timestamp > datetime('now', '-${timeframe}')
                ORDER BY timestamp DESC
            `, [playerId, playerId]);
            
            analysis.totalTrades = trades.length;
            analysis.avgTradeProfitMargin = trades.reduce((sum, trade) => 
                sum + (trade.profit_margin || 0), 0) / trades.length || 0;
            
            // 선호 카테고리 분석
            const categoryCount = {};
            trades.forEach(trade => {
                categoryCount[trade.item_category] = (categoryCount[trade.item_category] || 0) + 1;
            });
            
            analysis.preferredCategories = Object.entries(categoryCount)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 3)
                .map(([category, count]) => ({ category, count }));
            
            // 활동 시간대 분석
            const hourlyActivity = new Array(24).fill(0);
            trades.forEach(trade => {
                const hour = new Date(trade.timestamp).getHours();
                hourlyActivity[hour]++;
            });
            
            analysis.mostActiveHours = hourlyActivity
                .map((count, hour) => ({ hour, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 3);
            
            return analysis;
            
        } catch (error) {
            logger.error('플레이어 행동 분석 실패', { playerId, error: error.message });
            return null;
        }
    }
    
    // ✅ 시장 트렌드 분석
    async analyzeMarketTrends(timeframe = '30 days') {
        try {
            const trends = {};
            
            // 가격 변동 분석
            const priceHistory = await this.db.all(`
                SELECT item_name, item_category, AVG(price) as avg_price, COUNT(*) as trade_count
                FROM trades 
                WHERE timestamp > datetime('now', '-${timeframe}')
                GROUP BY item_name, item_category
                ORDER BY trade_count DESC
                LIMIT 10
            `);
            
            trends.mostTradedItems = priceHistory;
            
            // 수익성 분석
            const profitableItems = await this.db.all(`
                SELECT item_name, AVG(profit_margin) as avg_profit
                FROM trades 
                WHERE timestamp > datetime('now', '-${timeframe}') 
                AND profit_margin > 0
                GROUP BY item_name
                ORDER BY avg_profit DESC
                LIMIT 5
            `);
            
            trends.mostProfitableItems = profitableItems;
            
            return trends;
            
        } catch (error) {
            logger.error('시장 트렌드 분석 실패', { error: error.message });
            return null;
        }
    }
    
    // ✅ 게임 밸런스 체크
    async checkGameBalance() {
        try {
            const balance = {};
            
            // 플레이어 자산 분포
            const wealthDistribution = await this.db.all(`
                SELECT 
                    CASE 
                        WHEN money < 100000 THEN '가난'
                        WHEN money < 500000 THEN '중산층'
                        WHEN money < 2000000 THEN '부유층'
                        ELSE '대부호'
                    END as wealth_tier,
                    COUNT(*) as count
                FROM players
                GROUP BY wealth_tier
            `);
            
            balance.wealthDistribution = wealthDistribution;
            
            // 아이템 가격 인플레이션 체크
            const priceInflation = await this.db.all(`
                SELECT 
                    item_category,
                    AVG(price) as current_avg,
                    (SELECT AVG(price) FROM trades t2 
                     WHERE t2.item_category = t1.item_category 
                     AND t2.timestamp < datetime('now', '-7 days')) as week_ago_avg
                FROM trades t1
                WHERE timestamp > datetime('now', '-1 day')
                GROUP BY item_category
            `);
            
            balance.priceInflation = priceInflation.map(item => ({
                category: item.item_category,
                inflationRate: ((item.current_avg - item.week_ago_avg) / item.week_ago_avg * 100) || 0
            }));
            
            return balance;
            
        } catch (error) {
            logger.error('게임 밸런스 체크 실패', { error: error.message });
            return null;
        }
    }
}

// 📁 src/utils/AlertSystem.js - 알림 시스템
export class AlertSystem {
    constructor() {
        this.alerts = [];
        this.thresholds = {
            highMemoryUsage: 500, // MB
            slowRequest: 2000, // ms
            errorRate: 10, // %
            unusualActivity: 100 // 비정상적인 거래 횟수
        };
    }
    
    checkThresholds(metrics) {
        const alerts = [];
        
        // 메모리 사용량 체크
        if (metrics.memory.used > this.thresholds.highMemoryUsage) {
            alerts.push({
                type: 'memory',
                severity: 'warning',
                message: `높은 메모리 사용량: ${metrics.memory.used}MB`,
                timestamp: new Date().toISOString()
            });
        }
        
        // 에러율 체크
        const errorRate = (metrics.requests.errors / metrics.requests.total) * 100;
        if (errorRate > this.thresholds.errorRate) {
            alerts.push({
                type: 'error_rate',
                severity: 'critical',
                message: `높은 에러율: ${errorRate.toFixed(2)}%`,
                timestamp: new Date().toISOString()
            });
        }
        
        return alerts;
    }
    
    async sendAlert(alert) {
        logger.warn('시스템 알림', alert);
        
        // 여기에 이메일, Slack, Discord 등 외부 알림 서비스 연동 가능
        if (process.env.NODE_ENV === 'production') {
            // await this.sendToSlack(alert);
            // await this.sendEmail(alert);
        }
    }
}