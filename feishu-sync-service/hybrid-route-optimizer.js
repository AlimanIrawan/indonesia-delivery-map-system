/**
 * 混合路线优化器 v3.0
 * 支持Distance Matrix API (Legacy) 和 Routes API
 * 可以在两种API之间无缝切换
 */

const RouteOptimizer = require('./route-optimizer');
const RoutesApiClient = require('./routes-api-client');

class HybridRouteOptimizer {
    constructor(googleMapsApiKey) {
        this.apiKey = googleMapsApiKey;
        this.maxCapacity = 80;
        this.headquarters = {
            lat: -6.11258762834466,
            lng: 106.91732818555802,
            name: '雅加达总部'
        };
        
        // 初始化两种API客户端
        this.legacyOptimizer = new RouteOptimizer(googleMapsApiKey);
        this.routesApiClient = new RoutesApiClient(googleMapsApiKey);
        
        // 配置选项
        this.useRoutesApi = process.env.USE_ROUTES_API === 'true'; // 环境变量控制
        this.fallbackToLegacy = true; // Routes API失败时回退到Legacy API
        
        console.log(`🚀 混合路线优化器初始化完成`);
        console.log(`📡 当前使用: ${this.useRoutesApi ? 'Routes API' : 'Distance Matrix API (Legacy)'}`);
        console.log(`🔄 自动回退: ${this.fallbackToLegacy ? '启用' : '禁用'}`);
    }

    /**
     * 主优化入口 - 自动选择最佳API
     */
    async optimizeAllRoutes(orders) {
        console.log(`🎯 开始混合路线优化...`);
        console.log(`📦 订单数: ${orders.length}`);
        
        // 根据订单数量和配置选择API
        const apiChoice = this.selectOptimalApi(orders.length);
        console.log(`📡 选择API: ${apiChoice}`);
        
        try {
            if (apiChoice === 'routes') {
                return await this.optimizeWithRoutesApi(orders);
            } else {
                return await this.optimizeWithLegacyApi(orders);
            }
        } catch (error) {
            console.log(`❌ ${apiChoice} API失败: ${error.message}`);
            
            // 自动回退机制
            if (this.fallbackToLegacy && apiChoice === 'routes') {
                console.log('🔄 自动回退到Legacy API...');
                return await this.optimizeWithLegacyApi(orders);
            } else if (apiChoice === 'legacy') {
                console.log('🔄 尝试使用Routes API...');
                return await this.optimizeWithRoutesApi(orders);
            }
            
            throw error;
        }
    }

    /**
     * 智能API选择策略
     */
    selectOptimalApi(orderCount) {
        // 策略1: 强制使用指定API
        if (this.useRoutesApi === true) {
            return 'routes';
        } else if (this.useRoutesApi === false) {
            return 'legacy';
        }
        
        // 策略2: 根据订单数量自动选择
        if (orderCount > 20) {
            // 大批量订单使用Routes API (更好的批量处理)
            return 'routes';
        } else if (orderCount <= 5) {
            // 小批量订单使用Legacy API (更稳定)
            return 'legacy';
        } else {
            // 中等批量随机选择或根据时间选择
            const hour = new Date().getHours();
            return hour % 2 === 0 ? 'routes' : 'legacy';
        }
    }

    /**
     * 使用Routes API优化
     */
    async optimizeWithRoutesApi(orders) {
        console.log('🆕 使用Routes API进行优化...');
        
        // 验证订单数据
        const validatedOrders = this.validateOrders(orders);
        if (validatedOrders.length === 0) {
            return { error: '没有有效的订单数据' };
        }

        // 使用Routes API优化算法
        const batches = await this.splitIntoBatchesRoutesApi(validatedOrders);
        const optimizedBatches = [];
        let totalDistance = 0;
        let totalDuration = 0;

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            console.log(`🔄 Routes API优化第 ${i + 1} 批次 (${batch.length} 个订单)...`);
            
            const optimizedBatch = await this.optimizeSingleBatchRoutesApi(batch, i + 1);
            optimizedBatches.push(optimizedBatch);

            totalDistance += optimizedBatch.total_distance;
            totalDuration += optimizedBatch.total_duration;
        }

