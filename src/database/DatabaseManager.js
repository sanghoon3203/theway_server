// 📁 src/database/DatabaseManager.js - 완전 통합 버전
import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseManager {
    constructor() {
        this.db = null;
        this.dbPath = path.join(__dirname, '../../data/game.db');
        
        // data 디렉토리가 없으면 생성
        const dataDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    }
    
    async initialize() {
        console.log('🗄 데이터베이스 초기화 중...');
        
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('❌ 데이터베이스 연결 실패:', err);
                    reject(err);
                    return;
                }
                console.log(`✅ SQLite 연결: ${this.dbPath}`);
                resolve();
            });
            
            // 메서드를 Promise로 변환
            this.db.run = promisify(this.db.run.bind(this.db));
            this.db.get = promisify(this.db.get.bind(this.db));
            this.db.all = promisify(this.db.all.bind(this.db));
        });
    }
    
    async createTables() {
        console.log('📋 데이터베이스 테이블 생성 중...');
        
        const tables = [
            // ===== 기본 시스템 테이블 =====
            
            // 사용자 계정 테이블
            `CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // 플레이어 게임 데이터 테이블 (위치 정보 제거됨)
            `CREATE TABLE IF NOT EXISTS players (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                money INTEGER DEFAULT 50000,
                trust_points INTEGER DEFAULT 0,
                current_license INTEGER DEFAULT 1,
                max_inventory_size INTEGER DEFAULT 5,
                last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )`,
            
            // ===== 캐릭터 시스템 =====
            
            // 캐릭터 외형 테이블
            `CREATE TABLE IF NOT EXISTS character_appearance (
                player_id TEXT PRIMARY KEY,
                hair_style INTEGER DEFAULT 1,
                hair_color INTEGER DEFAULT 1,
                face_type INTEGER DEFAULT 1,
                eye_type INTEGER DEFAULT 1,
                skin_tone INTEGER DEFAULT 1,
                outfit_id INTEGER DEFAULT 1,
                accessory_id INTEGER,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
            )`,
            
            // 캐릭터 스탯 테이블
            `CREATE TABLE IF NOT EXISTS character_stats (
                player_id TEXT PRIMARY KEY,
                level INTEGER DEFAULT 1,
                experience INTEGER DEFAULT 0,
                strength INTEGER DEFAULT 10,
                intelligence INTEGER DEFAULT 10,
                charisma INTEGER DEFAULT 10,
                luck INTEGER DEFAULT 10,
                trading_skill INTEGER DEFAULT 1,
                negotiation_skill INTEGER DEFAULT 1,
                appraisal_skill INTEGER DEFAULT 1,
                stat_points INTEGER DEFAULT 0,
                skill_points INTEGER DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
            )`,
            
            // 캐릭터 소유 의상/아이템 테이블
            `CREATE TABLE IF NOT EXISTS character_cosmetics (
                id TEXT PRIMARY KEY,
                player_id TEXT NOT NULL,
                cosmetic_type TEXT NOT NULL,
                cosmetic_id INTEGER NOT NULL,
                cosmetic_name TEXT NOT NULL,
                rarity TEXT DEFAULT 'common',
                is_equipped BOOLEAN DEFAULT FALSE,
                acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
            )`,
            
            // 레벨별 경험치 테이블
            `CREATE TABLE IF NOT EXISTS level_requirements (
                level INTEGER PRIMARY KEY,
                required_exp INTEGER NOT NULL,
                stat_points_reward INTEGER DEFAULT 1,
                skill_points_reward INTEGER DEFAULT 1
            )`,
            
            // 업적 테이블
            `CREATE TABLE IF NOT EXISTS achievements (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                category TEXT NOT NULL,
                condition_type TEXT NOT NULL,
                condition_value INTEGER NOT NULL,
                reward_type TEXT,
                reward_value TEXT,
                icon_id INTEGER DEFAULT 1,
                is_hidden BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // 플레이어 업적 달성 기록
            `CREATE TABLE IF NOT EXISTS player_achievements (
                id TEXT PRIMARY KEY,
                player_id TEXT NOT NULL,
                achievement_id TEXT NOT NULL,
                progress INTEGER DEFAULT 0,
                is_completed BOOLEAN DEFAULT FALSE,
                completed_at DATETIME,
                claimed BOOLEAN DEFAULT FALSE,
                FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE,
                FOREIGN KEY (achievement_id) REFERENCES achievements (id),
                UNIQUE(player_id, achievement_id)
            )`,
            
            // ===== 아이템 시스템 =====
            
            // 아이템 마스터 테이블
            `CREATE TABLE IF NOT EXISTS item_master (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                subcategory TEXT,
                rarity TEXT NOT NULL,
                base_price INTEGER NOT NULL,
                is_stackable BOOLEAN DEFAULT FALSE,
                max_stack INTEGER DEFAULT 1,
                durability INTEGER,
                weight REAL DEFAULT 1.0,
                icon_id INTEGER DEFAULT 1,
                sprite_id INTEGER,
                color_scheme TEXT,
                description TEXT,
                lore_text TEXT,
                required_level INTEGER DEFAULT 1,
                required_license INTEGER DEFAULT 1,
                required_stats TEXT,
                magical_properties TEXT,
                special_effects TEXT,
                crafting_recipe TEXT,
                is_tradeable BOOLEAN DEFAULT TRUE,
                is_dropable BOOLEAN DEFAULT TRUE,
                is_consumable BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // 확장된 인벤토리 테이블
            `CREATE TABLE IF NOT EXISTS inventory (
                id TEXT PRIMARY KEY,
                player_id TEXT NOT NULL,
                item_id TEXT NOT NULL,
                quantity INTEGER DEFAULT 1,
                current_durability INTEGER,
                enhancement_level INTEGER DEFAULT 0,
                enhancement_stats TEXT,
                custom_name TEXT,
                socket_gems TEXT,
                enchantments TEXT,
                purchase_price INTEGER,
                market_value INTEGER,
                is_equipped BOOLEAN DEFAULT FALSE,
                equipment_slot TEXT,
                is_locked BOOLEAN DEFAULT FALSE,
                is_favorite BOOLEAN DEFAULT FALSE,
                acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE,
                FOREIGN KEY (item_id) REFERENCES item_master (id)
            )`,
            
            // 아이템 강화/제작 테이블
            `CREATE TABLE IF NOT EXISTS item_enhancement (
                id TEXT PRIMARY KEY,
                base_item_id TEXT NOT NULL,
                enhancement_type TEXT NOT NULL,
                required_materials TEXT NOT NULL,
                required_gold INTEGER DEFAULT 0,
                success_rate REAL DEFAULT 1.0,
                failure_penalty TEXT,
                result_stats TEXT,
                special_effects TEXT,
                required_npc TEXT,
                FOREIGN KEY (base_item_id) REFERENCES item_master (id)
            )`,
            
            // 마법 속성/인챈트 테이블
            `CREATE TABLE IF NOT EXISTS magic_properties (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                effect_formula TEXT NOT NULL,
                visual_effect TEXT,
                rarity TEXT DEFAULT 'common',
                applicable_items TEXT,
                conflict_properties TEXT,
                description TEXT
            )`,
            
            // 아이템 세트 시스템
            `CREATE TABLE IF NOT EXISTS item_sets (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                lore_text TEXT,
                required_items TEXT NOT NULL,
                set_bonuses TEXT NOT NULL,
                rarity TEXT DEFAULT 'rare',
                theme TEXT
            )`,
            
            // 임시/이벤트 아이템 테이블
            `CREATE TABLE IF NOT EXISTS special_items (
                id TEXT PRIMARY KEY,
                base_item_id TEXT NOT NULL,
                special_type TEXT NOT NULL,
                availability_start DATETIME,
                availability_end DATETIME,
                spawn_condition TEXT,
                rarity_modifier REAL DEFAULT 1.0,
                special_properties TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                FOREIGN KEY (base_item_id) REFERENCES item_master (id)
            )`,
            
            // ===== 상인 시스템 =====
            
            // 확장된 상인 테이블
            `CREATE TABLE IF NOT EXISTS merchants (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                title TEXT,
                type TEXT NOT NULL,
                personality TEXT NOT NULL,
                district TEXT NOT NULL,
                location_lat REAL NOT NULL,
                location_lng REAL NOT NULL,
                required_license INTEGER NOT NULL,
                appearance_id INTEGER DEFAULT 1,
                portrait_id INTEGER DEFAULT 1,
                price_modifier REAL DEFAULT 1.0,
                negotiation_difficulty INTEGER DEFAULT 3,
                preferred_items TEXT,
                disliked_items TEXT,
                reputation_requirement INTEGER DEFAULT 0,
                friendship_level INTEGER DEFAULT 0,
                inventory TEXT,
                trust_level INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                mood TEXT DEFAULT 'neutral',
                last_restocked DATETIME DEFAULT CURRENT_TIMESTAMP,
                special_abilities TEXT,
                quest_giver BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // 상인 대사 테이블
            `CREATE TABLE IF NOT EXISTS merchant_dialogues (
                id TEXT PRIMARY KEY,
                merchant_id TEXT NOT NULL,
                dialogue_type TEXT NOT NULL,
                condition_type TEXT,
                condition_value TEXT,
                dialogue_text TEXT NOT NULL,
                mood_required TEXT,
                priority INTEGER DEFAULT 1,
                is_active BOOLEAN DEFAULT TRUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE
            )`,
            
            // 플레이어-상인 관계 테이블
            `CREATE TABLE IF NOT EXISTS player_merchant_relations (
                id TEXT PRIMARY KEY,
                player_id TEXT NOT NULL,
                merchant_id TEXT NOT NULL,
                friendship_points INTEGER DEFAULT 0,
                reputation INTEGER DEFAULT 0,
                total_trades INTEGER DEFAULT 0,
                total_spent INTEGER DEFAULT 0,
                last_interaction DATETIME,
                relationship_status TEXT DEFAULT 'stranger',
                notes TEXT,
                FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE,
                FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE,
                UNIQUE(player_id, merchant_id)
            )`,
            
            // 상인 기분/상태 이벤트 테이블
            `CREATE TABLE IF NOT EXISTS merchant_mood_events (
                id TEXT PRIMARY KEY,
                merchant_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                mood_change TEXT NOT NULL,
                price_modifier REAL DEFAULT 1.0,
                duration_hours INTEGER DEFAULT 24,
                description TEXT,
                start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                end_time DATETIME,
                is_active BOOLEAN DEFAULT TRUE,
                FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE
            )`,
            
            // 상인별 특수 서비스 테이블
            `CREATE TABLE IF NOT EXISTS merchant_services (
                id TEXT PRIMARY KEY,
                merchant_id TEXT NOT NULL,
                service_type TEXT NOT NULL,
                service_name TEXT NOT NULL,
                description TEXT,
                base_cost INTEGER DEFAULT 0,
                cost_formula TEXT,
                required_friendship INTEGER DEFAULT 0,
                required_reputation INTEGER DEFAULT 0,
                success_rate REAL DEFAULT 1.0,
                cooldown_hours INTEGER DEFAULT 0,
                is_available BOOLEAN DEFAULT TRUE,
                FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE
            )`,
            
            // ===== 거래 시스템 =====
            
            // 확장된 거래 기록 테이블
            `CREATE TABLE IF NOT EXISTS trades (
                id TEXT PRIMARY KEY,
                seller_id TEXT,
                buyer_id TEXT,
                merchant_id TEXT,
                item_id TEXT NOT NULL,
                item_name TEXT NOT NULL,
                item_category TEXT NOT NULL,
                item_rarity TEXT,
                quantity INTEGER DEFAULT 1,
                base_price INTEGER NOT NULL,
                final_price INTEGER NOT NULL,
                price_modifier REAL DEFAULT 1.0,
                negotiation_discount REAL DEFAULT 0,
                trade_type TEXT NOT NULL,
                trade_method TEXT DEFAULT 'direct',
                payment_method TEXT DEFAULT 'gold',
                negotiation_rounds INTEGER DEFAULT 0,
                negotiation_result TEXT,
                charisma_bonus REAL DEFAULT 0,
                skill_bonus REAL DEFAULT 0,
                location_lat REAL,
                location_lng REAL,
                district TEXT,
                weather_condition TEXT,
                time_of_day TEXT,
                experience_gained INTEGER DEFAULT 0,
                reputation_change INTEGER DEFAULT 0,
                relationship_change INTEGER DEFAULT 0,
                is_rare_deal BOOLEAN DEFAULT FALSE,
                special_conditions TEXT,
                trade_notes TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (item_id) REFERENCES item_master (id)
            )`,
            
            // 협상 시스템 테이블
            `CREATE TABLE IF NOT EXISTS negotiations (
                id TEXT PRIMARY KEY,
                trade_id TEXT NOT NULL,
                player_id TEXT NOT NULL,
                merchant_id TEXT NOT NULL,
                initial_price INTEGER NOT NULL,
                target_price INTEGER NOT NULL,
                current_round INTEGER DEFAULT 1,
                max_rounds INTEGER DEFAULT 3,
                merchant_mood TEXT DEFAULT 'neutral',
                player_charisma INTEGER DEFAULT 10,
                relationship_modifier REAL DEFAULT 1.0,
                item_demand_modifier REAL DEFAULT 1.0,
                offers_history TEXT,
                merchant_responses TEXT,
                status TEXT DEFAULT 'in_progress',
                final_price INTEGER,
                success_factors TEXT,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                ended_at DATETIME,
                FOREIGN KEY (trade_id) REFERENCES trades (id),
                FOREIGN KEY (player_id) REFERENCES players (id),
                FOREIGN KEY (merchant_id) REFERENCES merchants (id)
            )`,
            
            // 시장 동향 및 가격 변동 테이블
            `CREATE TABLE IF NOT EXISTS market_trends (
                id TEXT PRIMARY KEY,
                item_id TEXT NOT NULL,
                district TEXT NOT NULL,
                current_price INTEGER NOT NULL,
                price_history TEXT,
                demand_level INTEGER DEFAULT 5,
                supply_level INTEGER DEFAULT 5,
                seasonal_modifier REAL DEFAULT 1.0,
                event_modifier REAL DEFAULT 1.0,
                player_activity_modifier REAL DEFAULT 1.0,
                trend_direction TEXT DEFAULT 'stable',
                volatility_score REAL DEFAULT 0.1,
                predicted_price_change REAL DEFAULT 0,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (item_id) REFERENCES item_master (id)
            )`,
            
            // 경매/주문 시스템 테이블
            `CREATE TABLE IF NOT EXISTS market_orders (
                id TEXT PRIMARY KEY,
                player_id TEXT NOT NULL,
                item_id TEXT NOT NULL,
                order_type TEXT NOT NULL,
                quantity INTEGER DEFAULT 1,
                price_per_unit INTEGER NOT NULL,
                total_value INTEGER NOT NULL,
                auction_start_price INTEGER,
                auction_buyout_price INTEGER,
                current_highest_bid INTEGER,
                highest_bidder_id TEXT,
                status TEXT DEFAULT 'active',
                expires_at DATETIME NOT NULL,
                district TEXT,
                location_lat REAL,
                location_lng REAL,
                pickup_radius REAL DEFAULT 1.0,
                listing_fee INTEGER DEFAULT 0,
                success_fee_rate REAL DEFAULT 0.05,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (player_id) REFERENCES players (id),
                FOREIGN KEY (item_id) REFERENCES item_master (id),
                FOREIGN KEY (highest_bidder_id) REFERENCES players (id)
            )`,
            
            // 입찰 기록 테이블
            `CREATE TABLE IF NOT EXISTS auction_bids (
                id TEXT PRIMARY KEY,
                order_id TEXT NOT NULL,
                bidder_id TEXT NOT NULL,
                bid_amount INTEGER NOT NULL,
                is_auto_bid BOOLEAN DEFAULT FALSE,
                max_auto_bid INTEGER,
                bid_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_winning BOOLEAN DEFAULT FALSE,
                FOREIGN KEY (order_id) REFERENCES market_orders (id),
                FOREIGN KEY (bidder_id) REFERENCES players (id)
            )`,
            
            // 거래 퀘스트/계약 테이블
            `CREATE TABLE IF NOT EXISTS trade_contracts (
                id TEXT PRIMARY KEY,
                contract_type TEXT NOT NULL,
                giver_id TEXT NOT NULL,
                contractor_id TEXT,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                required_items TEXT NOT NULL,
                reward_gold INTEGER DEFAULT 0,
                reward_items TEXT,
                reward_experience INTEGER DEFAULT 0,
                bonus_conditions TEXT,
                required_level INTEGER DEFAULT 1,
                required_license INTEGER DEFAULT 1,
                required_reputation INTEGER DEFAULT 0,
                time_limit_hours INTEGER,
                location_restriction TEXT,
                status TEXT DEFAULT 'available',
                progress TEXT,
                posted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                accepted_at DATETIME,
                deadline DATETIME,
                completed_at DATETIME,
                FOREIGN KEY (giver_id) REFERENCES merchants (id),
                FOREIGN KEY (contractor_id) REFERENCES players (id)
            )`,
            
            // 거래 길드/조합 시스템
            `CREATE TABLE IF NOT EXISTS trading_guilds (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                leader_id TEXT NOT NULL,
                guild_type TEXT DEFAULT 'general',
                level INTEGER DEFAULT 1,
                experience INTEGER DEFAULT 0,
                reputation INTEGER DEFAULT 0,
                member_bonuses TEXT,
                guild_perks TEXT,
                max_members INTEGER DEFAULT 20,
                current_members INTEGER DEFAULT 1,
                is_recruiting BOOLEAN DEFAULT TRUE,
                join_requirements TEXT,
                guild_treasury INTEGER DEFAULT 0,
                guild_warehouse TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (leader_id) REFERENCES players (id)
            )`,
            
            // 길드 멤버십 테이블
            `CREATE TABLE IF NOT EXISTS guild_memberships (
                id TEXT PRIMARY KEY,
                guild_id TEXT NOT NULL,
                player_id TEXT NOT NULL,
                rank TEXT DEFAULT 'member',
                contribution_points INTEGER DEFAULT 0,
                permissions TEXT,
                total_trades_for_guild INTEGER DEFAULT 0,
                total_contribution_gold INTEGER DEFAULT 0,
                joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (guild_id) REFERENCES trading_guilds (id),
                FOREIGN KEY (player_id) REFERENCES players (id),
                UNIQUE(guild_id, player_id)
            )`,
            
            // 거래 보험 시스템
            `CREATE TABLE IF NOT EXISTS trade_insurance (
                id TEXT PRIMARY KEY,
                player_id TEXT NOT NULL,
                policy_type TEXT NOT NULL,
                coverage_amount INTEGER NOT NULL,
                premium_rate REAL NOT NULL,
                deductible INTEGER DEFAULT 0,
                covered_risks TEXT NOT NULL,
                coverage_items TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                start_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                end_date DATETIME NOT NULL,
                claims_count INTEGER DEFAULT 0,
                total_claims_amount INTEGER DEFAULT 0,
                FOREIGN KEY (player_id) REFERENCES players (id)
            )`,
            
            // 보험 청구 테이블
            `CREATE TABLE IF NOT EXISTS insurance_claims (
                id TEXT PRIMARY KEY,
                insurance_id TEXT NOT NULL,
                trade_id TEXT,
                claim_type TEXT NOT NULL,
                claim_amount INTEGER NOT NULL,
                description TEXT NOT NULL,
                evidence TEXT,
                status TEXT DEFAULT 'submitted',
                adjuster_notes TEXT,
                settlement_amount INTEGER,
                submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                processed_at DATETIME,
                FOREIGN KEY (insurance_id) REFERENCES trade_insurance (id),
                FOREIGN KEY (trade_id) REFERENCES trades (id)
            )`
        ];
        
        try {
            for (const sql of tables) {
                await this.db.run(sql);
                const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1];
                console.log(`✅ 테이블 생성: ${tableName}`);
            }
            console.log('✅ 데이터베이스 테이블 생성 완료');
        } catch (error) {
            console.error('❌ 테이블 생성 실패:', error);
            throw error;
        }
    }
    
    async createInitialData() {
        console.log('📦 초기 데이터 생성 중...');
        
        try {
            // 1. 레벨 요구사항 데이터
            const levelData = [
                { level: 1, required_exp: 0, stat_points: 0, skill_points: 0 },
                { level: 2, required_exp: 100, stat_points: 2, skill_points: 1 },
                { level: 3, required_exp: 250, stat_points: 2, skill_points: 1 },
                { level: 4, required_exp: 450, stat_points: 2, skill_points: 1 },
                { level: 5, required_exp: 700, stat_points: 3, skill_points: 2 },
                { level: 10, required_exp: 2700, stat_points: 3, skill_points: 2 },
                { level: 15, required_exp: 5000, stat_points: 3, skill_points: 2 },
                { level: 20, required_exp: 8500, stat_points: 4, skill_points: 2 },
                { level: 25, required_exp: 13000, stat_points: 4, skill_points: 3 },
                { level: 30, required_exp: 18500, stat_points: 4, skill_points: 3 },
                { level: 50, required_exp: 50000, stat_points: 6, skill_points: 5 }
            ];
            
            for (const level of levelData) {
                await this.db.run(`
                    INSERT OR IGNORE INTO level_requirements (level, required_exp, stat_points_reward, skill_points_reward)
                    VALUES (?, ?, ?, ?)
                `, [level.level, level.required_exp, level.stat_points, level.skill_points]);
            }
            
            // 2. 아이템 마스터 데이터 (현대 + 판타지)
            const items = [
                // 현대 아이템
                { id: 'it_common_1', name: 'IT부품 (커먼)', category: 'modern', subcategory: 'electronics', rarity: 'common', base_price: 5000, description: '기본적인 전자부품' },
                { id: 'it_rare_1', name: 'IT부품 (중급)', category: 'modern', subcategory: 'electronics', rarity: 'uncommon', base_price: 15000, description: '향상된 전자부품' },
                { id: 'it_epic_1', name: 'IT부품 (고급)', category: 'modern', subcategory: 'electronics', rarity: 'rare', base_price: 35000, description: '고급 전자부품' },
                
                { id: 'luxury_common_1', name: '명품 (커먼)', category: 'modern', subcategory: 'luxury', rarity: 'common', base_price: 10000, description: '기본 명품 아이템' },
                { id: 'luxury_rare_1', name: '명품 (중급)', category: 'modern', subcategory: 'luxury', rarity: 'uncommon', base_price: 25000, description: '고급 명품 아이템' },
                
                { id: 'art_common_1', name: '예술품 (커먼)', category: 'modern', subcategory: 'art', rarity: 'common', base_price: 8000, description: '일반적인 예술 작품' },
                { id: 'art_rare_1', name: '예술품 (중급)', category: 'modern', subcategory: 'art', rarity: 'uncommon', base_price: 20000, description: '가치 있는 예술 작품' },
                
                { id: 'cosmetic_common_1', name: '화장품 (커먼)', category: 'modern', subcategory: 'cosmetics', rarity: 'common', base_price: 3000, description: '일반 화장품' },
                { id: 'cosmetic_rare_1', name: '화장품 (중급)', category: 'modern', subcategory: 'cosmetics', rarity: 'uncommon', base_price: 8000, description: '프리미엄 화장품' },
                
                { id: 'book_common_1', name: '서적 (커먼)', category: 'modern', subcategory: 'books', rarity: 'common', base_price: 2000, description: '일반 도서' },
                { id: 'daily_common_1', name: '생활용품 (커먼)', category: 'modern', subcategory: 'daily', rarity: 'common', base_price: 1500, description: '일상 생활용품' },
                
                // 판타지 아이템
                { id: 'mana_crystal_1', name: '마나 크리스탈', category: 'artifact', subcategory: 'crystal', rarity: 'uncommon', base_price: 12000, description: '마법력이 깃든 신비로운 크리스탈', magical_properties: '{"mana_boost": 10}' },
                { id: 'phoenix_feather_1', name: '불사조 깃털', category: 'material', subcategory: 'rare_material', rarity: 'rare', base_price: 30000, description: '전설의 불사조에서 떨어진 깃털', special_effects: '{"fire_resistance": 0.2}' },
                { id: 'ancient_coin_1', name: '고대 주화', category: 'artifact', subcategory: 'currency', rarity: 'epic', base_price: 50000, description: '고대 문명의 신비로운 화폐', lore_text: '잃어버린 왕국의 마지막 유산' },
                { id: 'dragon_scale_1', name: '용비늘', category: 'material', subcategory: 'rare_material', rarity: 'legendary', base_price: 100000, description: '고대 용의 비늘, 강력한 마법적 힘을 담고 있다' },
                
                // 소비 아이템
                { id: 'health_potion_1', name: '치유 물약', category: 'potion', subcategory: 'healing', rarity: 'common', base_price: 500, is_consumable: true, description: '체력을 회복시키는 물약' },
                { id: 'luck_potion_1', name: '행운 물약', category: 'potion', subcategory: 'buff', rarity: 'uncommon', base_price: 2000, is_consumable: true, description: '일정 시간 행운을 증가시키는 물약' },
                { id: 'wisdom_scroll_1', name: '지혜의 두루마리', category: 'consumable', subcategory: 'scroll', rarity: 'rare', base_price: 8000, is_consumable: true, description: '일시적으로 지능을 향상시키는 고대 두루마리' }
            ];
            
            for (const item of items) {
                const existing = await this.db.get('SELECT * FROM item_master WHERE id = ?', [item.id]);
                if (!existing) {
                    await this.db.run(`
                        INSERT INTO item_master (id, name, category, subcategory, rarity, base_price, description, lore_text, magical_properties, special_effects, is_consumable)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        item.id, item.name, item.category, item.subcategory || null, item.rarity, 
                        item.base_price, item.description || null, item.lore_text || null, 
                        item.magical_properties || null, item.special_effects || null, item.is_consumable || false
                    ]);
                }
            }
            
            // 3. 마법 속성 데이터
            const magicProperties = [
                { id: 'fire_enchant_1', name: '불의 축복', type: 'elemental', effect_formula: '{"damage_bonus": 0.15, "element": "fire"}', rarity: 'uncommon', description: '화염 속성 부여' },
                { id: 'luck_boost_1', name: '행운 증진', type: 'stat_boost', effect_formula: '{"luck": 5}', rarity: 'common', description: '행운 스탯 증가' },
                { id: 'merchant_favor_1', name: '상인의 은총', type: 'special_ability', effect_formula: '{"price_discount": 0.1}', rarity: 'rare', description: '모든 거래에서 10% 할인' },
                { id: 'crystal_resonance_1', name: '크리스탈 공명', type: 'special_ability', effect_formula: '{"mana_regen": 2}', rarity: 'epic', description: '마나 자동 회복' }
            ];
            
            for (const prop of magicProperties) {
                const existing = await this.db.get('SELECT * FROM magic_properties WHERE id = ?', [prop.id]);
                if (!existing) {
                    await this.db.run(`
                        INSERT INTO magic_properties (id, name, type, effect_formula, rarity, description)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `, [prop.id, prop.name, prop.type, prop.effect_formula, prop.rarity, prop.description]);
                }
            }
            
            // 4. 업적 데이터
            const achievements = [
                { id: 'first_trade', name: '첫 거래', description: '첫 번째 거래를 완료하세요', category: 'trading', condition_type: 'trade_count', condition_value: 1, reward_type: 'exp', reward_value: '{"experience": 50}' },
                { id: 'money_maker_1', name: '돈벌이 초보', description: '10만원을 벌어보세요', category: 'trading', condition_type: 'money_earned', condition_value: 100000, reward_type: 'money', reward_value: '{"gold": 5000}' },
                { id: 'collector_1', name: '수집가', description: '10개의 서로 다른 아이템을 수집하세요', category: 'collection', condition_type: 'unique_items', condition_value: 10, reward_type: 'cosmetic', reward_value: '{"cosmetic_id": 101}' },
                { id: 'explorer_1', name: '서울 탐험가', description: '5개 구역에서 거래하세요', category: 'exploration', condition_type: 'districts_visited', condition_value: 5, reward_type: 'title', reward_value: '{"title": "탐험가"}' },
                { id: 'friend_maker', name: '친구 만들기', description: '상인과 친구가 되세요', category: 'social', condition_type: 'merchant_friendship', condition_value: 1, reward_type: 'exp', reward_value: '{"experience": 100}' },
                { id: 'negotiator', name: '협상의 달인', description: '10번의 성공적인 협상을 하세요', category: 'trading', condition_type: 'successful_negotiations', condition_value: 10, reward_type: 'skill', reward_value: '{"negotiation_skill": 1}' }
            ];
            
            for (const achievement of achievements) {
                const existing = await this.db.get('SELECT * FROM achievements WHERE id = ?', [achievement.id]);
                if (!existing) {
                    await this.db.run(`
                        INSERT INTO achievements (id, name, description, category, condition_type, condition_value, reward_type, reward_value)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `, [achievement.id, achievement.name, achievement.description, achievement.category, 
                        achievement.condition_type, achievement.condition_value, achievement.reward_type, achievement.reward_value]);
                }
            }
            
            // 5. 확장된 상인 데이터 (판타지 요소 추가)
            const merchants = [
                {
                    id: 'merchant_gangnam_1',
                    name: '김테크',
                    title: '디지털 마법사',
                    type: 'retail',
                    personality: 'friendly',
                    district: '강남구',
                    lat: 37.5173,
                    lng: 126.9735,
                    required_license: 1,
                    appearance_id: 1,
                    portrait_id: 1,
                    price_modifier: 1.0,
                    negotiation_difficulty: 2,
                    preferred_items: '["modern"]',
                    reputation_requirement: 0,
                    friendship_level: 0,
                    inventory: JSON.stringify([
                        { item_id: 'it_common_1', name: 'IT부품 (커먼)', price: 5000, stock: 10 },
                        { item_id: 'it_rare_1', name: 'IT부품 (중급)', price: 15000, stock: 5 },
                        { item_id: 'mana_crystal_1', name: '마나 크리스탈', price: 12000, stock: 3 }
                    ]),
                    special_abilities: '["appraisal", "tech_enhancement"]',
                    quest_giver: true
                },
                {
                    id: 'merchant_hongdae_1',
                    name: '박아티스트',
                    title: '영감의 상인',
                    type: 'artisan',
                    personality: 'mysterious',
                    district: '홍대',
                    lat: 37.5563,
                    lng: 126.9236,
                    required_license: 1,
                    appearance_id: 2,
                    portrait_id: 2,
                    price_modifier: 0.9,
                    negotiation_difficulty: 3,
                    preferred_items: '["modern", "artifact"]',
                    reputation_requirement: 0,
                    friendship_level: 0,
                    inventory: JSON.stringify([
                        { item_id: 'art_common_1', name: '예술품 (커먼)', price: 8000, stock: 8 },
                        { item_id: 'art_rare_1', name: '예술품 (중급)', price: 20000, stock: 4 },
                        { item_id: 'phoenix_feather_1', name: '불사조 깃털', price: 30000, stock: 1 }
                    ]),
                    special_abilities: '["artistic_enhancement", "inspiration_reading"]',
                    quest_giver: true
                },
                {
                    id: 'merchant_myeongdong_1',
                    name: '이뷰티',
                    title: '아름다움의 연금술사',
                    type: 'retail',
                    personality: 'friendly',
                    district: '명동',
                    lat: 37.5636,
                    lng: 126.9834,
                    required_license: 1,
                    appearance_id: 3,
                    portrait_id: 3,
                    price_modifier: 0.95,
                    negotiation_difficulty: 2,
                    preferred_items: '["modern"]',
                    reputation_requirement: 0,
                    friendship_level: 0,
                    inventory: JSON.stringify([
                        { item_id: 'cosmetic_common_1', name: '화장품 (커먼)', price: 3000, stock: 15 },
                        { item_id: 'cosmetic_rare_1', name: '화장품 (중급)', price: 8000, stock: 7 },
                        { item_id: 'health_potion_1', name: '치유 물약', price: 500, stock: 20 }
                    ]),
                    special_abilities: '["beauty_enhancement", "potion_brewing"]',
                    quest_giver: false
                },
                {
                    id: 'merchant_mystic_1',
                    name: '현자 오라클',
                    title: '고대 지식의 수호자',
                    type: 'mystic',
                    personality: 'wise',
                    district: '종로구',
                    lat: 37.5735,
                    lng: 126.9788,
                    required_license: 2,
                    appearance_id: 4,
                    portrait_id: 4,
                    price_modifier: 1.2,
                    negotiation_difficulty: 5,
                    preferred_items: '["artifact", "material"]',
                    disliked_items: '["modern"]',
                    reputation_requirement: 100,
                    friendship_level: 0,
                    inventory: JSON.stringify([
                        { item_id: 'ancient_coin_1', name: '고대 주화', price: 50000, stock: 2 },
                        { item_id: 'wisdom_scroll_1', name: '지혜의 두루마리', price: 8000, stock: 5 },
                        { item_id: 'luck_potion_1', name: '행운 물약', price: 2000, stock: 10 }
                    ]),
                    special_abilities: '["ancient_appraisal", "mystical_enhancement", "fortune_telling"]',
                    quest_giver: true
                },
                {
                    id: 'merchant_dragon_1',
                    name: '용상인 드래곤',
                    title: '전설의 보물상',
                    type: 'collector',
                    personality: 'greedy',
                    district: '용산구',
                    lat: 37.5326,
                    lng: 126.9909,
                    required_license: 3,
                    appearance_id: 5,
                    portrait_id: 5,
                    price_modifier: 1.5,
                    negotiation_difficulty: 4,
                    preferred_items: '["artifact", "material"]',
                    reputation_requirement: 500,
                    friendship_level: 0,
                    inventory: JSON.stringify([
                        { item_id: 'dragon_scale_1', name: '용비늘', price: 100000, stock: 1 },
                        { item_id: 'ancient_coin_1', name: '고대 주화', price: 55000, stock: 3 }
                    ]),
                    special_abilities: '["legendary_appraisal", "treasure_location", "dragon_blessing"]',
                    quest_giver: true,
                    mood: 'grumpy'
                }
            ];
            
            for (const merchant of merchants) {
                const existing = await this.db.get('SELECT * FROM merchants WHERE id = ?', [merchant.id]);
                if (!existing) {
                    await this.db.run(`
                        INSERT INTO merchants (
                            id, name, title, type, personality, district, location_lat, location_lng, 
                            required_license, appearance_id, portrait_id, price_modifier, negotiation_difficulty,
                            preferred_items, disliked_items, reputation_requirement, friendship_level, 
                            inventory, special_abilities, quest_giver, mood
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        merchant.id, merchant.name, merchant.title, merchant.type, merchant.personality,
                        merchant.district, merchant.lat, merchant.lng, merchant.required_license,
                        merchant.appearance_id, merchant.portrait_id, merchant.price_modifier,
                        merchant.negotiation_difficulty, merchant.preferred_items, merchant.disliked_items || null,
                        merchant.reputation_requirement, merchant.friendship_level, merchant.inventory,
                        merchant.special_abilities, merchant.quest_giver, merchant.mood || 'neutral'
                    ]);
                }
            }
            
            // 6. 상인 대사 데이터
            const dialogues = [
                // 김테크 (강남 IT상인)
                { id: 'gangnam_greeting_1', merchant_id: 'merchant_gangnam_1', dialogue_type: 'greeting', dialogue_text: '안녕하세요! 최신 기술과 마법이 만나는 곳에 오신 걸 환영합니다!', priority: 1 },
                { id: 'gangnam_trade_1', merchant_id: 'merchant_gangnam_1', dialogue_type: 'trade_start', dialogue_text: '어떤 디지털 마법 아이템을 찾고 계신가요?', priority: 1 },
                { id: 'gangnam_success_1', merchant_id: 'merchant_gangnam_1', dialogue_type: 'trade_success', dialogue_text: '좋은 선택이에요! 이 아이템이 당신께 행운을 가져다주길!', priority: 1 },
                
                // 박아티스트 (홍대 예술상인)
                { id: 'hongdae_greeting_1', merchant_id: 'merchant_hongdae_1', dialogue_type: 'greeting', dialogue_text: '...영감이 느껴지는군요. 당신은 예술혼을 가진 분 같네요.', priority: 1 },
                { id: 'hongdae_trade_1', merchant_id: 'merchant_hongdae_1', dialogue_type: 'trade_start', dialogue_text: '예술은 단순한 거래가 아닙니다... 하지만 때로는 가치를 교환해야 하죠.', priority: 1 },
                { id: 'hongdae_special_1', merchant_id: 'merchant_hongdae_1', dialogue_type: 'special', condition_type: 'reputation', condition_value: '50', dialogue_text: '당신의 예술적 안목이 돋보이는군요. 특별한 것을 보여드릴까요?', priority: 2 },
                
                // 이뷰티 (명동 화장품상인)
                { id: 'myeongdong_greeting_1', merchant_id: 'merchant_myeongdong_1', dialogue_type: 'greeting', dialogue_text: '어서 오세요! 오늘도 아름다운 하루 되세요~', priority: 1 },
                { id: 'myeongdong_trade_1', merchant_id: 'merchant_myeongdong_1', dialogue_type: 'trade_start', dialogue_text: '피부에 좋은 제품들이 많아요. 뭘 찾으시나요?', priority: 1 },
                
                // 현자 오라클 (종로 신비상인)  
                { id: 'mystic_greeting_1', merchant_id: 'merchant_mystic_1', dialogue_type: 'greeting', condition_type: 'reputation', condition_value: '100', dialogue_text: '...운명의 실이 당신을 이곳으로 이끌었군요.', priority: 1 },
                { id: 'mystic_trade_1', merchant_id: 'merchant_mystic_1', dialogue_type: 'trade_start', dialogue_text: '고대의 지혜가 담긴 아이템들... 함부로 다뤄서는 안 됩니다.', priority: 1 },
                { id: 'mystic_reject_1', merchant_id: 'merchant_mystic_1', dialogue_type: 'trade_fail', dialogue_text: '아직 때가 아닙니다. 더 많은 경험을 쌓고 오십시오.', priority: 1 },
                
                // 용상인 드래곤 (용산 전설상인)
                { id: 'dragon_greeting_1', merchant_id: 'merchant_dragon_1', dialogue_type: 'greeting', condition_type: 'reputation', condition_value: '500', dialogue_text: '크흐흐... 또 다른 보물 사냥꾼이 나타났군.', priority: 1 },
                { id: 'dragon_trade_1', merchant_id: 'merchant_dragon_1', dialogue_type: 'trade_start', dialogue_text: '내 보물들은 그 어떤 것보다 값지다. 정말로 살 수 있나?', priority: 1 },
                { id: 'dragon_expensive_1', merchant_id: 'merchant_dragon_1', dialogue_type: 'trade_fail', dialogue_text: '크하하! 역시 인간들은 가난하군. 더 많은 금을 모아와라!', priority: 1 }
            ];
            
            for (const dialogue of dialogues) {
                const existing = await this.db.get('SELECT * FROM merchant_dialogues WHERE id = ?', [dialogue.id]);
                if (!existing) {
                    await this.db.run(`
                        INSERT INTO merchant_dialogues (id, merchant_id, dialogue_type, condition_type, condition_value, dialogue_text, priority)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `, [dialogue.id, dialogue.merchant_id, dialogue.dialogue_type, 
                        dialogue.condition_type || null, dialogue.condition_value || null, 
                        dialogue.dialogue_text, dialogue.priority]);
                }
            }
            
            // 7. 시장 동향 초기 데이터
            const marketTrends = [
                { item_id: 'it_common_1', district: '강남구', current_price: 5000, demand_level: 6, supply_level: 4 },
                { item_id: 'it_rare_1', district: '강남구', current_price: 15000, demand_level: 7, supply_level: 3 },
                { item_id: 'art_common_1', district: '홍대', current_price: 8000, demand_level: 5, supply_level: 5 },
                { item_id: 'cosmetic_common_1', district: '명동', current_price: 3000, demand_level: 8, supply_level: 6 },
                { item_id: 'mana_crystal_1', district: '강남구', current_price: 12000, demand_level: 4, supply_level: 2, trend_direction: 'rising' },
                { item_id: 'phoenix_feather_1', district: '홍대', current_price: 30000, demand_level: 2, supply_level: 1, trend_direction: 'volatile' }
            ];
            
            for (const trend of marketTrends) {
                const existing = await this.db.get('SELECT * FROM market_trends WHERE item_id = ? AND district = ?', [trend.item_id, trend.district]);
                if (!existing) {
                    await this.db.run(`
                        INSERT INTO market_trends (id, item_id, district, current_price, demand_level, supply_level, trend_direction)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `, [
                        `${trend.item_id}_${trend.district}`, trend.item_id, trend.district, 
                        trend.current_price, trend.demand_level, trend.supply_level, 
                        trend.trend_direction || 'stable'
                    ]);
                }
            }
            
            console.log('✅ 초기 데이터 생성 완료');
            
        } catch (error) {
            console.error('❌ 초기 데이터 생성 실패:', error);
            throw error;
        }
    }
    
    // ===== 기존 메서드들 (수정됨) =====
    
    async createUser(userData) {
        const sql = `INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)`;
        await this.db.run(sql, [userData.id, userData.email, userData.passwordHash]);
    }
    
    async getUserByEmail(email) {
        return await this.db.get(`SELECT * FROM users WHERE email = ?`, [email]);
    }
    
    async getUserById(id) {
        return await this.db.get(`SELECT * FROM users WHERE id = ?`, [id]);
    }
    
    async createPlayer(playerData) {
        const sql = `
            INSERT INTO players (id, user_id, name, money, trust_points, current_license, max_inventory_size)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await this.db.run(sql, [
            playerData.id, playerData.userId, playerData.name, 
            playerData.money || 50000, playerData.trustPoints || 0, 
            playerData.currentLicense || 1, playerData.maxInventorySize || 5
        ]);
        
        // 캐릭터 기본 외형 및 스탯 생성
        await this.db.run(`
            INSERT INTO character_appearance (player_id) VALUES (?)
        `, [playerData.id]);
        
        await this.db.run(`
            INSERT INTO character_stats (player_id) VALUES (?)
        `, [playerData.id]);
    }
    
    async getPlayerByUserId(userId) {
        const sql = `
            SELECT p.*, u.email, cs.level, cs.experience, cs.strength, cs.intelligence, cs.charisma, cs.luck
            FROM players p 
            JOIN users u ON p.user_id = u.id 
            LEFT JOIN character_stats cs ON p.id = cs.player_id
            WHERE p.user_id = ?
        `;
        return await this.db.get(sql, [userId]);
    }
    
    async updatePlayer(playerId, updates) {
        // SQL injection 방지를 위한 허용된 필드 화이트리스트
        const allowedFields = [
            'name', 'money', 'trust_points', 'current_license', 
            'max_inventory_size', 'location_lat', 'location_lng'
        ];
        
        // 허용되지 않은 필드 필터링
        const safeUpdates = {};
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                safeUpdates[key] = value;
            }
        }
        
        if (Object.keys(safeUpdates).length === 0) {
            throw new Error('업데이트할 유효한 필드가 없습니다.');
        }
        
        const fields = Object.keys(safeUpdates).map(key => `${key} = ?`).join(', ');
        const values = Object.values(safeUpdates);
        values.push(playerId);
        
        const sql = `UPDATE players SET ${fields}, last_active = CURRENT_TIMESTAMP WHERE id = ?`;
        await this.db.run(sql, values);
    }
    
    async getAllMerchants() {
        return await this.db.all(`SELECT * FROM merchants WHERE is_active = TRUE ORDER BY district, name`);
    }
    
    async getMerchantById(merchantId) {
        return await this.db.get(`SELECT * FROM merchants WHERE id = ?`, [merchantId]);
    }
    
    async getItemById(itemId) {
        return await this.db.get(`SELECT * FROM item_master WHERE id = ?`, [itemId]);
    }
    
    async getPlayerInventory(playerId) {
        const sql = `
            SELECT i.*, im.name, im.category, im.rarity, im.description 
            FROM inventory i 
            JOIN item_master im ON i.item_id = im.id 
            WHERE i.player_id = ?
            ORDER BY i.acquired_at DESC
        `;
        return await this.db.all(sql, [playerId]);
    }
    
    async getMarketTrends() {
        const sql = `
            SELECT mt.*, im.name, im.category, im.rarity 
            FROM market_trends mt 
            JOIN item_master im ON mt.item_id = im.id 
            ORDER BY mt.district, im.category
        `;
        return await this.db.all(sql);
    }
    
    async getMerchantDialogues(merchantId, dialogueType = null) {
        let sql = `
            SELECT * FROM merchant_dialogues 
            WHERE merchant_id = ? AND is_active = TRUE
        `;
        const params = [merchantId];
        
        if (dialogueType) {
            sql += ` AND dialogue_type = ?`;
            params.push(dialogueType);
        }
        
        sql += ` ORDER BY priority DESC, created_at ASC`;
        return await this.db.all(sql, params);
    }
    
    async close() {
        if (this.db) {
            return new Promise((resolve) => {
                this.db.close((err) => {
                    if (err) {
                        console.error('❌ 데이터베이스 종료 오류:', err);
                    } else {
                        console.log('✅ 데이터베이스 연결 종료');
                    }
                    resolve();
                });
            });
        }
    }
}

export default DatabaseManager;