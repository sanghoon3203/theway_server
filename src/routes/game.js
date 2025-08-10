// src/routes/game.js - 수정된 버전
import express from 'express';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

export default function createGameRoutes(gameService, db) {
    
    // 플레이어 데이터 조회 (iOS 클라이언트와 일치)
    router.get('/player/data', authenticateToken, async (req, res) => {
        try {
            const result = await gameService.getPlayerData(req.user.userId);
            
            if (result.success) {
                res.json({
                    success: true,
                    data: result.data
                });
            } else {
                res.status(404).json({
                    success: false,
                    error: result.error
                });
            }
        } catch (error) {
            console.error('플레이어 데이터 조회 오류:', error);
            res.status(500).json({
                success: false,
                error: '플레이어 데이터 조회 실패'
            });
        }
    });
    
    // 플레이어 위치 업데이트 (PUT 메서드로 수정)
    router.put('/player/location', authenticateToken, async (req, res) => {
        try {
            const { latitude, longitude } = req.body;
            
            // 입력 검증
            if (typeof latitude !== 'number' || typeof longitude !== 'number') {
                return res.status(400).json({
                    success: false,
                    error: '유효한 위도와 경도가 필요합니다.'
                });
            }
            
            // 서울 지역 범위 검증 (대략적)
            if (latitude < 37.4 || latitude > 37.7 || longitude < 126.8 || longitude > 127.2) {
                return res.status(400).json({
                    success: false,
                    error: '서울 지역 내에서만 플레이 가능합니다.'
                });
            }
            
            const result = await gameService.updatePlayerLocation(req.user.userId, latitude, longitude);
            res.json(result);
            
        } catch (error) {
            console.error('위치 업데이트 오류:', error);
            res.status(500).json({
                success: false,
                error: '위치 업데이트 실패'
            });
        }
    });
    
    // 시장 가격 조회
    router.get('/market/prices', async (req, res) => {
        try {
            const prices = await gameService.getCurrentMarketPrices();
            res.json({
                success: true,
                data: prices
            });
        } catch (error) {
            console.error('시장 가격 조회 오류:', error);
            res.status(500).json({
                success: false,
                error: '시장 가격 조회 실패'
            });
        }
    });
    
    // 주변 상인 조회
    router.get('/merchants', async (req, res) => {
        try {
            const { latitude, longitude, radius = 1000 } = req.query;
            
            let merchants;
            if (latitude && longitude) {
                merchants = await gameService.findNearbyMerchants(
                    parseFloat(latitude), 
                    parseFloat(longitude), 
                    parseInt(radius)
                );
            } else {
                merchants = await gameService.getAllMerchants();
            }
            
            res.json({
                success: true,
                data: merchants
            });
        } catch (error) {
            console.error('상인 조회 오류:', error);
            res.status(500).json({
                success: false,
                error: '상인 조회 실패'
            });
        }
    });
    
    // 아이템 구매
    router.post('/trade/buy', authenticateToken, async (req, res) => {
        try {
            const { merchantId, itemName, quantity = 1 } = req.body;
            
            if (!merchantId || !itemName) {
                return res.status(400).json({
                    success: false,
                    error: '상인 ID와 아이템 이름이 필요합니다.'
                });
            }
            
            if (quantity < 1 || quantity > 10) {
                return res.status(400).json({
                    success: false,
                    error: '구매 수량은 1-10개 사이여야 합니다.'
                });
            }
            
            const result = await gameService.buyItem(req.user.userId, merchantId, itemName, quantity);
            
            if (result.success) {
                res.json({
                    success: true,
                    data: result.data,
                    message: '구매가 완료되었습니다.'
                });
            } else {
                res.status(400).json({
                    success: false,
                    error: result.error
                });
            }
        } catch (error) {
            console.error('아이템 구매 오류:', error);
            res.status(500).json({
                success: false,
                error: '아이템 구매 실패'
            });
        }
    });
    
    // 아이템 판매
    router.post('/trade/sell', authenticateToken, async (req, res) => {
        try {
            const { itemId, merchantId, quantity = 1 } = req.body;
            
            if (!itemId || !merchantId) {
                return res.status(400).json({
                    success: false,
                    error: '아이템 ID와 상인 ID가 필요합니다.'
                });
            }
            
            const result = await gameService.sellItem(req.user.userId, itemId, merchantId, quantity);
            
            if (result.success) {
                res.json({
                    success: true,
                    data: result.data,
                    message: '판매가 완료되었습니다.'
                });
            } else {
                res.status(400).json({
                    success: false,
                    error: result.error
                });
            }
        } catch (error) {
            console.error('아이템 판매 오류:', error);
            res.status(500).json({
                success: false,
                error: '아이템 판매 실패'
            });
        }
    });
    
    // 거래 기록 조회
    router.get('/trade/history', authenticateToken, async (req, res) => {
        try {
            const { limit = 20, offset = 0 } = req.query;
            
            const result = await gameService.getTradeHistory(
                req.user.userId, 
                parseInt(limit), 
                parseInt(offset)
            );
            
            res.json({
                success: true,
                data: result.data,
                pagination: {
                    total: result.data.pagination.total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasMore: result.data.pagination.hasMore
                }
            });
        } catch (error) {
            console.error('거래 기록 조회 오류:', error);
            res.status(500).json({
                success: false,
                error: '거래 기록 조회 실패'
            });
        }
    });
    
    // 라이센스 업그레이드
    router.post('/license/upgrade', authenticateToken, async (req, res) => {
        try {
            const result = await gameService.upgradeLicense(req.user.userId);
            
            if (result.success) {
                res.json({
                    success: true,
                    data: result.data,
                    message: '라이센스가 업그레이드되었습니다.'
                });
            } else {
                res.status(400).json({
                    success: false,
                    error: result.error
                });
            }
        } catch (error) {
            console.error('라이센스 업그레이드 오류:', error);
            res.status(500).json({
                success: false,
                error: '라이센스 업그레이드 실패'
            });
        }
    });
    
    // ===== 캐릭터 시스템 API =====
    
    // 캐릭터 스탯 조회
    router.get('/character/stats', authenticateToken, async (req, res) => {
        try {
            const player = await db.getPlayerByUserId(req.user.userId);
            if (!player) {
                return res.status(404).json({
                    success: false,
                    error: '플레이어를 찾을 수 없습니다.'
                });
            }
            
            // character_stats 테이블에서 상세 스탯 조회
            const characterStats = await db.get(`
                SELECT * FROM character_stats WHERE player_id = ?
            `, [player.id]);
            
            if (!characterStats) {
                // 캐릭터 스탯이 없으면 기본값으로 생성
                await db.run(`
                    INSERT INTO character_stats (player_id) VALUES (?)
                `, [player.id]);
                
                const newStats = await db.get(`
                    SELECT * FROM character_stats WHERE player_id = ?
                `, [player.id]);
                
                return res.json({
                    success: true,
                    data: {
                        playerId: player.id,
                        level: newStats.level,
                        experience: newStats.experience,
                        statPoints: newStats.stat_points,
                        skillPoints: newStats.skill_points,
                        stats: {
                            strength: newStats.strength,
                            intelligence: newStats.intelligence,
                            charisma: newStats.charisma,
                            luck: newStats.luck,
                            tradingSkill: newStats.trading_skill,
                            negotiationSkill: newStats.negotiation_skill,
                            appraisalSkill: newStats.appraisal_skill
                        }
                    }
                });
            }
            
            res.json({
                success: true,
                data: {
                    playerId: player.id,
                    level: characterStats.level,
                    experience: characterStats.experience,
                    statPoints: characterStats.stat_points,
                    skillPoints: characterStats.skill_points,
                    stats: {
                        strength: characterStats.strength,
                        intelligence: characterStats.intelligence,
                        charisma: characterStats.charisma,
                        luck: characterStats.luck,
                        tradingSkill: characterStats.trading_skill,
                        negotiationSkill: characterStats.negotiation_skill,
                        appraisalSkill: characterStats.appraisal_skill
                    }
                }
            });
            
        } catch (error) {
            console.error('캐릭터 스탯 조회 오류:', error);
            res.status(500).json({
                success: false,
                error: '캐릭터 스탯 조회에 실패했습니다.'
            });
        }
    });
    
    // 스탯 포인트 할당
    router.put('/character/stats', authenticateToken, async (req, res) => {
        try {
            const { stats } = req.body;
            
            if (!stats) {
                return res.status(400).json({
                    success: false,
                    error: '할당할 스탯 정보가 필요합니다.'
                });
            }
            
            const player = await db.getPlayerByUserId(req.user.userId);
            if (!player) {
                return res.status(404).json({
                    success: false,
                    error: '플레이어를 찾을 수 없습니다.'
                });
            }
            
            // 현재 스탯 조회
            const currentStats = await db.get(`
                SELECT * FROM character_stats WHERE player_id = ?
            `, [player.id]);
            
            if (!currentStats) {
                return res.status(404).json({
                    success: false,
                    error: '캐릭터 스탯을 찾을 수 없습니다.'
                });
            }
            
            // 할당하려는 총 포인트 계산
            const { strength, intelligence, charisma, luck } = stats;
            const currentTotal = currentStats.strength + currentStats.intelligence + 
                               currentStats.charisma + currentStats.luck;
            const newTotal = (strength || currentStats.strength) + 
                           (intelligence || currentStats.intelligence) +
                           (charisma || currentStats.charisma) + 
                           (luck || currentStats.luck);
            
            const usedPoints = newTotal - currentTotal;
            
            if (usedPoints > currentStats.stat_points) {
                return res.status(400).json({
                    success: false,
                    error: '스탯 포인트가 부족합니다.'
                });
            }
            
            if (usedPoints < 0) {
                return res.status(400).json({
                    success: false,
                    error: '스탯은 감소시킬 수 없습니다.'
                });
            }
            
            // 스탯 업데이트
            await db.run(`
                UPDATE character_stats SET 
                    strength = ?, intelligence = ?, charisma = ?, luck = ?,
                    stat_points = stat_points - ?, updated_at = CURRENT_TIMESTAMP
                WHERE player_id = ?
            `, [
                strength || currentStats.strength,
                intelligence || currentStats.intelligence,
                charisma || currentStats.charisma,
                luck || currentStats.luck,
                usedPoints,
                player.id
            ]);
            
            // 업데이트된 스탯 반환
            const updatedStats = await db.get(`
                SELECT * FROM character_stats WHERE player_id = ?
            `, [player.id]);
            
            res.json({
                success: true,
                data: {
                    playerId: player.id,
                    level: updatedStats.level,
                    experience: updatedStats.experience,
                    statPoints: updatedStats.stat_points,
                    skillPoints: updatedStats.skill_points,
                    stats: {
                        strength: updatedStats.strength,
                        intelligence: updatedStats.intelligence,
                        charisma: updatedStats.charisma,
                        luck: updatedStats.luck,
                        tradingSkill: updatedStats.trading_skill,
                        negotiationSkill: updatedStats.negotiation_skill,
                        appraisalSkill: updatedStats.appraisal_skill
                    }
                },
                message: '스탯이 성공적으로 할당되었습니다.'
            });
            
        } catch (error) {
            console.error('스탯 할당 오류:', error);
            res.status(500).json({
                success: false,
                error: '스탯 할당에 실패했습니다.'
            });
        }
    });
    
    // 레벨업 처리
    router.post('/character/levelup', authenticateToken, async (req, res) => {
        try {
            const player = await db.getPlayerByUserId(req.user.userId);
            if (!player) {
                return res.status(404).json({
                    success: false,
                    error: '플레이어를 찾을 수 없습니다.'
                });
            }
            
            // 현재 캐릭터 스탯 조회
            const currentStats = await db.get(`
                SELECT * FROM character_stats WHERE player_id = ?
            `, [player.id]);
            
            if (!currentStats) {
                return res.status(404).json({
                    success: false,
                    error: '캐릭터 스탯을 찾을 수 없습니다.'
                });
            }
            
            // 다음 레벨 요구 경험치 조회
            const nextLevelReq = await db.get(`
                SELECT * FROM level_requirements WHERE level = ?
            `, [currentStats.level + 1]);
            
            if (!nextLevelReq) {
                return res.status(400).json({
                    success: false,
                    error: '최대 레벨에 도달했습니다.'
                });
            }
            
            if (currentStats.experience < nextLevelReq.required_exp) {
                return res.status(400).json({
                    success: false,
                    error: '경험치가 부족합니다.',
                    data: {
                        currentExp: currentStats.experience,
                        requiredExp: nextLevelReq.required_exp,
                        needExp: nextLevelReq.required_exp - currentStats.experience
                    }
                });
            }
            
            // 레벨업 처리
            const newLevel = currentStats.level + 1;
            const statPointsGained = nextLevelReq.stat_points_reward;
            const skillPointsGained = nextLevelReq.skill_points_reward;
            
            await db.run(`
                UPDATE character_stats SET 
                    level = ?,
                    stat_points = stat_points + ?,
                    skill_points = skill_points + ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE player_id = ?
            `, [newLevel, statPointsGained, skillPointsGained, player.id]);
            
            // 업데이트된 정보 반환
            const updatedStats = await db.get(`
                SELECT * FROM character_stats WHERE player_id = ?
            `, [player.id]);
            
            res.json({
                success: true,
                data: {
                    playerId: player.id,
                    oldLevel: currentStats.level,
                    newLevel: newLevel,
                    statPointsGained: statPointsGained,
                    skillPointsGained: skillPointsGained,
                    currentStats: {
                        level: updatedStats.level,
                        experience: updatedStats.experience,
                        statPoints: updatedStats.stat_points,
                        skillPoints: updatedStats.skill_points,
                        stats: {
                            strength: updatedStats.strength,
                            intelligence: updatedStats.intelligence,
                            charisma: updatedStats.charisma,
                            luck: updatedStats.luck,
                            tradingSkill: updatedStats.trading_skill,
                            negotiationSkill: updatedStats.negotiation_skill,
                            appraisalSkill: updatedStats.appraisal_skill
                        }
                    }
                },
                message: `축하합니다! 레벨 ${newLevel}에 도달했습니다!`
            });
            
        } catch (error) {
            console.error('레벨업 처리 오류:', error);
            res.status(500).json({
                success: false,
                error: '레벨업 처리에 실패했습니다.'
            });
        }
    });
    
    // 캐릭터 외형 조회
    router.get('/character/appearance', authenticateToken, async (req, res) => {
        try {
            const player = await db.getPlayerByUserId(req.user.userId);
            if (!player) {
                return res.status(404).json({
                    success: false,
                    error: '플레이어를 찾을 수 없습니다.'
                });
            }
            
            // character_appearance 테이블에서 외형 정보 조회
            const appearance = await db.get(`
                SELECT * FROM character_appearance WHERE player_id = ?
            `, [player.id]);
            
            if (!appearance) {
                // 외형 정보가 없으면 기본값으로 생성
                await db.run(`
                    INSERT INTO character_appearance (player_id) VALUES (?)
                `, [player.id]);
                
                const newAppearance = await db.get(`
                    SELECT * FROM character_appearance WHERE player_id = ?
                `, [player.id]);
                
                return res.json({
                    success: true,
                    data: {
                        playerId: player.id,
                        hairStyle: newAppearance.hair_style,
                        hairColor: newAppearance.hair_color,
                        faceType: newAppearance.face_type,
                        eyeType: newAppearance.eye_type,
                        skinTone: newAppearance.skin_tone,
                        outfitId: newAppearance.outfit_id,
                        accessoryId: newAppearance.accessory_id,
                        updatedAt: newAppearance.updated_at
                    }
                });
            }
            
            res.json({
                success: true,
                data: {
                    playerId: player.id,
                    hairStyle: appearance.hair_style,
                    hairColor: appearance.hair_color,
                    faceType: appearance.face_type,
                    eyeType: appearance.eye_type,
                    skinTone: appearance.skin_tone,
                    outfitId: appearance.outfit_id,
                    accessoryId: appearance.accessory_id,
                    updatedAt: appearance.updated_at
                }
            });
            
        } catch (error) {
            console.error('캐릭터 외형 조회 오류:', error);
            res.status(500).json({
                success: false,
                error: '캐릭터 외형 조회에 실패했습니다.'
            });
        }
    });
    
    // 캐릭터 외형 변경
    router.put('/character/appearance', authenticateToken, async (req, res) => {
        try {
            const { 
                hairStyle, hairColor, faceType, eyeType, 
                skinTone, outfitId, accessoryId 
            } = req.body;
            
            const player = await db.getPlayerByUserId(req.user.userId);
            if (!player) {
                return res.status(404).json({
                    success: false,
                    error: '플레이어를 찾을 수 없습니다.'
                });
            }
            
            // 외형 정보 업데이트 (제공된 필드만)
            const updateFields = [];
            const updateValues = [];
            
            if (hairStyle !== undefined) {
                updateFields.push('hair_style = ?');
                updateValues.push(hairStyle);
            }
            if (hairColor !== undefined) {
                updateFields.push('hair_color = ?');
                updateValues.push(hairColor);
            }
            if (faceType !== undefined) {
                updateFields.push('face_type = ?');
                updateValues.push(faceType);
            }
            if (eyeType !== undefined) {
                updateFields.push('eye_type = ?');
                updateValues.push(eyeType);
            }
            if (skinTone !== undefined) {
                updateFields.push('skin_tone = ?');
                updateValues.push(skinTone);
            }
            if (outfitId !== undefined) {
                updateFields.push('outfit_id = ?');
                updateValues.push(outfitId);
            }
            if (accessoryId !== undefined) {
                updateFields.push('accessory_id = ?');
                updateValues.push(accessoryId);
            }
            
            if (updateFields.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: '변경할 외형 정보가 없습니다.'
                });
            }
            
            updateFields.push('updated_at = CURRENT_TIMESTAMP');
            updateValues.push(player.id);
            
            await db.run(`
                UPDATE character_appearance SET ${updateFields.join(', ')}
                WHERE player_id = ?
            `, updateValues);
            
            // 업데이트된 외형 정보 반환
            const updatedAppearance = await db.get(`
                SELECT * FROM character_appearance WHERE player_id = ?
            `, [player.id]);
            
            res.json({
                success: true,
                data: {
                    playerId: player.id,
                    hairStyle: updatedAppearance.hair_style,
                    hairColor: updatedAppearance.hair_color,
                    faceType: updatedAppearance.face_type,
                    eyeType: updatedAppearance.eye_type,
                    skinTone: updatedAppearance.skin_tone,
                    outfitId: updatedAppearance.outfit_id,
                    accessoryId: updatedAppearance.accessory_id,
                    updatedAt: updatedAppearance.updated_at
                },
                message: '캐릭터 외형이 변경되었습니다.'
            });
            
        } catch (error) {
            console.error('캐릭터 외형 변경 오류:', error);
            res.status(500).json({
                success: false,
                error: '캐릭터 외형 변경에 실패했습니다.'
            });
        }
    });
    
    // 보유 코스메틱 조회
    router.get('/character/cosmetics', authenticateToken, async (req, res) => {
        try {
            const player = await db.getPlayerByUserId(req.user.userId);
            if (!player) {
                return res.status(404).json({
                    success: false,
                    error: '플레이어를 찾을 수 없습니다.'
                });
            }
            
            // character_cosmetics 테이블에서 보유 코스메틱 조회
            const cosmetics = await db.all(`
                SELECT * FROM character_cosmetics 
                WHERE player_id = ? 
                ORDER BY rarity DESC, acquired_at DESC
            `, [player.id]);
            
            // 타입별로 그룹화
            const groupedCosmetics = {
                hair: cosmetics.filter(c => c.cosmetic_type === 'hair'),
                face: cosmetics.filter(c => c.cosmetic_type === 'face'),
                outfit: cosmetics.filter(c => c.cosmetic_type === 'outfit'),
                accessory: cosmetics.filter(c => c.cosmetic_type === 'accessory'),
                skin: cosmetics.filter(c => c.cosmetic_type === 'skin')
            };
            
            res.json({
                success: true,
                data: {
                    playerId: player.id,
                    totalCount: cosmetics.length,
                    cosmetics: cosmetics.map(c => ({
                        id: c.id,
                        type: c.cosmetic_type,
                        cosmeticId: c.cosmetic_id,
                        name: c.cosmetic_name,
                        rarity: c.rarity,
                        isEquipped: c.is_equipped,
                        acquiredAt: c.acquired_at
                    })),
                    grouped: {
                        hair: groupedCosmetics.hair.map(c => ({
                            id: c.id,
                            cosmeticId: c.cosmetic_id,
                            name: c.cosmetic_name,
                            rarity: c.rarity,
                            isEquipped: c.is_equipped
                        })),
                        face: groupedCosmetics.face.map(c => ({
                            id: c.id,
                            cosmeticId: c.cosmetic_id,
                            name: c.cosmetic_name,
                            rarity: c.rarity,
                            isEquipped: c.is_equipped
                        })),
                        outfit: groupedCosmetics.outfit.map(c => ({
                            id: c.id,
                            cosmeticId: c.cosmetic_id,
                            name: c.cosmetic_name,
                            rarity: c.rarity,
                            isEquipped: c.is_equipped
                        })),
                        accessory: groupedCosmetics.accessory.map(c => ({
                            id: c.id,
                            cosmeticId: c.cosmetic_id,
                            name: c.cosmetic_name,
                            rarity: c.rarity,
                            isEquipped: c.is_equipped
                        })),
                        skin: groupedCosmetics.skin.map(c => ({
                            id: c.id,
                            cosmeticId: c.cosmetic_id,
                            name: c.cosmetic_name,
                            rarity: c.rarity,
                            isEquipped: c.is_equipped
                        }))
                    }
                }
            });
            
        } catch (error) {
            console.error('코스메틱 조회 오류:', error);
            res.status(500).json({
                success: false,
                error: '코스메틱 조회에 실패했습니다.'
            });
        }
    });
    
    // 코스메틱 장착/해제
    router.put('/character/cosmetics/:cosmeticId/equip', authenticateToken, async (req, res) => {
        try {
            const { cosmeticId } = req.params;
            const { isEquipped } = req.body;
            
            const player = await db.getPlayerByUserId(req.user.userId);
            if (!player) {
                return res.status(404).json({
                    success: false,
                    error: '플레이어를 찾을 수 없습니다.'
                });
            }
            
            // 해당 코스메틱이 플레이어 소유인지 확인
            const cosmetic = await db.get(`
                SELECT * FROM character_cosmetics 
                WHERE id = ? AND player_id = ?
            `, [cosmeticId, player.id]);
            
            if (!cosmetic) {
                return res.status(404).json({
                    success: false,
                    error: '해당 코스메틱을 찾을 수 없습니다.'
                });
            }
            
            // 같은 타입의 다른 코스메틱들 해제 (한 번에 하나만 장착 가능)
            if (isEquipped) {
                await db.run(`
                    UPDATE character_cosmetics 
                    SET is_equipped = FALSE 
                    WHERE player_id = ? AND cosmetic_type = ? AND id != ?
                `, [player.id, cosmetic.cosmetic_type, cosmeticId]);
            }
            
            // 해당 코스메틱 장착 상태 변경
            await db.run(`
                UPDATE character_cosmetics 
                SET is_equipped = ? 
                WHERE id = ?
            `, [isEquipped, cosmeticId]);
            
            res.json({
                success: true,
                data: {
                    cosmeticId: cosmeticId,
                    name: cosmetic.cosmetic_name,
                    type: cosmetic.cosmetic_type,
                    isEquipped: isEquipped
                },
                message: isEquipped ? '코스메틱을 장착했습니다.' : '코스메틱을 해제했습니다.'
            });
            
        } catch (error) {
            console.error('코스메틱 장착 오류:', error);
            res.status(500).json({
                success: false,
                error: '코스메틱 장착에 실패했습니다.'
            });
        }
    });
    
    // ===== 상인 대화 시스템 API =====
    
    // 상인 대화 목록 조회
    router.get('/merchants/:merchantId/dialogues', authenticateToken, async (req, res) => {
        try {
            const { merchantId } = req.params;
            const { situation } = req.query; // greeting, trade, friendship 등
            
            const player = await db.getPlayerByUserId(req.user.userId);
            if (!player) {
                return res.status(404).json({
                    success: false,
                    error: '플레이어를 찾을 수 없습니다.'
                });
            }
            
            // 상인 정보 조회
            const merchant = await db.get(`
                SELECT * FROM merchants WHERE id = ?
            `, [merchantId]);
            
            if (!merchant) {
                return res.status(404).json({
                    success: false,
                    error: '상인을 찾을 수 없습니다.'
                });
            }
            
            // 플레이어-상인 관계도 조회
            let relationship = await db.get(`
                SELECT * FROM player_merchant_relations 
                WHERE player_id = ? AND merchant_id = ?
            `, [player.id, merchantId]);
            
            if (!relationship) {
                // 관계도가 없으면 생성
                await db.run(`
                    INSERT INTO player_merchant_relations (
                        id, player_id, merchant_id, friendship_points, reputation,
                        total_trades, total_spent, relationship_status
                    ) VALUES (?, ?, ?, 0, 0, 0, 0, 'stranger')
                `, [require('uuid').v4(), player.id, merchantId]);
                
                relationship = await db.get(`
                    SELECT * FROM player_merchant_relations 
                    WHERE player_id = ? AND merchant_id = ?
                `, [player.id, merchantId]);
            }
            
            // 상인 대사 조회 (조건 맞는 것들만)
            let dialogueQuery = `
                SELECT * FROM merchant_dialogues 
                WHERE merchant_id = ? AND is_active = TRUE
            `;
            const queryParams = [merchantId];
            
            if (situation) {
                dialogueQuery += ` AND dialogue_type = ?`;
                queryParams.push(situation);
            }
            
            dialogueQuery += ` ORDER BY priority DESC, created_at ASC`;
            
            const allDialogues = await db.all(dialogueQuery, queryParams);
            
            // 조건에 맞는 대사 필터링
            const availableDialogues = allDialogues.filter(dialogue => {
                if (!dialogue.condition_type) return true;
                
                switch (dialogue.condition_type) {
                    case 'friendship_level':
                        return relationship.friendship_points >= parseInt(dialogue.condition_value || '0');
                    case 'reputation':
                        return relationship.reputation >= parseInt(dialogue.condition_value || '0');
                    case 'total_trades':
                        return relationship.total_trades >= parseInt(dialogue.condition_value || '0');
                    case 'mood':
                        return merchant.mood === dialogue.condition_value;
                    default:
                        return true;
                }
            });
            
            // 개성과 기분에 따른 대사 변형
            const processedDialogues = availableDialogues.map(dialogue => ({
                id: dialogue.id,
                type: dialogue.dialogue_type,
                text: gameService.applyPersonalityToDialogue(dialogue.dialogue_text, merchant.personality, merchant.mood),
                priority: dialogue.priority,
                conditionType: dialogue.condition_type,
                conditionValue: dialogue.condition_value,
                moodRequired: dialogue.mood_required
            }));
            
            res.json({
                success: true,
                data: {
                    merchantId: merchantId,
                    merchantName: merchant.name,
                    merchantPersonality: merchant.personality,
                    merchantMood: merchant.mood,
                    relationship: {
                        friendshipPoints: relationship.friendship_points,
                        reputation: relationship.reputation,
                        totalTrades: relationship.total_trades,
                        relationshipStatus: relationship.relationship_status
                    },
                    dialogues: processedDialogues,
                    // 기본 대화가 없으면 폴백 제공
                    fallbackDialogue: processedDialogues.length === 0 ? 
                        gameService.generateFallbackDialogue(merchant.personality, merchant.mood, situation) : null
                }
            });
            
        } catch (error) {
            console.error('상인 대화 조회 오류:', error);
            res.status(500).json({
                success: false,
                error: '상인 대화 조회에 실패했습니다.'
            });
        }
    });
    
    // 상인과 상호작용 (친밀도 증가, 기분 변화 등)
    router.post('/merchants/:merchantId/interact', authenticateToken, async (req, res) => {
        try {
            const { merchantId } = req.params;
            const { interactionType, message } = req.body; // chat, gift, compliment 등
            
            const player = await db.getPlayerByUserId(req.user.userId);
            if (!player) {
                return res.status(404).json({
                    success: false,
                    error: '플레이어를 찾을 수 없습니다.'
                });
            }
            
            const merchant = await db.get(`
                SELECT * FROM merchants WHERE id = ?
            `, [merchantId]);
            
            if (!merchant) {
                return res.status(404).json({
                    success: false,
                    error: '상인을 찾을 수 없습니다.'
                });
            }
            
            // 플레이어-상인 관계도 조회 또는 생성
            let relationship = await db.get(`
                SELECT * FROM player_merchant_relations 
                WHERE player_id = ? AND merchant_id = ?
            `, [player.id, merchantId]);
            
            if (!relationship) {
                await db.run(`
                    INSERT INTO player_merchant_relations (
                        id, player_id, merchant_id, friendship_points, reputation,
                        total_trades, total_spent, relationship_status
                    ) VALUES (?, ?, ?, 0, 0, 0, 0, 'stranger')
                `, [require('uuid').v4(), player.id, merchantId]);
                
                relationship = await db.get(`
                    SELECT * FROM player_merchant_relations 
                    WHERE player_id = ? AND merchant_id = ?
                `, [player.id, merchantId]);
            }
            
            // 상호작용 처리
            let friendshipGain = 0;
            let reputationGain = 0;
            let moodChange = null;
            let responseDialogue = "";
            
            switch (interactionType) {
                case 'chat':
                    friendshipGain = Math.floor(Math.random() * 3) + 1; // 1-3
                    responseDialogue = gameService.generateChatResponse(merchant.personality, merchant.mood, relationship.friendship_points);
                    break;
                    
                case 'compliment':
                    if (merchant.personality === 'friendly') {
                        friendshipGain = 5;
                        responseDialogue = gameService.applyPersonalityToDialogue("고마워요! 정말 기분이 좋아지네요!", merchant.personality, 'happy');
                        moodChange = 'happy';
                    } else if (merchant.personality === 'grumpy') {
                        friendshipGain = 2;
                        responseDialogue = gameService.applyPersonalityToDialogue("흥, 아첨은 통하지 않아.", merchant.personality, merchant.mood);
                    } else {
                        friendshipGain = 3;
                        responseDialogue = gameService.generateComplimentResponse(merchant.personality, merchant.mood);
                    }
                    break;
                    
                case 'gift':
                    // 선물하기 (나중에 아이템 시스템과 연동)
                    friendshipGain = 8;
                    reputationGain = 2;
                    responseDialogue = gameService.applyPersonalityToDialogue("이런 걸 주시다니... 정말 고마워요!", merchant.personality, 'happy');
                    moodChange = 'happy';
                    break;
                    
                case 'ask_about_district':
                    responseDialogue = gameService.generateDistrictInfo(merchant.district, merchant.personality);
                    friendshipGain = 1;
                    break;
                    
                default:
                    friendshipGain = 1;
                    responseDialogue = gameService.generateFallbackDialogue(merchant.personality, merchant.mood, 'friendship');
            }
            
            // 관계도 업데이트
            const newFriendshipPoints = Math.min(relationship.friendship_points + friendshipGain, 1000);
            const newReputation = Math.min(relationship.reputation + reputationGain, 1000);
            const newRelationshipStatus = gameService.calculateRelationshipStatus(newFriendshipPoints);
            
            await db.run(`
                UPDATE player_merchant_relations SET 
                    friendship_points = ?,
                    reputation = ?,
                    relationship_status = ?,
                    last_interaction = CURRENT_TIMESTAMP
                WHERE player_id = ? AND merchant_id = ?
            `, [newFriendshipPoints, newReputation, newRelationshipStatus, player.id, merchantId]);
            
            // 상인 기분 변화
            if (moodChange) {
                await db.run(`
                    UPDATE merchants SET mood = ? WHERE id = ?
                `, [moodChange, merchantId]);
            }
            
            res.json({
                success: true,
                data: {
                    interactionType: interactionType,
                    responseDialogue: responseDialogue,
                    relationship: {
                        friendshipPointsGained: friendshipGain,
                        reputationGained: reputationGain,
                        newFriendshipPoints: newFriendshipPoints,
                        newReputation: newReputation,
                        oldStatus: relationship.relationship_status,
                        newStatus: newRelationshipStatus,
                        statusChanged: relationship.relationship_status !== newRelationshipStatus
                    },
                    merchant: {
                        name: merchant.name,
                        personality: merchant.personality,
                        oldMood: merchant.mood,
                        newMood: moodChange || merchant.mood,
                        moodChanged: !!moodChange
                    }
                },
                message: `${merchant.name}과의 상호작용이 완료되었습니다.`
            });
            
        } catch (error) {
            console.error('상인 상호작용 오류:', error);
            res.status(500).json({
                success: false,
                error: '상인과의 상호작용에 실패했습니다.'
            });
        }
    });
    
    // 상인 관계도 조회
    router.get('/merchants/:merchantId/relationship', authenticateToken, async (req, res) => {
        try {
            const { merchantId } = req.params;
            
            const player = await db.getPlayerByUserId(req.user.userId);
            if (!player) {
                return res.status(404).json({
                    success: false,
                    error: '플레이어를 찾을 수 없습니다.'
                });
            }
            
            const merchant = await db.get(`
                SELECT * FROM merchants WHERE id = ?
            `, [merchantId]);
            
            if (!merchant) {
                return res.status(404).json({
                    success: false,
                    error: '상인을 찾을 수 없습니다.'
                });
            }
            
            // 관계도 조회
            let relationship = await db.get(`
                SELECT * FROM player_merchant_relations 
                WHERE player_id = ? AND merchant_id = ?
            `, [player.id, merchantId]);
            
            if (!relationship) {
                // 관계도가 없으면 생성
                await db.run(`
                    INSERT INTO player_merchant_relations (
                        id, player_id, merchant_id, friendship_points, reputation,
                        total_trades, total_spent, relationship_status
                    ) VALUES (?, ?, ?, 0, 0, 0, 0, 'stranger')
                `, [require('uuid').v4(), player.id, merchantId]);
                
                relationship = await db.get(`
                    SELECT * FROM player_merchant_relations 
                    WHERE player_id = ? AND merchant_id = ?
                `, [player.id, merchantId]);
            }
            
            // 관계도 레벨별 혜택 계산
            const relationshipBenefits = gameService.calculateRelationshipBenefits(relationship.friendship_points);
            
            res.json({
                success: true,
                data: {
                    merchantId: merchantId,
                    merchantName: merchant.name,
                    merchantTitle: merchant.title,
                    merchantPersonality: merchant.personality,
                    merchantMood: merchant.mood,
                    relationship: {
                        friendshipPoints: relationship.friendship_points,
                        reputation: relationship.reputation,
                        totalTrades: relationship.total_trades,
                        totalSpent: relationship.total_spent,
                        relationshipStatus: relationship.relationship_status,
                        lastInteraction: relationship.last_interaction
                    },
                    benefits: relationshipBenefits,
                    nextLevelInfo: gameService.getNextRelationshipLevelInfo(relationship.friendship_points),
                    specialServices: merchant.quest_giver ? [
                        {
                            name: "특수 계약",
                            description: "특별한 거래 계약을 받을 수 있습니다.",
                            requiredFriendship: 100
                        }
                    ] : []
                }
            });
            
        } catch (error) {
            console.error('상인 관계도 조회 오류:', error);
            res.status(500).json({
                success: false,
                error: '상인 관계도 조회에 실패했습니다.'
            });
        }
    });
    
    // 전체 상인 관계도 목록 조회
    router.get('/player/merchant-relations', authenticateToken, async (req, res) => {
        try {
            const player = await db.getPlayerByUserId(req.user.userId);
            if (!player) {
                return res.status(404).json({
                    success: false,
                    error: '플레이어를 찾을 수 없습니다.'
                });
            }
            
            // 모든 상인 관계도 조회
            const relations = await db.all(`
                SELECT 
                    pmr.*,
                    m.name as merchant_name,
                    m.title as merchant_title,
                    m.personality,
                    m.mood,
                    m.district
                FROM player_merchant_relations pmr
                JOIN merchants m ON pmr.merchant_id = m.id
                WHERE pmr.player_id = ?
                ORDER BY pmr.friendship_points DESC, pmr.last_interaction DESC
            `, [player.id]);
            
            const relationshipSummary = {
                totalRelationships: relations.length,
                bestFriends: relations.filter(r => r.friendship_points >= 800).length,
                closeFriends: relations.filter(r => r.friendship_points >= 500).length,
                friends: relations.filter(r => r.friendship_points >= 200).length,
                acquaintances: relations.filter(r => r.friendship_points >= 50).length,
                strangers: relations.filter(r => r.friendship_points < 50).length
            };
            
            const formattedRelations = relations.map(relation => ({
                merchantId: relation.merchant_id,
                merchantName: relation.merchant_name,
                merchantTitle: relation.merchant_title,
                merchantPersonality: relation.personality,
                merchantMood: relation.mood,
                district: relation.district,
                relationship: {
                    friendshipPoints: relation.friendship_points,
                    reputation: relation.reputation,
                    totalTrades: relation.total_trades,
                    totalSpent: relation.total_spent,
                    relationshipStatus: relation.relationship_status,
                    lastInteraction: relation.last_interaction
                },
                discountRate: Math.min(relation.friendship_points * 0.01, 20) // 최대 20% 할인
            }));
            
            res.json({
                success: true,
                data: {
                    playerId: player.id,
                    playerName: player.name,
                    summary: relationshipSummary,
                    relations: formattedRelations
                }
            });
            
        } catch (error) {
            console.error('상인 관계도 목록 조회 오류:', error);
            res.status(500).json({
                success: false,
                error: '상인 관계도 목록 조회에 실패했습니다.'
            });
        }
    });

    // ===== 업적 시스템 API =====

    // 모든 업적 목록 조회
    router.get('/achievements', authenticateToken, async (req, res) => {
        try {
            const achievements = await db.all(`
                SELECT id, name, description, category, condition_type, condition_value, 
                       reward_type, reward_value, icon_id, is_hidden
                FROM achievements 
                ORDER BY category, condition_value ASC
            `);

            return res.json({ 
                success: true, 
                data: achievements 
            });
        } catch (error) {
            console.error('Get achievements error:', error);
            return res.status(500).json({
                success: false,
                error: '업적 목록을 가져오는 중 오류가 발생했습니다.'
            });
        }
    });

    // 플레이어 업적 진행도 조회
    router.get('/achievements/progress', authenticateToken, async (req, res) => {
        try {
            const player = await db.getPlayerByUserId(req.user.userId);
            if (!player) {
                return res.status(404).json({ success: false, error: '플레이어를 찾을 수 없습니다.' });
            }

            const achievementProgress = await db.all(`
                SELECT 
                    a.id, a.name, a.description, a.category, a.condition_type, 
                    a.condition_value, a.reward_type, a.reward_value, a.icon_id,
                    COALESCE(pa.progress, 0) as current_progress,
                    COALESCE(pa.is_completed, 0) as is_completed,
                    pa.completed_at,
                    COALESCE(pa.claimed, 0) as claimed
                FROM achievements a
                LEFT JOIN player_achievements pa ON a.id = pa.achievement_id AND pa.player_id = ?
                WHERE a.is_hidden = 0 OR pa.progress > 0
                ORDER BY 
                    pa.is_completed ASC, 
                    a.category, 
                    a.condition_value ASC
            `, [player.id]);

            return res.json({ 
                success: true, 
                data: achievementProgress 
            });
        } catch (error) {
            console.error('Get achievement progress error:', error);
            return res.status(500).json({
                success: false,
                error: '업적 진행도를 가져오는 중 오류가 발생했습니다.'
            });
        }
    });

    // 업적 보상 수령
    router.post('/achievements/:achievementId/claim', authenticateToken, async (req, res) => {
        try {
            const { achievementId } = req.params;
            const player = await db.getPlayerByUserId(req.user.userId);
            
            if (!player) {
                return res.status(404).json({ success: false, error: '플레이어를 찾을 수 없습니다.' });
            }

            // 업적 완료 여부 및 보상 수령 여부 확인
            const playerAchievement = await db.get(`
                SELECT * FROM player_achievements 
                WHERE player_id = ? AND achievement_id = ? AND is_completed = 1 AND claimed = 0
            `, [player.id, achievementId]);

            if (!playerAchievement) {
                return res.status(400).json({ 
                    success: false, 
                    error: '완료되지 않았거나 이미 수령한 업적입니다.' 
                });
            }

            // 업적 정보 조회
            const achievement = await db.get(`SELECT * FROM achievements WHERE id = ?`, [achievementId]);
            if (!achievement) {
                return res.status(404).json({ success: false, error: '업적을 찾을 수 없습니다.' });
            }

            await db.run('BEGIN TRANSACTION');

            // 보상 지급
            let rewardData = {};
            try {
                rewardData = JSON.parse(achievement.reward_value);
            } catch (e) {
                rewardData = { gold: parseInt(achievement.reward_value) || 0 };
            }

            if (rewardData.gold) {
                await db.run(`UPDATE players SET money = money + ? WHERE id = ?`, [rewardData.gold, player.id]);
            }
            
            if (rewardData.experience) {
                await gameService.giveExperience(player.id, rewardData.experience);
            }

            // 보상 수령 표시
            await db.run(`
                UPDATE player_achievements 
                SET claimed = 1 
                WHERE player_id = ? AND achievement_id = ?
            `, [player.id, achievementId]);

            await db.run('COMMIT');

            return res.json({ 
                success: true, 
                data: { 
                    message: '업적 보상을 받았습니다!',
                    rewards: rewardData
                }
            });

        } catch (error) {
            await db.run('ROLLBACK');
            console.error('Claim achievement reward error:', error);
            return res.status(500).json({
                success: false,
                error: '보상을 수령하는 중 오류가 발생했습니다.'
            });
        }
    });

    // 업적 진행도 체크 (내부 API)
    router.post('/achievements/check', authenticateToken, async (req, res) => {
        try {
            const player = await db.getPlayerByUserId(req.user.userId);
            if (!player) {
                return res.status(404).json({ success: false, error: '플레이어를 찾을 수 없습니다.' });
            }

            const newAchievements = await gameService.checkAchievements(player.id);
            
            return res.json({ 
                success: true, 
                data: { 
                    newAchievements: newAchievements 
                }
            });
        } catch (error) {
            console.error('Check achievements error:', error);
            return res.status(500).json({
                success: false,
                error: '업적 체크 중 오류가 발생했습니다.'
            });
        }
    });
    
    return router;
}