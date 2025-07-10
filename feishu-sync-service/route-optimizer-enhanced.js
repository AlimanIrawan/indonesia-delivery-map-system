/**
 * 增强版路线优化模块 v2.1
 * 集成Google Maps API诊断和智能备用策略
 * 
 * 新增功能：
 * - 智能API错误检测和处理
 * - 自适应备用策略（直线距离）
 * - API配额监控和优化
 * - 批量API调用优化
 */

const { Client } = require('@googlemaps/google-maps-services-js');
const NodeCache = require('node-cache');
const GoogleMapsApiDiagnostic = require('./google-maps-diagnostic');

class EnhancedRouteOptimizer {
    constructor(googleMapsApiKey) {
        this.googleMapsClient = new Client({});
        this.apiKey = googleMapsApiKey;
        this.maxCapacity = 80;
        this.headquarters = {
            lat: -6.11258762834466,
            lng: 106.91732818555802,
            name: '雅加达总部'
        };
        
        // 缓存和监控
        this.distanceCache = new NodeCache({ stdTTL: 86400 });
        this.apiCallsToday = 0;
        this.apiFailures = 0;
        this.lastResetDate = new Date().toDateString();
        this.useFallbackMode = false; // 是否使用备用模式
        this.apiHealthy = true; // API健康状态
        
        // 诊断工具
        this.diagnostic = new GoogleMapsApiDiagnostic(googleMapsApiKey);
        
        console.log('🚀 增强版路线优化器初始化完成');
    }

    /**
     * 智能API健康检查
     */
    async checkApiHealth() {
        console.log('🏥 检查Google Maps API健康状态...');
        
        try {
            // 执行简单的API测试
            const testResult = await this.googleMapsClient.distancematrix({
                params: {
                    origins: ['-6.1, 106.8'],
                    destinations: ['-6.11, 106.81'],
                    mode: 'driving',
                    key: this.apiKey
                }
            });

            if (testResult.data.status === 'OK') {
                this.apiHealthy = true;
                this.useFallbackMode = false;
                console.log('✅ Google Maps API运行正常');
                return true;
            } else {
                console.log(`⚠️ API响应状态: ${testResult.data.status}`);
                this.apiHealthy = false;
                return false;
            }
        } catch (error) {
            console.log(`❌ API健康检查失败: ${error.message}`);
            this.apiHealthy = false;
            
            // 根据错误类型决定是否使用备用模式
            if (error.response?.status === 403) {
                console.log('🔄 切换到直线距离备用模式');
                this.useFallbackMode = true;
            }
            
            return false;
        }
    }

    /**
     * 智能距离计算 - 自适应API/备用方案
     */
    async getDistance(from, to) {
        // 生成缓存键
        const cacheKey = `${from.lat.toFixed(6)},${from.lng.toFixed(6)}-${to.lat.toFixed(6)},${to.lng.toFixed(6)}`;
        
        // 检查缓存
        const cached = this.distanceCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        // 如果API不健康或已进入备用模式，直接使用直线距离
        if (this.useFallbackMode || !this.apiHealthy) {
            return this.calculateFallbackDistance(from, to, cacheKey);
        }

        try {
            // 重置API调用计数器
            this.resetApiCountIfNewDay();

            const response = await this.googleMapsClient.distancematrix({
                params: {
                    origins: [`${from.lat},${from.lng}`],
                    destinations: [`${to.lat},${to.lng}`],
                    mode: 'driving',
                    language: 'zh-CN',
                    avoid: ['tolls'],
                    key: this.apiKey
                },
                timeout: 10000 // 10秒超时
            });

            this.apiCallsToday++;

            if (response.data.status === 'OK' && 
                response.data.rows[0]?.elements[0]?.status === 'OK') {
                
                const element = response.data.rows[0].elements[0];
                const result = {
                    distance_km: element.distance.value / 1000,
                    duration_minutes: element.duration.value / 60,
                    distance_text: element.distance.text,
                    duration_text: element.duration.text,
                    source: 'google_maps_api'
                };

                // 缓存结果
                this.distanceCache.set(cacheKey, result);
                
                // 重置失败计数器（成功调用）
                this.apiFailures = 0;
                
                return result;
            } else {
                throw new Error(`Google Maps API状态错误: ${response.data.status}`);
            }

        } catch (error) {
            this.apiFailures++;
            
            // 连续失败超过阈值，切换到备用模式
            if (this.apiFailures >= 3) {
                console.log(`⚠️ API连续失败${this.apiFailures}次，切换到备用模式`);
                this.useFallbackMode = true;
                this.apiHealthy = false;
            }
            
            console.log(`⚠️ API调用失败(${this.apiFailures}/3)，使用直线距离: ${error.message}`);
            
            return this.calculateFallbackDistance(from, to, cacheKey);
        }
    }

    /**
     * 计算备用距离（直线距离 + 道路系数）
     */
    calculateFallbackDistance(from, to, cacheKey) {
        // 计算直线距离
        const straightDistance = this.calculateStraightLineDistance(from.lat, from.lng, to.lat, to.lng);
        
        // 应用道路系数（Jakarta市区大约1.3-1.5倍）
        const roadFactor = 1.4; // 经验值
        const estimatedDistance = straightDistance * roadFactor;
        
        const result = {
            distance_km: estimatedDistance,
            duration_minutes: estimatedDistance * 2.5, // 估算：1km约2.5分钟（考虑雅加达交通）
            distance_text: `${estimatedDistance.toFixed(1)} km (估算)`,
            duration_text: `${(estimatedDistance * 2.5).toFixed(0)} 分钟 (估算)`,
            source: 'fallback_calculation',
            straight_distance: straightDistance
        };

        // 缓存备用结果
        this.distanceCache.set(cacheKey, result);
        return result;
    }