        return {
            batches: optimizedBatches,
            total_distance: Math.round(totalDistance * 100) / 100,
            total_duration: Math.round(totalDuration * 10) / 10,
            statistics: this.generateStatistics(optimizedBatches, validatedOrders),
            api_usage: this.routesApiClient.getApiUsageStats(),
            api_used: 'routes_api'
        };
    }

    /**
     * 使用Legacy API优化
     */
    async optimizeWithLegacyApi(orders) {
        console.log('🏛️ 使用Distance Matrix API (Legacy)进行优化...');
        
        const result = await this.legacyOptimizer.optimizeAllRoutes(orders);
        
        // 添加API标识
        if (result && !result.error) {
            result.api_used = 'distance_matrix_legacy';
        }
        
        return result;
    }

    /**
     * Routes API批量分批逻辑
     */
    async splitIntoBatchesRoutesApi(orders) {
        console.log('📊 Routes API分批策略...');
        
        // Routes API支持更大的批量，所以可以更积极地分批
        const batches = [];
        let currentBatch = [];
        let currentCapacity = 0;

        // 按距离总部远近排序
        const ordersWithDistance = [];
        for (const order of orders) {
            const distInfo = await this.routesApiClient.getDistance(
                { lat: this.headquarters.lat, lng: this.headquarters.lng },
                { lat: order.lat, lng: order.lng }
            );
            ordersWithDistance.push({ order, distance: distInfo.distance_km });
        }
        
        ordersWithDistance.sort((a, b) => a.distance - b.distance);

        for (const item of ordersWithDistance) {
            const order = item.order;
            
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

        console.log(`📋 Routes API分成 ${batches.length} 个批次`);
        return batches;
    }

    /**
     * Routes API单批次优化
     */
    async optimizeSingleBatchRoutesApi(batch, batchNumber) {
        if (batch.length <= 1) {
            if (batch.length === 1) {
                const order = batch[0];
                const distanceInfo = await this.routesApiClient.getDistance(
                    { lat: this.headquarters.lat, lng: this.headquarters.lng },
                    { lat: order.lat, lng: order.lng }
                );
                
                return {
                    batch_number: batchNumber,
                    route: batch,
                    total_distance: distanceInfo.distance_km * 2,
                    total_duration: distanceInfo.duration_minutes * 2,
                    route_order: [order.id],
                    capacity_used: order.dus_count,
                    api_used: 'routes_api'
                };
            } else {
                return {
                    batch_number: batchNumber,
                    route: [],
                    total_distance: 0,
                    total_duration: 0,
                    route_order: [],
                    capacity_used: 0,
                    api_used: 'routes_api'
                };
            }
        }

        // 使用Routes API的批量距离计算
        console.log('📊 使用Routes API批量距离计算...');
        const distanceMatrix = await this.routesApiClient.calculateBatchDistances([
            { lat: this.headquarters.lat, lng: this.headquarters.lng },
            ...batch
        ]);

        // 使用改进的TSP算法
        const optimizedRoute = await this.routesApiTsp(batch, distanceMatrix);
        const routeDistance = this.calculateRouteDistanceFromMatrix(optimizedRoute, distanceMatrix);

        const totalCapacity = batch.reduce((sum, order) => sum + order.dus_count, 0);

        return {
            batch_number: batchNumber,
            route: optimizedRoute,
            total_distance: routeDistance.total_distance,
            total_duration: routeDistance.total_duration,
            route_order: optimizedRoute.map(order => order.id),
            capacity_used: totalCapacity,
            api_used: 'routes_api'
        };
    }

    /**
     * Routes API专用TSP算法
     */
    async routesApiTsp(orders, distanceMatrix) {
        if (orders.length === 0) return [];
        
        // 使用预计算的距离矩阵进行TSP优化
        const route = [];
        const unvisited = [...orders];
        
        // 选择距离总部最远的点作为起点
        let maxDistance = 0;
        let startOrder = unvisited[0];
        
        for (let i = 0; i < unvisited.length; i++) {
            const distance = distanceMatrix[0][i + 1].distance_km; // 0是总部，i+1是订单
            if (distance > maxDistance) {
                maxDistance = distance;
                startOrder = unvisited[i];
            }
        }
        
        route.push(startOrder);
        unvisited.splice(unvisited.indexOf(startOrder), 1);
        
        // 最近邻算法
        while (unvisited.length > 0) {
            const currentOrderIndex = orders.indexOf(route[route.length - 1]) + 1; // +1因为矩阵包含总部
            let minDistance = Infinity;
            let nearestOrder = null;
            let nearestIndex = -1;
            
            for (let i = 0; i < unvisited.length; i++) {
                const orderIndex = orders.indexOf(unvisited[i]) + 1;
                const distance = distanceMatrix[currentOrderIndex][orderIndex].distance_km;
                
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestOrder = unvisited[i];
                    nearestIndex = i;
                }
            }
            
            if (nearestOrder) {
                route.push(nearestOrder);
                unvisited.splice(nearestIndex, 1);
            }
        }
        
        return route;
    }

    /**
     * 从距离矩阵计算路线总距离
     */
    calculateRouteDistanceFromMatrix(route, distanceMatrix) {
        if (route.length === 0) {
            return { total_distance: 0, total_duration: 0 };
        }

        let totalDistance = 0;
        let totalDuration = 0;
        
        // 总部到第一个订单
        const firstOrderIndex = route.findIndex(order => order === route[0]) + 1;
        totalDistance += distanceMatrix[0][firstOrderIndex].distance_km;
        totalDuration += distanceMatrix[0][firstOrderIndex].duration_minutes;
        
        // 订单之间的距离
        for (let i = 0; i < route.length - 1; i++) {
            const fromIndex = route.findIndex(order => order === route[i]) + 1;
            const toIndex = route.findIndex(order => order === route[i + 1]) + 1;
            totalDistance += distanceMatrix[fromIndex][toIndex].distance_km;
            totalDuration += distanceMatrix[fromIndex][toIndex].duration_minutes;
        }
        
        // 最后一个订单回到总部
        const lastOrderIndex = route.findIndex(order => order === route[route.length - 1]) + 1;
        totalDistance += distanceMatrix[lastOrderIndex][0].distance_km;
        totalDuration += distanceMatrix[lastOrderIndex][0].duration_minutes;

        return {
            total_distance: Math.round(totalDistance * 100) / 100,
            total_duration: Math.round(totalDuration * 10) / 10
        };
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
        
        return {
            total_orders: totalOrders,
            processed_orders: processedOrders,
            total_batches: batches.length,
            total_capacity: totalCapacity,
            average_orders_per_batch: Math.round(processedOrders / batches.length * 10) / 10,
            optimization_efficiency: Math.round(processedOrders / totalOrders * 100) + '%'
        };
    }

    /**
     * 切换API模式
     */
    switchToRoutesApi() {
        this.useRoutesApi = true;
        console.log('🔄 已切换到Routes API模式');
    }

    switchToLegacyApi() {
        this.useRoutesApi = false;
        console.log('🔄 已切换到Legacy API模式');
    }

    /**
     * 获取当前API状态
     */
    getApiStatus() {
        return {
            current_api: this.useRoutesApi ? 'routes_api' : 'distance_matrix_legacy',
            fallback_enabled: this.fallbackToLegacy,
            routes_api_stats: this.routesApiClient.getApiUsageStats(),
            legacy_api_stats: this.legacyOptimizer.getApiUsageStats()
        };
    }
}

module.exports = HybridRouteOptimizer; 