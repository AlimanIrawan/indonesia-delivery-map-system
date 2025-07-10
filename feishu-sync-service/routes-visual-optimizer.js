/**
 * Routes API 路线可视化优化器
 * 专注于基础路线可视化功能，不包含导航等复杂功能
 * 直接替换Legacy API，提供真实路线数据
 */

const axios = require('axios');
const NodeCache = require('node-cache');

class RoutesVisualOptimizer {
    constructor(googleMapsApiKey) {
        this.apiKey = googleMapsApiKey;
        this.maxCapacity = 80;
        this.headquarters = {
            lat: -6.11258762834466,
            lng: 106.91732818555802,
            name: '雅加达总部'
        };
        
        // 缓存配置：缓存1天
        this.distanceCache = new NodeCache({ stdTTL: 86400 });
        this.routeCache = new NodeCache({ stdTTL: 86400 }); // 路线几何数据缓存
        this.apiCallsToday = 0;
        this.lastResetDate = new Date().toDateString();
        
        console.log('🗺️ Routes API可视化优化器初始化完成');
    }

    /**
     * 主优化算法：将所有订单分批并优化路线
     */
    async optimizeAllRoutes(orders) {
        try {
            console.log(`🚀 开始Routes API路线优化...`);
            console.log(`📦 总订单数: ${orders.length}`);
            console.log(`🚛 车辆容量限制: ${this.maxCapacity}件`);

            // 验证订单数据
            const validatedOrders = this.validateOrders(orders);
            if (validatedOrders.length === 0) {
                return { error: '没有有效的订单数据' };
            }

            // 第一步：按容量分批
            const batches = await this.splitIntoBatches(validatedOrders);
            console.log(`📋 分成 ${batches.length} 个批次`);

            // 第二步：每批优化路线并获取可视化数据
            const optimizedBatches = [];
            let totalDistance = 0;
            let totalDuration = 0;

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                console.log(`\n🔄 优化第 ${i + 1} 批次 (${batch.length} 个订单)...`);
                
                const optimizedBatch = await this.optimizeSingleBatch(batch, i + 1);
                optimizedBatches.push(optimizedBatch);

                totalDistance += optimizedBatch.total_distance;
                totalDuration += optimizedBatch.total_duration;
            }

            // 生成统计信息
            const statistics = this.generateStatistics(optimizedBatches, validatedOrders);

            const result = {
                batches: optimizedBatches,
                total_distance: Math.round(totalDistance * 100) / 100,
                total_duration: Math.round(totalDuration * 10) / 10,
                statistics: statistics,
                api_usage: this.getApiUsageStats(),
                visualization_ready: true // 标识包含可视化数据
            };

            console.log(`\n✅ Routes API路线优化完成!`);
            console.log(`📊 总距离: ${totalDistance.toFixed(1)}km`);
            console.log(`⏱️ 总时间: ${totalDuration.toFixed(1)}分钟`);
            console.log(`🗺️ 可视化数据: 已生成`);

            return result;

        } catch (error) {
            console.error('❌ Routes API优化失败:', error);
            return { error: error.message };
        }
    }

    /**
     * 单批次路线优化：获取真实路线数据
     */
    async optimizeSingleBatch(batch, batchNumber) {
        if (batch.length <= 1) {
            if (batch.length === 1) {
                const order = batch[0];
                const routeData = await this.getDetailedRoute(
                    { lat: this.headquarters.lat, lng: this.headquarters.lng },
                    { lat: order.lat, lng: order.lng }
                );
                
                return {
                    batch_number: batchNumber,
                    route: batch,
                    total_distance: routeData.distance_km * 2, // 往返
                    total_duration: routeData.duration_minutes * 2,
                    route_order: [order.id],
                    capacity_used: order.dus_count,
                    // 可视化数据
                    route_polylines: [
                        {
                            from: 'headquarters',
                            to: order.id,
                            polyline: routeData.polyline,
                            distance: routeData.distance_km,
                            duration: routeData.duration_minutes
                        },
                        {
                            from: order.id,
                            to: 'headquarters',
                            polyline: routeData.return_polyline || routeData.polyline, // 返程路线
                            distance: routeData.distance_km,
                            duration: routeData.duration_minutes
                        }
                    ]
                };
            } else {
                return {
                    batch_number: batchNumber,
                    route: [],
                    total_distance: 0,
                    total_duration: 0,
                    route_order: [],
                    capacity_used: 0,
                    route_polylines: []
                };
            }
        }

        console.log(`  🔍 使用Routes API优化路线...`);
        
        // 使用最近邻算法优化路线顺序
        const optimizedRoute = await this.nearestNeighborTsp(batch);
        
        // 获取每段路线的详细数据
        const routePolylines = await this.getRoutePolylines(optimizedRoute);
        const routeDistance = this.calculateRouteDistanceFromPolylines(routePolylines);

        const totalCapacity = batch.reduce((sum, order) => sum + order.dus_count, 0);

        return {
            batch_number: batchNumber,
            route: optimizedRoute,
            total_distance: routeDistance.total_distance,
            total_duration: routeDistance.total_duration,
            route_order: optimizedRoute.map(order => order.id),
            capacity_used: totalCapacity,
            // 核心：可视化数据
            route_polylines: routePolylines
        };
    }

    /**
     * 获取详细路线数据（包含可视化polyline）
     */
    async getDetailedRoute(from, to) {
        // 生成缓存键
        const cacheKey = `route_${from.lat.toFixed(6)},${from.lng.toFixed(6)}-${to.lat.toFixed(6)},${to.lng.toFixed(6)}`;
        
        // 检查缓存
        const cached = this.routeCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            // 重置API调用计数器
            this.resetApiCountIfNewDay();

            const requestBody = {
                origin: {
                    location: {
                        latLng: {
                            latitude: from.lat,
                            longitude: from.lng
                        }
                    }
                },
                destination: {
                    location: {
                        latLng: {
                            latitude: to.lat,
                            longitude: to.lng
                        }
                    }
                },
                travelMode: "DRIVE",
                routingPreference: "TRAFFIC_UNAWARE", // 不使用实时交通，简化功能
                routeModifiers: {
                    avoidTolls: true,
                    avoidHighways: false
                }
            };

            const response = await axios.post(
                'https://routes.googleapis.com/directions/v2:computeRoutes',
                requestBody,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': this.apiKey,
                        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline'
                    },
                    timeout: 10000
                }
            );

            this.apiCallsToday++;

            if (response.data.routes && response.data.routes.length > 0) {
                const route = response.data.routes[0];
                
                const result = {
                    distance_km: route.distanceMeters / 1000,
                    duration_minutes: this.parseDuration(route.duration),
                    polyline: route.polyline.encodedPolyline, // 关键：可视化数据
                    distance_text: `${(route.distanceMeters / 1000).toFixed(1)} km`,
                    duration_text: `${this.parseDuration(route.duration).toFixed(0)} 分钟`,
                    source: 'routes_api'
                };

                // 缓存结果
                this.routeCache.set(cacheKey, result);
                this.distanceCache.set(`${from.lat.toFixed(6)},${from.lng.toFixed(6)}-${to.lat.toFixed(6)},${to.lng.toFixed(6)}`, result);
                
                return result;
            } else {
                throw new Error('Routes API返回空路线数据');
            }

        } catch (error) {
            console.log(`⚠️ Routes API调用失败，使用备用方案: ${error.message}`);
            
            // 降级：使用直线距离 + 道路系数
            const straightDistance = this.calculateStraightLineDistance(from.lat, from.lng, to.lat, to.lng);
            const roadFactor = 1.4;
            const estimatedDistance = straightDistance * roadFactor;
            
            const result = {
                distance_km: estimatedDistance,
                duration_minutes: estimatedDistance * 2.5,
                polyline: null, // 备用方案无法提供真实路线
                distance_text: `${estimatedDistance.toFixed(1)} km (估算)`,
                duration_text: `${(estimatedDistance * 2.5).toFixed(0)} 分钟 (估算)`,
                source: 'fallback_calculation'
            };

            // 缓存备用结果
            this.routeCache.set(cacheKey, result);
            return result;
        }
    }

    /**
     * 获取完整路线的polylines数据
     */
    async getRoutePolylines(route) {
        const polylines = [];
        let currentPos = { lat: this.headquarters.lat, lng: this.headquarters.lng };
        
        // 总部到第一个订单
        if (route.length > 0) {
            const firstOrder = route[0];
            const routeData = await this.getDetailedRoute(currentPos, { lat: firstOrder.lat, lng: firstOrder.lng });
            polylines.push({
                from: 'headquarters',
                to: firstOrder.id,
                polyline: routeData.polyline,
                distance: routeData.distance_km,
                duration: routeData.duration_minutes,
                from_coords: currentPos,
                to_coords: { lat: firstOrder.lat, lng: firstOrder.lng }
            });
            currentPos = { lat: firstOrder.lat, lng: firstOrder.lng };
        }

        // 订单之间的路线
        for (let i = 0; i < route.length - 1; i++) {
            const fromOrder = route[i];
            const toOrder = route[i + 1];
            
            const routeData = await this.getDetailedRoute(
                { lat: fromOrder.lat, lng: fromOrder.lng },
                { lat: toOrder.lat, lng: toOrder.lng }
            );
            
            polylines.push({
                from: fromOrder.id,
                to: toOrder.id,
                polyline: routeData.polyline,
                distance: routeData.distance_km,
                duration: routeData.duration_minutes,
                from_coords: { lat: fromOrder.lat, lng: fromOrder.lng },
                to_coords: { lat: toOrder.lat, lng: toOrder.lng }
            });
        }

        // 最后一个订单回到总部
        if (route.length > 0) {
            const lastOrder = route[route.length - 1];
            const routeData = await this.getDetailedRoute(
                { lat: lastOrder.lat, lng: lastOrder.lng },
                { lat: this.headquarters.lat, lng: this.headquarters.lng }
            );
            
            polylines.push({
                from: lastOrder.id,
                to: 'headquarters',
                polyline: routeData.polyline,
                distance: routeData.distance_km,
                duration: routeData.duration_minutes,
                from_coords: { lat: lastOrder.lat, lng: lastOrder.lng },
                to_coords: { lat: this.headquarters.lat, lng: this.headquarters.lng }
            });
        }

        return polylines;
    }

    /**
     * 从polylines数据计算总距离和时间
     */
    calculateRouteDistanceFromPolylines(polylines) {
        const totalDistance = polylines.reduce((sum, segment) => {
            return sum + (segment.distance || 0);
        }, 0);
        
        const totalDuration = polylines.reduce((sum, segment) => {
            return sum + (segment.duration || 0);
        }, 0);

        return {
            total_distance: Math.round(totalDistance * 100) / 100,
            total_duration: Math.round(totalDuration * 10) / 10
        };
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
     * 最近邻TSP算法
     */
    async nearestNeighborTsp(orders) {
        if (orders.length === 0) return [];

        const route = [];
        const unvisited = [...orders];
        let currentPos = { lat: this.headquarters.lat, lng: this.headquarters.lng };

        while (unvisited.length > 0) {
            let nearestOrder = null;
            let minDistance = Infinity;
            let nearestIndex = -1;

            for (let i = 0; i < unvisited.length; i++) {
                const order = unvisited[i];
                const routeData = await this.getDetailedRoute(
                    currentPos,
                    { lat: order.lat, lng: order.lng }
                );
                
                if (routeData.distance_km < minDistance) {
                    minDistance = routeData.distance_km;
                    nearestOrder = order;
                    nearestIndex = i;
                }
            }

            if (nearestOrder) {
                route.push(nearestOrder);
                currentPos = { lat: nearestOrder.lat, lng: nearestOrder.lng };
                unvisited.splice(nearestIndex, 1);
            }
        }

        return route;
    }

    /**
     * 分批逻辑
     */
    async splitIntoBatches(orders) {
        const batches = [];
        let currentBatch = [];
        let currentCapacity = 0;

        for (const order of orders) {
            if (currentCapacity + order.dus_count <= this.maxCapacity) {
                currentBatch.push(order);
                currentCapacity += order.dus_count;
            } else {
                if (currentBatch.length > 0) {
                    batches.push(currentBatch);
                }
                currentBatch = [order];
                currentCapacity = order.dus_count;
            }
        }

        if (currentBatch.length > 0) {
            batches.push(currentBatch);
        }

        return batches;
    }

    /**
     * 验证订单数据
     */
    validateOrders(orders) {
        return orders.filter(order => {
            if (!order.lat || !order.lng || order.lat === 0 || order.lng === 0) {
                console.log(`⚠️ 跳过无效订单: ${order.id || order.name} (缺少坐标)`);
                return false;
            }
            if (!order.dus_count || order.dus_count <= 0) {
                console.log(`⚠️ 跳过无效订单: ${order.id || order.name} (DUS数量无效)`);
                return false;
            }
            return true;
        });
    }

    /**
     * 生成统计信息
     */
    generateStatistics(batches, originalOrders) {
        const totalOrders = originalOrders.length;
        const processedOrders = batches.reduce((sum, batch) => sum + batch.route.length, 0);
        const totalCapacity = batches.reduce((sum, batch) => sum + batch.capacity_used, 0);
        const totalPolylines = batches.reduce((sum, batch) => sum + (batch.route_polylines?.length || 0), 0);
        
        return {
            total_orders: totalOrders,
            processed_orders: processedOrders,
            total_batches: batches.length,
            total_capacity: totalCapacity,
            total_route_segments: totalPolylines,
            average_orders_per_batch: Math.round(processedOrders / batches.length * 10) / 10,
            optimization_efficiency: Math.round(processedOrders / totalOrders * 100) + '%',
            visualization_ready: totalPolylines > 0
        };
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
            route_cache_size: this.routeCache.keys().length,
            last_reset: this.lastResetDate,
            api_type: 'routes_api_visual'
        };
    }
}

module.exports = RoutesVisualOptimizer; 