    /**
     * 批量距离计算优化
     */
    async calculateBatchDistances(points) {
        console.log(`📊 批量计算${points.length}个点的距离矩阵...`);
        
        // 如果使用备用模式，直接计算所有直线距离
        if (this.useFallbackMode || !this.apiHealthy) {
            console.log('🔄 使用批量直线距离计算');
            return this.calculateFallbackDistanceMatrix(points);
        }

        try {
            // 准备API调用参数
            const origins = points.map(p => `${p.lat},${p.lng}`);
            const destinations = points.map(p => `${p.lat},${p.lng}`);

            const response = await this.googleMapsClient.distancematrix({
                params: {
                    origins: origins,
                    destinations: destinations,
                    mode: 'driving',
                    language: 'zh-CN',
                    avoid: ['tolls'],
                    key: this.apiKey
                },
                timeout: 30000 // 30秒超时
            });

            this.apiCallsToday++;

            if (response.data.status === 'OK') {
                console.log('✅ 批量API调用成功');
                return this.parseDistanceMatrix(response.data, points);
            } else {
                throw new Error(`批量API调用失败: ${response.data.status}`);
            }

        } catch (error) {
            console.log(`❌ 批量API调用失败: ${error.message}`);
            console.log('🔄 回退到直线距离计算');
            this.useFallbackMode = true;
            return this.calculateFallbackDistanceMatrix(points);
        }
    }

    /**
     * 解析Distance Matrix API响应
     */
    parseDistanceMatrix(data, points) {
        const matrix = [];
        
        for (let i = 0; i < points.length; i++) {
            matrix[i] = [];
            for (let j = 0; j < points.length; j++) {
                const element = data.rows[i]?.elements[j];
                
                if (element && element.status === 'OK') {
                    matrix[i][j] = {
                        distance_km: element.distance.value / 1000,
                        duration_minutes: element.duration.value / 60,
                        source: 'google_maps_api'
                    };
                } else {
                    // 单个元素失败，使用直线距离
                    const distance = this.calculateStraightLineDistance(
                        points[i].lat, points[i].lng,
                        points[j].lat, points[j].lng
                    );
                    matrix[i][j] = {
                        distance_km: distance * 1.4,
                        duration_minutes: distance * 1.4 * 2.5,
                        source: 'fallback_calculation'
                    };
                }
            }
        }
        
        return matrix;
    }

    /**
     * 计算备用距离矩阵
     */
    calculateFallbackDistanceMatrix(points) {
        console.log('📏 计算直线距离矩阵...');
        const matrix = [];
        
        for (let i = 0; i < points.length; i++) {
            matrix[i] = [];
            for (let j = 0; j < points.length; j++) {
                const distance = this.calculateStraightLineDistance(
                    points[i].lat, points[i].lng,
                    points[j].lat, points[j].lng
                );
                
                matrix[i][j] = {
                    distance_km: distance * 1.4, // 道路系数
                    duration_minutes: distance * 1.4 * 2.5, // 时间估算
                    source: 'fallback_calculation'
                };
            }
        }
        
        return matrix;
    }

    /**
     * 直线距离计算
     */
    calculateStraightLineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // 地球半径（公里）
        const dLat = this.toRadians(lat2 - lat1);
        const dLng = this.toRadians(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * 获取API使用统计（增强版）
     */
    getApiUsageStats() {
        return {
            api_calls_today: this.apiCallsToday,
            api_failures: this.apiFailures,
            remaining_calls: Math.max(0, 2500 - this.apiCallsToday), // Google免费配额
            cache_size: this.distanceCache.keys().length,
            last_reset: this.lastResetDate,
            api_healthy: this.apiHealthy,
            fallback_mode: this.useFallbackMode,
            cache_hit_rate: this.calculateCacheHitRate()
        };
    }

    /**
     * 计算缓存命中率
     */
    calculateCacheHitRate() {
        const totalRequests = this.apiCallsToday + this.distanceCache.keys().length;
        if (totalRequests === 0) return 0;
        return ((this.distanceCache.keys().length / totalRequests) * 100).toFixed(1);
    }

    /**
     * 重置API计数器
     */
    resetApiCountIfNewDay() {
        const currentDate = new Date().toDateString();
        if (currentDate !== this.lastResetDate) {
            this.apiCallsToday = 0;
            this.apiFailures = 0;
            this.lastResetDate = currentDate;
            console.log('🔄 重置API调用计数器');
        }
    }

    /**
     * 运行诊断报告
     */
    async runDiagnostic() {
        console.log('\n🔍 运行Google Maps API诊断...');
        const results = await this.diagnostic.runDiagnostic();
        await this.diagnostic.testSpecificRoute();
        this.diagnostic.printReport(results);
        return results;
    }

    // 继承原有的优化算法方法
    // 为了简化，这里只展示关键的增强部分
    // 实际使用时需要将原RouteOptimizer的所有方法复制过来
    
    /**
     * 获取优化器状态
     */
    getOptimizerStatus() {
        return {
            version: '2.1 Enhanced',
            api_key_configured: !!this.apiKey,
            api_healthy: this.apiHealthy,
            fallback_mode: this.useFallbackMode,
            cache_enabled: true,
            diagnostic_available: true,
            enhancement_features: [
                'smart_api_fallback',
                'batch_distance_calculation',
                'api_health_monitoring',
                'enhanced_error_handling',
                'cache_optimization'
            ]
        };
    }
}

module.exports = EnhancedRouteOptimizer; 