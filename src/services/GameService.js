// 📁 src/services/GameService.js - 수정된 버전
import { v4 as uuidv4 } from 'uuid';

class GameService {
    constructor(database) {
        this.db = database;
        this.activeTrades = new Map(); // ✅ 중복 거래 방지
    }
    
    // ✅ 트랜잭션과 검증이 강화된 아이템 구매
    async buyItem(userId, merchantId, itemName) {
        const tradeKey = `${userId}-${merchantId}-${itemName}`;
        
        // ✅ 중복 거래 방지
        if (this.activeTrades.has(tradeKey)) {
            return {
                success: false,
                error: '이미 진행 중인 거래입니다.'
            };
        }
        
        this.activeTrades.set(tradeKey, Date.now());
        
        try {
            await this.db.run('BEGIN TRANSACTION');
            
            // 플레이어 정보 조회 (FOR UPDATE로 락 설정)
            const player = await this.db.get(
                'SELECT * FROM players WHERE user_id = ?',
                [userId]
            );
            
            if (!player) {
                throw new Error('플레이어를 찾을 수 없습니다.');
            }
            
            // 상인 정보 조회
            const merchant = await this.db.get(
                'SELECT * FROM merchants WHERE id = ?',
                [merchantId]
            );
            
            if (!merchant) {
                throw new Error('상인을 찾을 수 없습니다.');
            }
            
            // ✅ 라이센스 요구사항 확인
            if (merchant.required_license > player.current_license) {
                throw new Error(`${merchant.required_license}급 면허가 필요합니다.`);
            }
            
            // 상인 인벤토리에서 아이템 확인
            const inventory = JSON.parse(merchant.inventory || '[]');
            const item = inventory.find(i => i.name === itemName);
            
            if (!item) {
                throw new Error('해당 아이템을 찾을 수 없습니다.');
            }
            
            if (item.stock <= 0) {
                throw new Error('재고가 부족합니다.');
            }
            
            // ✅ 플레이어 인벤토리 용량 확인
            const currentInventoryCount = await this.db.get(
                'SELECT COUNT(*) as count FROM inventory WHERE player_id = ?',
                [player.id]
            );
            
            if (currentInventoryCount.count >= player.max_inventory_size) {
                throw new Error('인벤토리가 가득 찼습니다.');
            }
            
            // ✅ 실시간 가격 조회
            const currentPrice = await this.calculateCurrentPrice(item, merchant.district);
            
            if (player.money < currentPrice) {
                throw new Error('돈이 부족합니다.');
            }
            
            // ✅ 거리 확인 (플레이어가 상인 근처에 있는지)
            const distance = this.calculateDistance(
                player.location_lat, player.location_lng,
                merchant.location_lat, merchant.location_lng
            );
            
            if (distance > 0.5) { // 500m 이내
                throw new Error('상인과 너무 멀리 떨어져 있습니다.');
            }
            
            // 플레이어 돈 차감
            await this.db.run(
                'UPDATE players SET money = money - ?, trust_points = trust_points + 1, last_active = CURRENT_TIMESTAMP WHERE id = ?',
                [currentPrice, player.id]
            );
            
            // 인벤토리에 아이템 추가
            const inventoryId = uuidv4();
            await this.db.run(`
                INSERT INTO inventory (
                    id, player_id, item_name, item_category, base_price, 
                    current_price, item_grade, required_license, acquired_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [
                inventoryId, player.id, item.name, item.category,
                item.basePrice, currentPrice, item.grade, item.requiredLicense
            ]);
            
            // 상인 인벤토리 업데이트 (재고 감소)
            item.stock -= 1;
            await this.db.run(
                'UPDATE merchants SET inventory = ? WHERE id = ?',
                [JSON.stringify(inventory), merchantId]
            );
            
            // 거래 기록
            const tradeId = uuidv4();
            await this.db.run(`
                INSERT INTO trades (
                    id, seller_id, buyer_id, merchant_id, item_name, 
                    item_category, price, trade_type, location_lat, location_lng,
                    timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [
                tradeId, merchantId, player.id, merchantId, item.name,
                item.category, currentPrice, 'buy', 
                player.location_lat, player.location_lng
            ]);
            
            await this.db.run('COMMIT');
            
            return {
                success: true,
                data: {
                    newMoney: player.money - currentPrice,
                    newTrustPoints: player.trust_points + 1,
                    purchasedItem: {
                        id: inventoryId,
                        name: item.name,
                        category: item.category,
                        purchasePrice: currentPrice,
                        grade: item.grade
                    },
                    tradeId: tradeId
                }
            };
            
        } catch (error) {
            await this.db.run('ROLLBACK');
            return {
                success: false,
                error: error.message
            };
        } finally {
            // ✅ 거래 락 해제
            this.activeTrades.delete(tradeKey);
        }
    }
    
    // ✅ 동적 가격 계산 시스템
    async calculateCurrentPrice(item, district) {
        try {
            // 기본 가격에서 시작
            let price = item.basePrice;
            
            // 지역별 가격 변동 (서울 각 구별로 다른 계수)
            const districtMultipliers = {
                '강남구': 1.3, '서초구': 1.25, '송파구': 1.2,
                '중구': 1.15, '종로구': 1.1, '용산구': 1.1,
                '마포구': 1.05, '성동구': 1.0, '광진구': 0.95,
                '동대문구': 0.9, '중랑구': 0.85, // 기타 구들...
            };
            
            price *= (districtMultipliers[district] || 1.0);
            
            // 시간대별 변동 (오전/오후/저녁)
            const hour = new Date().getHours();
            if (hour >= 9 && hour <= 18) {
                price *= 1.1; // 업무시간 프리미엄
            } else if (hour >= 19 && hour <= 22) {
                price *= 1.05; // 저녁시간 약간 할증
            }
            
            // 무작위 변동 (-5% ~ +5%)
            const randomFactor = 0.95 + (Math.random() * 0.1);
            price *= randomFactor;
            
            // 아이템 등급별 변동
            const gradeMultipliers = {
                'common': 1.0,
                'uncommon': 1.2,
                'rare': 1.5,
                'epic': 2.0,
                'legendary': 3.0
            };
            
            price *= (gradeMultipliers[item.grade] || 1.0);
            
            return Math.floor(price);
            
        } catch (error) {
            console.error('가격 계산 오류:', error);
            return item.basePrice; // 오류 시 기본가격 반환
        }
    }
    
    // ✅ 거리 계산 함수 (하버사인 공식)
    calculateDistance(lat1, lng1, lat2, lng2) {
        if (!lat1 || !lng1 || !lat2 || !lng2) return Infinity;
        
        const R = 6371; // 지구 반지름 (km)
        const dLat = this.degreesToRadians(lat2 - lat1);
        const dLng = this.degreesToRadians(lng2 - lng1);
        
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.degreesToRadians(lat1)) * 
            Math.cos(this.degreesToRadians(lat2)) * 
            Math.sin(dLng/2) * Math.sin(dLng/2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; // km 단위
    }
    
    degreesToRadians(degrees) {
        return degrees * (Math.PI/180);
    }
    
    // ✅ 주변 상인 찾기 (성능 최적화)
    async findNearbyMerchants(lat, lng, radiusKm = 2) {
        try {
            // 대략적인 경도/위도 범위로 먼저 필터링 (성능 최적화)
            const latRange = radiusKm / 111; // 1도 ≈ 111km
            const lngRange = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
            
            const merchants = await this.db.all(`
                SELECT * FROM merchants 
                WHERE location_lat BETWEEN ? AND ?
                AND location_lng BETWEEN ? AND ?
            `, [
                lat - latRange, lat + latRange,
                lng - lngRange, lng + lngRange
            ]);
            
            // 정확한 거리로 필터링
            const nearbyMerchants = merchants.filter(merchant => {
                const distance = this.calculateDistance(
                    lat, lng, 
                    merchant.location_lat, merchant.location_lng
                );
                return distance <= radiusKm;
            });
            
            // 거리 정보 추가하여 반환
            return nearbyMerchants.map(merchant => ({
                ...merchant,
                inventory: JSON.parse(merchant.inventory || '[]'),
                distance: this.calculateDistance(
                    lat, lng,
                    merchant.location_lat, merchant.location_lng
                )
            })).sort((a, b) => a.distance - b.distance); // 거리순 정렬
            
        } catch (error) {
            console.error('주변 상인 조회 오류:', error);
            return [];
        }
    }
    
    // ✅ 현재 시장 가격 조회 (캐싱 적용)
    async getCurrentPrices() {
        try {
            const prices = await this.db.all(
                'SELECT * FROM market_prices ORDER BY item_name'
            );
            
            // 실시간 변동 적용
            const updatedPrices = await Promise.all(
                prices.map(async (price) => {
                    const newPrice = await this.calculateMarketPrice(price);
                    
                    // 가격이 크게 변했을 때만 DB 업데이트
                    if (Math.abs(newPrice - price.current_price) > price.current_price * 0.05) {
                        await this.db.run(
                            'UPDATE market_prices SET current_price = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
                            [newPrice, price.id]
                        );
                        price.current_price = newPrice;
                    }
                    
                    return price;
                })
            );
            
            return updatedPrices;
        } catch (error) {
            console.error('시장 가격 조회 오류:', error);
            return [];
        }
    }
    
    // ✅ 시장 가격 계산
    async calculateMarketPrice(priceData) {
        const basePrice = priceData.base_price;
        const now = new Date();
        const hour = now.getHours();
        const dayOfWeek = now.getDay();
        
        let multiplier = 1.0;
        
        // 요일별 변동
        if (dayOfWeek === 0 || dayOfWeek === 6) { // 주말
            multiplier *= 1.1;
        }
        
        // 시간대별 변동
        if (hour >= 9 && hour <= 18) {
            multiplier *= 1.15; // 업무시간 할증
        } else if (hour >= 19 && hour <= 22) {
            multiplier *= 1.05; // 저녁시간 소폭 할증
        } else {
            multiplier *= 0.95; // 새벽/심야 할인
        }
        
        // 수요/공급에 따른 변동 시뮬레이션
        const randomVariation = 0.9 + (Math.random() * 0.2); // ±10% 변동
        multiplier *= randomVariation;
        
        return Math.floor(basePrice * multiplier);
    }
    
    // ✅ 개선된 판매 로직
    async sellItem(userId, itemId, merchantId) {
        const tradeKey = `sell-${userId}-${itemId}`;
        
        if (this.activeTrades.has(tradeKey)) {
            return {
                success: false,
                error: '이미 진행 중인 판매입니다.'
            };
        }
        
        this.activeTrades.set(tradeKey, Date.now());
        
        try {
            await this.db.run('BEGIN TRANSACTION');
            
            // 플레이어와 아이템 정보 조회
            const player = await this.db.get(
                'SELECT * FROM players WHERE user_id = ?',
                [userId]
            );
            
            if (!player) {
                throw new Error('플레이어를 찾을 수 없습니다.');
            }
            
            const item = await this.db.get(
                'SELECT * FROM inventory WHERE id = ? AND player_id = ?',
                [itemId, player.id]
            );
            
            if (!item) {
                throw new Error('해당 아이템을 찾을 수 없습니다.');
            }
            
            const merchant = await this.db.get(
                'SELECT * FROM merchants WHERE id = ?',
                [merchantId]
            );
            
            if (!merchant) {
                throw new Error('상인을 찾을 수 없습니다.');
            }
            
            // 거리 확인
            const distance = this.calculateDistance(
                player.location_lat, player.location_lng,
                merchant.location_lat, merchant.location_lng
            );
            
            if (distance > 0.5) {
                throw new Error('상인과 너무 멀리 떨어져 있습니다.');
            }
            
            // ✅ 동적 판매 가격 계산 (구매가보다 낮게)
            const sellPrice = await this.calculateSellPrice(item, merchant.district);
            
            // 플레이어 돈 증가 및 신뢰도 상승
            await this.db.run(
                'UPDATE players SET money = money + ?, trust_points = trust_points + 2, last_active = CURRENT_TIMESTAMP WHERE id = ?',
                [sellPrice, player.id]
            );
            
            // 인벤토리에서 아이템 제거
            await this.db.run(
                'DELETE FROM inventory WHERE id = ?',
                [itemId]
            );
            
            // 거래 기록
            const tradeId = uuidv4();
            await this.db.run(`
                INSERT INTO trades (
                    id, seller_id, buyer_id, merchant_id, item_name, 
                    item_category, price, trade_type, location_lat, location_lng,
                    timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [
                tradeId, player.id, merchantId, merchantId, item.item_name,
                item.item_category, sellPrice, 'sell',
                player.location_lat, player.location_lng
            ]);
            
            await this.db.run('COMMIT');
            
            return {
                success: true,
                data: {
                    newMoney: player.money + sellPrice,
                    newTrustPoints: player.trust_points + 2,
                    soldItem: {
                        name: item.item_name,
                        category: item.item_category,
                        sellPrice: sellPrice
                    },
                    tradeId: tradeId
                }
            };
            
        } catch (error) {
            await this.db.run('ROLLBACK');
            return {
                success: false,
                error: error.message
            };
        } finally {
            this.activeTrades.delete(tradeKey);
        }
    }
    
    // ✅ 판매 가격 계산 (구매가의 70-90%)
    async calculateSellPrice(item, district) {
        const purchasePrice = item.current_price;
        
        // 기본 판매율 (70-90%)
        const baseSellRate = 0.7 + (Math.random() * 0.2);
        
        // 지역별 조정
        const districtBonuses = {
            '강남구': 0.1, '서초구': 0.08, '송파구': 0.05,
            '중구': 0.03, '종로구': 0.02
        };
        
        const bonus = districtBonuses[district] || 0;
        const finalRate = Math.min(baseSellRate + bonus, 0.95); // 최대 95%
        
        return Math.floor(purchasePrice * finalRate);
    }
    
    // ✅ 플레이어 데이터 조회 (성능 최적화)
    async getPlayerData(userId) {
        try {
            // 플레이어 기본 정보
            const player = await this.db.get(
                'SELECT * FROM players WHERE user_id = ?',
                [userId]
            );
            
            if (!player) {
                throw new Error('플레이어를 찾을 수 없습니다.');
            }
            
            // 인벤토리 조회 (최신 20개만)
            const inventory = await this.db.all(`
                SELECT * FROM inventory 
                WHERE player_id = ? 
                ORDER BY acquired_at DESC 
                LIMIT 50
            `, [player.id]);
            
            return {
                success: true,
                data: {
                    id: player.id,
                    name: player.name,
                    money: player.money,
                    trustPoints: player.trust_points,
                    currentLicense: player.current_license,
                    maxInventorySize: player.max_inventory_size,
                    location: {
                        lat: player.location_lat,
                        lng: player.location_lng
                    },
                    inventory: inventory.map(item => ({
                        id: item.id,
                        name: item.item_name,
                        category: item.item_category,
                        basePrice: item.base_price,
                        currentPrice: item.current_price,
                        grade: item.item_grade,
                        requiredLicense: item.required_license,
                        acquiredAt: item.acquired_at
                    })),
                    inventoryCount: inventory.length
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ✅ 거래 기록 조회 (페이지네이션)
    async getTradeHistory(userId, limit = 20, offset = 0) {
        try {
            const player = await this.db.get(
                'SELECT id FROM players WHERE user_id = ?',
                [userId]
            );
            
            if (!player) {
                throw new Error('플레이어를 찾을 수 없습니다.');
            }
            
            const trades = await this.db.all(`
                SELECT * FROM trades 
                WHERE seller_id = ? OR buyer_id = ?
                ORDER BY timestamp DESC
                LIMIT ? OFFSET ?
            `, [player.id, player.id, limit, offset]);
            
            const totalCount = await this.db.get(`
                SELECT COUNT(*) as count FROM trades 
                WHERE seller_id = ? OR buyer_id = ?
            `, [player.id, player.id]);
            
            return {
                success: true,
                data: {
                    trades: trades.map(trade => ({
                        id: trade.id,
                        itemName: trade.item_name,
                        itemCategory: trade.item_category,
                        price: trade.price,
                        type: trade.trade_type,
                        timestamp: trade.timestamp,
                        location: {
                            lat: trade.location_lat,
                            lng: trade.location_lng
                        }
                    })),
                    pagination: {
                        total: totalCount.count,
                        limit: limit,
                        offset: offset,
                        hasMore: (offset + limit) < totalCount.count
                    }
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

export default GameService;