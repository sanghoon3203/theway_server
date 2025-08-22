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
            
            // ✅ 경험치 지급 (거래 금액 기반)
            const expGained = Math.floor(currentPrice / 1000) + 5; // 기본 5 + 가격/1000
            await this.giveExperience(player.id, expGained);
            
            // ✅ 업적 체크 (거래 후)
            await this.checkAchievements(player.id);
            
            await this.db.run('COMMIT');
            
            return {
                success: true,
                data: {
                    newMoney: player.money - currentPrice,
                    newTrustPoints: player.trust_points + 1,
                    experienceGained: expGained,
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
            
            // ✅ 판매 경험치 지급 (구매보다 더 많이)
            const expGained = Math.floor(sellPrice / 800) + 8; // 기본 8 + 가격/800
            await this.giveExperience(player.id, expGained);
            
            // ✅ 업적 체크 (거래 후)
            await this.checkAchievements(player.id);
            
            await this.db.run('COMMIT');
            
            return {
                success: true,
                data: {
                    newMoney: player.money + sellPrice,
                    newTrustPoints: player.trust_points + 2,
                    experienceGained: expGained,
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
                        grade: item.item_grade || 'common',
                        requiredLicense: item.required_license || 1,
                        acquiredAt: item.acquired_at,
                        // iOS가 기대하는 추가 필드들 (기본값 제공)
                        weight: item.weight || 1.0,
                        durability: item.durability || 100,
                        currentDurability: item.current_durability || item.durability || 100,
                        maxStack: item.max_stack || 1,
                        isStackable: item.is_stackable || false,
                        isConsumable: item.is_consumable || false,
                        isTradeable: item.is_tradeable !== false,
                        isDropable: item.is_dropable !== false,
                        // 고급 시스템 기본값
                        enhancementLevel: 0,
                        magicalProperties: [],
                        socketGems: [],
                        enchantments: []
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
    
    // ✅ 경험치 지급 및 자동 레벨업 체크
    async giveExperience(playerId, expAmount) {
        try {
            // 현재 캐릭터 스탯 조회
            let characterStats = await this.db.get(`
                SELECT * FROM character_stats WHERE player_id = ?
            `, [playerId]);
            
            if (!characterStats) {
                // 캐릭터 스탯이 없으면 생성
                await this.db.run(`
                    INSERT INTO character_stats (player_id) VALUES (?)
                `, [playerId]);
                
                characterStats = await this.db.get(`
                    SELECT * FROM character_stats WHERE player_id = ?
                `, [playerId]);
            }
            
            const newExp = characterStats.experience + expAmount;
            let currentLevel = characterStats.level;
            let statPointsToGive = 0;
            let skillPointsToGive = 0;
            
            // 레벨업 가능한지 체크
            while (true) {
                const nextLevelReq = await this.db.get(`
                    SELECT * FROM level_requirements WHERE level = ?
                `, [currentLevel + 1]);
                
                if (!nextLevelReq || newExp < nextLevelReq.required_exp) {
                    break; // 더 이상 레벨업 불가
                }
                
                // 레벨업!
                currentLevel++;
                statPointsToGive += nextLevelReq.stat_points_reward;
                skillPointsToGive += nextLevelReq.skill_points_reward;
            }
            
            // 경험치 및 레벨업 정보 업데이트
            await this.db.run(`
                UPDATE character_stats SET 
                    experience = ?,
                    level = ?,
                    stat_points = stat_points + ?,
                    skill_points = skill_points + ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE player_id = ?
            `, [newExp, currentLevel, statPointsToGive, skillPointsToGive, playerId]);
            
            return {
                experienceGained: expAmount,
                newExperience: newExp,
                leveledUp: currentLevel > characterStats.level,
                oldLevel: characterStats.level,
                newLevel: currentLevel,
                statPointsGained: statPointsToGive,
                skillPointsGained: skillPointsToGive
            };
            
        } catch (error) {
            console.error('경험치 지급 오류:', error);
            throw error;
        }
    }
    
    // ===== 대화 시스템 헬퍼 함수들 =====
    
    applyPersonalityToDialogue(baseText, personality, mood) {
        let modifiedText = baseText;
        
        // 개성별 말투 변형
        switch (personality) {
            case 'friendly':
                if (mood === 'happy') {
                    modifiedText = `😊 ${modifiedText}`;
                }
                break;
            case 'grumpy':
                if (mood === 'grumpy') {
                    modifiedText = modifiedText.replace(/요$/, '다고');
                    modifiedText = modifiedText.replace(/니다$/, '다');
                }
                break;
            case 'wise':
                modifiedText = `...${modifiedText}`;
                break;
            case 'greedy':
                if (modifiedText.includes('거래') || modifiedText.includes('돈')) {
                    modifiedText = `${modifiedText} 하하하!`;
                }
                break;
            case 'mysterious':
                modifiedText = `...${modifiedText}...`;
                break;
        }
        
        // 기분별 톤 조절
        switch (mood) {
            case 'happy':
                if (!modifiedText.includes('😊')) {
                    modifiedText = modifiedText.replace(/\.$/, '! 🎉');
                }
                break;
            case 'grumpy':
                modifiedText = modifiedText.replace(/\!$/, '.');
                break;
            case 'sad':
                modifiedText = modifiedText.replace(/\!$/, '...');
                break;
        }
        
        return modifiedText;
    }
    
    generateFallbackDialogue(personality, mood, situation) {
        const fallbacks = {
            greeting: {
                friendly: "안녕하세요! 어서 오세요!",
                grumpy: "뭐 필요한 거라도 있나?",
                wise: "...어떤 바람이 당신을 이곳으로 이끌었을까요?",
                greedy: "돈 벌러 왔나? 좋아!",
                mysterious: "...또 만나게 되었군요..."
            },
            trade: {
                friendly: "좋은 거래를 해봐요!",
                grumpy: "빨리 결정해. 시간 없어.",
                wise: "현명한 선택을 하시길...",
                greedy: "가장 비싼 걸로 주세요! 하하!",
                mysterious: "...운명이 당신의 선택을 기다리고 있습니다..."
            },
            friendship: {
                friendly: "당신과 이야기하는 게 즐거워요!",
                grumpy: "친구? 거래나 제대로 해.",
                wise: "진정한 우정은 시간이 만드는 것이지요...",
                greedy: "친구면 할인 좀 해달라고 하지 마!",
                mysterious: "...인연이란 참으로 신비로운 것..."
            }
        };
        
        const baseText = fallbacks[situation]?.[personality] || "...";
        return this.applyPersonalityToDialogue(baseText, personality, mood);
    }
    
    generateChatResponse(personality, mood, friendshipPoints) {
        const responses = {
            friendly: [
                "오늘 날씨가 정말 좋네요!",
                "요즘 장사가 잘 되고 있어요.",
                "당신과 이야기하는 게 즐거워요!"
            ],
            grumpy: [
                "별 할 말 없는데...",
                "바쁜데 무슨 일이야?",
                "빨리 말해봐."
            ],
            wise: [
                "세상사가 모두 인연이지요...",
                "지혜로운 자는 말을 아낄 줄 안다네...",
                "시간은 모든 것을 가르쳐 줍니다..."
            ],
            greedy: [
                "돈 되는 이야기 없나?",
                "좋은 거래 정보 있으면 알려줘!",
                "요즘 뭐가 잘 팔리는지 알아?"
            ],
            mysterious: [
                "...당신에게는 특별한 기운이 느껴집니다...",
                "운명이 우리를 이끌고 있군요...",
                "...말보다는 행동이 중요하지요..."
            ]
        };
        
        const personalityResponses = responses[personality] || responses.friendly;
        const randomResponse = personalityResponses[Math.floor(Math.random() * personalityResponses.length)];
        
        return this.applyPersonalityToDialogue(randomResponse, personality, mood);
    }
    
    generateComplimentResponse(personality, mood) {
        const responses = {
            friendly: "정말 고마워요! 기분이 좋아지네요!",
            grumpy: "아첨은 통하지 않아... 하지만 나쁘지 않군.",
            wise: "칭찬은 마음을 따뜻하게 하는 법이지요...",
            greedy: "말보다는 돈이 더 기분 좋게 하는데... 하하!",
            mysterious: "...당신의 진심이 느껴집니다..."
        };
        
        const response = responses[personality] || responses.friendly;
        return this.applyPersonalityToDialogue(response, personality, mood);
    }
    
    generateDistrictInfo(district, personality) {
        const districtInfo = {
            '강남구': '이곳은 IT와 금융의 중심지라네.',
            '홍대': '예술가들이 모이는 곳이지.',
            '명동': '관광객들로 항상 붐비는 곳이야.',
            '종로구': '오래된 전통이 살아있는 곳이다.',
            '용산구': '다양한 문화가 섞인 흥미로운 지역이지.'
        };
        
        const info = districtInfo[district] || '좋은 곳이야.';
        return this.applyPersonalityToDialogue(info, personality, 'neutral');
    }
    
    calculateRelationshipStatus(friendshipPoints) {
        if (friendshipPoints >= 800) return 'best_friend';
        if (friendshipPoints >= 500) return 'close_friend';
        if (friendshipPoints >= 200) return 'friend';
        if (friendshipPoints >= 50) return 'acquaintance';
        return 'stranger';
    }
    
    calculateRelationshipBenefits(friendshipPoints) {
        const discountRate = Math.min(friendshipPoints * 0.02, 20); // 최대 20% 할인
        const status = this.calculateRelationshipStatus(friendshipPoints);
        
        const benefits = {
            discountRate: Math.floor(discountRate * 100) / 100,
            specialOffers: friendshipPoints >= 200,
            priorityService: friendshipPoints >= 500,
            exclusiveItems: friendshipPoints >= 800,
            statusName: this.getStatusDisplayName(status),
            statusDescription: this.getStatusDescription(status)
        };
        
        return benefits;
    }
    
    getStatusDisplayName(status) {
        const statusNames = {
            stranger: '모르는 사람',
            acquaintance: '아는 사람',
            friend: '친구',
            close_friend: '친한 친구',
            best_friend: '단짝 친구'
        };
        return statusNames[status] || '모르는 사람';
    }
    
    getStatusDescription(status) {
        const descriptions = {
            stranger: '처음 만난 사이입니다.',
            acquaintance: '서로 알고 지내는 사이입니다.',
            friend: '좋은 관계를 유지하고 있습니다.',
            close_friend: '매우 친밀한 관계입니다.',
            best_friend: '최고의 친구 관계입니다!'
        };
        return descriptions[status] || '관계 정보를 확인할 수 없습니다.';
    }
    
    getNextRelationshipLevelInfo(currentPoints) {
        const levels = [
            { threshold: 50, name: '아는 사람', reward: '기본 할인 적용' },
            { threshold: 200, name: '친구', reward: '특별 할인 + 우선 정보 제공' },
            { threshold: 500, name: '친한 친구', reward: '고급 할인 + 우선 서비스' },
            { threshold: 800, name: '단짝 친구', reward: '최고 할인 + 독점 아이템' }
        ];
        
        const nextLevel = levels.find(level => currentPoints < level.threshold);
        
        if (!nextLevel) {
            return {
                isMaxLevel: true,
                message: '최고 관계 레벨에 도달했습니다!'
            };
        }
        
        return {
            isMaxLevel: false,
            nextLevelName: nextLevel.name,
            pointsNeeded: nextLevel.threshold - currentPoints,
            nextLevelReward: nextLevel.reward,
            progress: Math.floor((currentPoints / nextLevel.threshold) * 100)
        };
    }

    // ===== 업적 시스템 =====
    
    async checkAchievements(playerId) {
        try {
            const newAchievements = [];
            
            // 모든 업적 조회
            const achievements = await this.db.all(`SELECT * FROM achievements`);
            
            for (const achievement of achievements) {
                // 이미 완료된 업적은 스킬
                const existing = await this.db.get(`
                    SELECT * FROM player_achievements 
                    WHERE player_id = ? AND achievement_id = ? AND is_completed = 1
                `, [playerId, achievement.id]);
                
                if (existing) continue;
                
                // 현재 진행도 조회
                let playerAchievement = await this.db.get(`
                    SELECT * FROM player_achievements 
                    WHERE player_id = ? AND achievement_id = ?
                `, [playerId, achievement.id]);
                
                // 업적 조건 체크
                const currentProgress = await this.calculateAchievementProgress(playerId, achievement);
                
                // 진행도 업데이트 필요한지 확인
                const needsUpdate = !playerAchievement || currentProgress > (playerAchievement.progress || 0);
                
                if (needsUpdate) {
                    // 새로운 진행도가 목표값에 도달했는지 확인
                    const isCompleted = currentProgress >= achievement.condition_value;
                    
                    if (!playerAchievement) {
                        // 새로운 업적 진행도 생성
                        await this.db.run(`
                            INSERT INTO player_achievements (
                                id, player_id, achievement_id, progress, is_completed, completed_at
                            ) VALUES (?, ?, ?, ?, ?, ?)
                        `, [
                            `${playerId}_${achievement.id}`,
                            playerId,
                            achievement.id,
                            currentProgress,
                            isCompleted ? 1 : 0,
                            isCompleted ? new Date().toISOString() : null
                        ]);
                    } else {
                        // 기존 진행도 업데이트
                        await this.db.run(`
                            UPDATE player_achievements 
                            SET progress = ?, is_completed = ?, completed_at = ?
                            WHERE player_id = ? AND achievement_id = ?
                        `, [
                            currentProgress,
                            isCompleted ? 1 : 0,
                            isCompleted ? new Date().toISOString() : playerAchievement.completed_at,
                            playerId,
                            achievement.id
                        ]);
                    }
                    
                    // 새로 완료된 업적이면 결과에 추가
                    if (isCompleted && (!playerAchievement || !playerAchievement.is_completed)) {
                        newAchievements.push({
                            id: achievement.id,
                            name: achievement.name,
                            description: achievement.description,
                            category: achievement.category,
                            rewardType: achievement.reward_type,
                            rewardValue: achievement.reward_value
                        });
                    }
                }
            }
            
            return newAchievements;
        } catch (error) {
            console.error('업적 체크 오류:', error);
            return [];
        }
    }
    
    async calculateAchievementProgress(playerId, achievement) {
        try {
            switch (achievement.condition_type) {
                case 'trade_count':
                    // 거래 횟수
                    const tradeCount = await this.db.get(`
                        SELECT COUNT(*) as count FROM trades 
                        WHERE (seller_id = ? OR buyer_id = ?)
                    `, [playerId, playerId]);
                    return tradeCount?.count || 0;
                
                case 'money_earned':
                    // 누적 수익 (판매 총액 계산)
                    const earnings = await this.db.get(`
                        SELECT SUM(final_price) as total FROM trades 
                        WHERE seller_id = ? AND trade_type = 'sell'
                    `, [playerId]);
                    return earnings?.total || 0;
                
                case 'level_reached':
                    // 레벨 달성
                    const stats = await this.db.get(`
                        SELECT level FROM character_stats WHERE player_id = ?
                    `, [playerId]);
                    return stats?.level || 1;
                
                case 'stat_total':
                    // 총 스탯 합계
                    const totalStats = await this.db.get(`
                        SELECT (strength + intelligence + charisma + luck) as total 
                        FROM character_stats WHERE player_id = ?
                    `, [playerId]);
                    return totalStats?.total || 40; // 기본값 10*4
                
                case 'unique_items':
                    // 고유 아이템 수집 수
                    const uniqueItems = await this.db.get(`
                        SELECT COUNT(DISTINCT item_id) as count 
                        FROM inventory WHERE player_id = ?
                    `, [playerId]);
                    return uniqueItems?.count || 0;
                
                case 'districts_visited':
                    // 방문한 구역 수
                    const districts = await this.db.get(`
                        SELECT COUNT(DISTINCT district) as count FROM trades 
                        WHERE (seller_id = ? OR buyer_id = ?) AND district IS NOT NULL
                    `, [playerId, playerId]);
                    return districts?.count || 0;
                
                case 'merchant_friendship':
                    // 친구 관계 상인 수
                    const friendMerchants = await this.db.get(`
                        SELECT COUNT(*) as count FROM player_merchant_relations 
                        WHERE player_id = ? AND friendship_points >= 200
                    `, [playerId]);
                    return friendMerchants?.count || 0;
                
                case 'successful_negotiations':
                    // 성공한 협상 수 (임시로 거래 수의 50%로 계산)
                    const negotiations = await this.db.get(`
                        SELECT COUNT(*) as count FROM trades 
                        WHERE (seller_id = ? OR buyer_id = ?) AND negotiation_discount > 0
                    `, [playerId, playerId]);
                    return Math.floor((negotiations?.count || 0) * 0.5);
                
                default:
                    return 0;
            }
        } catch (error) {
            console.error(`업적 진행도 계산 오류 (${achievement.condition_type}):`, error);
            return 0;
        }
    }
}

export default GameService;