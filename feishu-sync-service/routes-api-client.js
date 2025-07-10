/**
 * Routes API 客户端包装器
 * 兼容现有Distance Matrix API接口
 */

const axios = require('axios');
const NodeCache = require('node-cache');

class RoutesApiClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://routes.googleapis.com';
        this.distanceCache = new NodeCache({ stdTTL: 86400 }); // 24小时缓存
        this.apiCallsToday = 0;
        this.lastResetDate = new Date().toDateString();
    }

    /**
     * 兼容现有getDistance接口
     * 将Routes API包装成与Distance Matrix API相同的接口
     */
    async getDistance(from, to) {
        // 生成缓存键
        const cacheKey = `${from.lat.toFixed(6)},${from.lng.toFixed(6)}-${to.lat.toFixed(6)},${to.lng.toFixed(6)}`;
        
        // 检查缓存
        const cached = this.distanceCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            // 重置API调用计数器
            this.resetApiCountIfNewDay();

            // Routes API请求体
            const requestBody = {
                origins: [{
                    waypoint: {
                        location: {
                            latLng: {
                                latitude: from.lat,
                                longitude: from.lng
                            }
                        }
                    }
                }],
                destinations: [{
                    waypoint: {
                        location: {
                            latLng: {
                                latitude: to.lat,
                                longitude: to.lng
                            }
                        }
                    }
                }],
                travelMode: "DRIVE",
                routingPreference: "TRAFFIC_AWARE" // 新功能：平衡质量和速度
            };

            const response = await axios.post(
                `${this.baseUrl}/distanceMatrix/v2:computeRouteMatrix`,
                requestBody,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': this.apiKey,
                        'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters'
                    },
                    timeout: 10000
                }
            );

            this.apiCallsToday++;

            if (response.data && response.data.length > 0) {
                const element = response.data[0];
                
                // 转换为兼容格式
                const result = {
                    distance_km: element.distanceMeters / 1000,
                    duration_minutes: this.parseDuration(element.duration),
                    distance_text: `${(element.distanceMeters / 1000).toFixed(1)} km`,
                    duration_text: `${this.parseDuration(element.duration).toFixed(0)} 分钟`,
                    source: 'routes_api'
                };

                // 缓存结果
                this.distanceCache.set(cacheKey, result);
                return result;
            } else {
                throw new Error('Routes API返回空数据');
            }

        } catch (error) {
            console.log(`⚠️ Routes API调用失败，使用备用方案: ${error.message}`);
            
            // 降级：使用直线距离 + 道路系数
            return this.calculateFallbackDistance(from, to, cacheKey);
        }
    }

    /**
     * 批量距离计算 - Routes API原生支持
     */
    async calculateBatchDistances(points) {
        console.log(`📊 使用Routes API批量计算${points.length}个点的距离矩阵...`);
        
        try {
            // 准备批量请求
            const origins = points.map(p => ({
                waypoint: {
                    location: {
                        latLng: {
                            latitude: p.lat,
                            longitude: p.lng
                        }
                    }
                }
            }));

            const requestBody = {
                origins: origins,
                destinations: origins, // 计算所有点之间的距离
                travelMode: "DRIVE",
                routingPreference: "TRAFFIC_AWARE"
            };

            const response = await axios.post(
                `${this.baseUrl}/distanceMatrix/v2:computeRouteMatrix`,
                requestBody,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': this.apiKey,
                        'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters'
                    },
                    timeout: 30000
                }
            );

            this.apiCallsToday++;
            console.log('✅ Routes API批量调用成功');
            
            return this.parseRouteMatrix(response.data, points);

        } catch (error) {
            console.log(`❌ Routes API批量调用失败: ${error.message}`);
            console.log('🔄 回退到直线距离计算');
            return this.calculateFallbackDistanceMatrix(points);
        }
    }

    /**
     * 解析Routes API响应为矩阵格式
     */
    parseRouteMatrix(data, points) {
        const matrix = [];
        
        // 初始化矩阵
        for (let i = 0; i < points.length; i++) {
            matrix[i] = [];
            for (let j = 0; j < points.length; j++) {
                matrix[i][j] = null;
            }
        }

        // 填充矩阵数据
        if (data && Array.isArray(data)) {
            for (const element of data) {
                const i = element.originIndex || 0;
                const j = element.destinationIndex || 0;
                
                if (element.distanceMeters && element.duration) {
                    matrix[i][j] = {
                        distance_km: element.distanceMeters / 1000,
                        duration_minutes: this.parseDuration(element.duration),
                        source: 'routes_api'
                    };
                }
            }
        }

        // 填充缺失数据
        for (let i = 0; i < points.length; i++) {
            for (let j = 0; j < points.length; j++) {
                if (!matrix[i][j]) {
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
     * 解析duration字符串 (如 "300s" -> 5分钟)
     */
    parseDuration(duration) {
        if (typeof duration === 'string' && duration.endsWith('s')) {
            return parseFloat(duration.slice(0, -1)) / 60; // 秒转分钟
        }
        return 0;
    }

    /**
     * 计算备用距离
     */
    calculateFallbackDistance(from, to, cacheKey) {
        const straightDistance = this.calculateStraightLineDistance(from.lat, from.lng, to.lat, to.lng);
        const roadFactor = 1.4; // Jakarta道路系数
        const estimatedDistance = straightDistance * roadFactor;
        
        const result = {
            distance_km: estimatedDistance,
            duration_minutes: estimatedDistance * 2.5,
            distance_text: `${estimatedDistance.toFixed(1)} km (估算)`,
            duration_text: `${(estimatedDistance * 2.5).toFixed(0)} 分钟 (估算)`,
            source: 'fallback_calculation',
            straight_distance: straightDistance
        };

        this.distanceCache.set(cacheKey, result);
        return result;
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
                    distance_km: distance * 1.4,
                    duration_minutes: distance * 1.4 * 2.5,
                    source: 'fallback_calculation'
                };
            }
        }
        
        return matrix;
    }

    /**
     * 计算直线距离 (Haversine公式)
     */
    calculateStraightLineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // 地球半径(km)
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    /**
     * 重置API调用计数器
     */
    resetApiCountIfNewDay() {
        const today = new Date().toDateString();
        if (today !== this.lastResetDate) {
            this.apiCallsToday = 0;
            this.lastResetDate = today;
            console.log(`🔄 API调用计数器已重置 (新的一天: ${today})`);
        }
    }

    /**
     * 获取API使用统计
     */
    getApiUsageStats() {
        return {
            api_calls_today: this.apiCallsToday,
            remaining_calls: 10000 - this.apiCallsToday, // Routes API有10,000次免费
            cache_size: this.distanceCache.keys().length,
            last_reset: this.lastResetDate,
            api_type: 'routes_api'
        };
    }
}

module.exports = RoutesApiClient; 