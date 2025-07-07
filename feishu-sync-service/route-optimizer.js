/**
 * 路线优化模块 - Node.js版本
 * 移植自Python TSP算法
 */

const { Client } = require('@googlemaps/google-maps-services-js');
const NodeCache = require('node-cache');

class RouteOptimizer {
    constructor(googleMapsApiKey) {
        this.googleMapsClient = new Client({});
        this.apiKey = googleMapsApiKey;
        this.maxCapacity = 80; // 车辆容量限制
        this.headquarters = {
            lat: -6.11258762834466,
            lng: 106.91732818555802,
            name: '雅加达总部'
        };
        
        // 缓存配置：缓存1天
        this.distanceCache = new NodeCache({ stdTTL: 86400 });
        this.apiCallsToday = 0;
        this.lastResetDate = new Date().toDateString();
    }

    /**
     * 主优化算法：将所有订单分批并优化路线
     */
    async optimizeAllRoutes(orders) {
        try {
            console.log(`🚀 开始路线优化...`);
            console.log(`📦 总订单数: ${orders.length}`);
            console.log(`🚛 车辆容量限制: ${this.maxCapacity}件`);

            // 验证订单数据
            const validatedOrders = this.validateOrders(orders);
            if (validatedOrders.length === 0) {
                return { error: '没有有效的订单数据' };
            }

            // 第一步：按容量分批
            const batches = this.splitIntoBatches(validatedOrders);
            console.log(`📋 分成 ${batches.length} 个批次`);

            // 第二步：每批优化路线
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
                api_usage: this.getApiUsageStats()
            };

            console.log(`\n✅ 路线优化完成!`);
            console.log(`📊 总距离: ${totalDistance.toFixed(1)}km`);
            console.log(`⏱️ 总时间: ${totalDuration.toFixed(1)}分钟`);

            return result;

        } catch (error) {
            console.error('❌ 路线优化失败:', error);
            return { error: error.message };
        }
    }

    /**
     * 验证并清理订单数据
     */
    validateOrders(orders) {
        const validated = [];

        for (const order of orders) {
            try {
                // 检查必需字段
                if (!order.latitude || !order.longitude || !order.totalDUS) {
                    console.log(`⚠️ 跳过无效订单: 缺少必需字段`);
                    continue;
                }

                // 验证坐标有效性
                const lat = parseFloat(order.latitude);
                const lng = parseFloat(order.longitude);
                if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) {
                    console.log(`⚠️ 跳过无效订单: 坐标超出范围 (${lat}, ${lng})`);
                    continue;
                }

                // 验证货物数量
                const dusCount = parseInt(order.totalDUS);
                if (dusCount <= 0) {
                    console.log(`⚠️ 跳过无效订单: 货物数量无效 (${dusCount})`);
                    continue;
                }

                // 标准化订单数据
                const validatedOrder = {
                    id: order.shop_code || `order_${validated.length}`,
                    name: order.outlet_name || '未知店铺',
                    address: '未知地址',
                    lat: lat,
                    lng: lng,
                    dus_count: dusCount,
                    phone: order.phoneNumber || '',
                    kantong: order.kantong || '',
                    orderType: order.orderType || '',
                    finalPrice: order.finalPrice || '',
                    original_data: order
                };

                validated.push(validatedOrder);

            } catch (error) {
                console.log(`⚠️ 跳过无效订单: ${error.message}`);
                continue;
            }
        }

        console.log(`✅ 验证完成: ${validated.length}/${orders.length} 个有效订单`);
        return validated;
    }

    /**
     * 按容量约束分批算法
     */
    splitIntoBatches(orders) {
        // 按距离总部远近排序（让同一批次的地点相对集中）
        const ordersWithDistance = orders.map(order => ({
            order,
            distance: this.calculateStraightLineDistance(
                this.headquarters.lat, this.headquarters.lng,
                order.lat, order.lng
            )
        }));

        const ordersSorted = ordersWithDistance
            .sort((a, b) => a.distance - b.distance)
            .map(item => item.order);

        const batches = [];
        let currentBatch = [];
        let currentWeight = 0;

        for (const order of ordersSorted) {
            const orderWeight = order.dus_count;

            // 检查是否可以加入当前批次
            if (currentWeight + orderWeight <= this.maxCapacity) {
                currentBatch.push(order);
                currentWeight += orderWeight;
            } else {
                // 当前批次满了，开始新批次
                if (currentBatch.length > 0) {
                    batches.push(currentBatch);
                    console.log(`📦 批次 ${batches.length}: ${currentBatch.length} 个订单, ${currentWeight} 件货物`);
                }

                // 检查单个订单是否超过容量限制
                if (orderWeight > this.maxCapacity) {
                    console.log(`⚠️ 订单 ${order.name} 超过容量限制 (${orderWeight} > ${this.maxCapacity})`);
                    continue;
                }

                currentBatch = [order];
                currentWeight = orderWeight;
            }
        }

        // 添加最后一个批次
        if (currentBatch.length > 0) {
            batches.push(currentBatch);
            console.log(`📦 批次 ${batches.length}: ${currentBatch.length} 个订单, ${currentWeight} 件货物`);
        }

        return batches;
    }

    /**
     * 单批次路线优化：最近邻 + 2-opt
     */
    async optimizeSingleBatch(batch, batchNumber) {
        if (batch.length <= 1) {
            // 单个订单的情况
            if (batch.length === 1) {
                const order = batch[0];
                const distanceInfo = await this.getDistance(
                    { lat: this.headquarters.lat, lng: this.headquarters.lng },
                    { lat: order.lat, lng: order.lng }
                );
                
                return {
                    batch_number: batchNumber,
                    route: batch,
                    total_distance: distanceInfo.distance_km * 2, // 往返
                    total_duration: distanceInfo.duration_minutes * 2,
                    route_order: [order.id],
                    capacity_used: order.dus_count
                };
            } else {
                return {
                    batch_number: batchNumber,
                    route: [],
                    total_distance: 0,
                    total_duration: 0,
                    route_order: [],
                    capacity_used: 0
                };
            }
        }

        console.log(`  🔍 第一步: 最近邻算法...`);
        // 第一步：最近邻算法
        const nearestRoute = await this.nearestNeighborTsp(batch);
        const nearestDistance = await this.calculateRouteDistance(nearestRoute);

        console.log(`  🔧 第二步: 2-opt优化...`);
        // 第二步：2-opt优化
        const improvedRoute = await this.twoOptImprove(nearestRoute);
        const improvedDistance = await this.calculateRouteDistance(improvedRoute);

        const improvement = nearestDistance.total_distance - improvedDistance.total_distance;
        if (improvement > 0) {
            console.log(`  ✅ 2-opt优化节省: ${improvement.toFixed(1)}km`);
        }

        // 计算总容量
        const totalCapacity = batch.reduce((sum, order) => sum + order.dus_count, 0);

        return {
            batch_number: batchNumber,
            route: improvedRoute,
            total_distance: improvedDistance.total_distance,
            total_duration: improvedDistance.total_duration,
            route_order: improvedRoute.map(order => order.id),
            capacity_used: totalCapacity,
            optimization_improvement: Math.round(improvement * 100) / 100
        };
    }

    /**
     * 改进的路线规划：先远后近策略，避免来回跑路
     */
    async nearestNeighborTsp(orders) {
        if (orders.length === 0) {
            return [];
        }

        // 计算每个订单距离总部的距离
        const ordersWithDistance = [];
        for (const order of orders) {
            const distInfo = await this.getDistance(
                { lat: this.headquarters.lat, lng: this.headquarters.lng },
                { lat: order.lat, lng: order.lng }
            );
            ordersWithDistance.push([order, distInfo.distance_km]);
        }

        // 按距离总部的远近排序，最远的在前
        const ordersSorted = ordersWithDistance.sort((a, b) => b[1] - a[1]);

        // 使用修改过的最近邻算法
        const route = [];
        const unvisited = ordersSorted.map(item => item[0]);
        let currentPos = { lat: this.headquarters.lat, lng: this.headquarters.lng };

        // 第一步：先去最远的点
        if (unvisited.length > 0) {
            const farthestOrder = unvisited[0]; // 已经按距离排序，第一个是最远的
            route.push(farthestOrder);
            currentPos = { lat: farthestOrder.lat, lng: farthestOrder.lng };
            unvisited.splice(0, 1);
        }

        // 第二步：从最远点开始，依次选择最近的未访问点
        while (unvisited.length > 0) {
            const distances = [];
            for (const order of unvisited) {
                const distInfo = await this.getDistance(
                    currentPos,
                    { lat: order.lat, lng: order.lng }
                );
                distances.push([order, distInfo.distance_km]);
            }

            // 选择最近的订单
            const nearestItem = distances.reduce((min, current) => 
                current[1] < min[1] ? current : min
            );
            const nearestOrder = nearestItem[0];
            
            route.push(nearestOrder);
            currentPos = { lat: nearestOrder.lat, lng: nearestOrder.lng };
            const index = unvisited.indexOf(nearestOrder);
            unvisited.splice(index, 1);
        }

        return route;
    }

    /**
     * 2-opt算法优化路线
     */
    async twoOptImprove(route) {
        if (route.length <= 2) {
            return route;
        }

        let improved = true;
        let bestRoute = [...route];
        let iteration = 0;
        const maxIterations = 100; // 防止无限循环

        while (improved && iteration < maxIterations) {
            improved = false;
            const bestDistance = (await this.calculateRouteDistance(bestRoute)).total_distance;

            // 尝试所有可能的2-opt交换
            for (let i = 0; i < route.length - 1; i++) {
                for (let j = i + 2; j < route.length; j++) {
                    // 创建新路线：反转i到j之间的部分
                    const newRoute = [...route];
                    const reversedSection = newRoute.slice(i, j + 1).reverse();
                    newRoute.splice(i, j - i + 1, ...reversedSection);

                    const newDistance = (await this.calculateRouteDistance(newRoute)).total_distance;

                    if (newDistance < bestDistance) {
                        bestRoute = newRoute;
                        improved = true;
                    }
                }
            }

            route = bestRoute;
            iteration++;
        }

        return bestRoute;
    }

    /**
     * 计算路线总距离和时间
     */
    async calculateRouteDistance(route) {
        if (route.length === 0) {
            return { total_distance: 0, total_duration: 0 };
        }

        let totalDistance = 0;
        let totalDuration = 0;
        let currentPos = { lat: this.headquarters.lat, lng: this.headquarters.lng };

        // 计算总部到各个订单点的距离
        for (const order of route) {
            const distInfo = await this.getDistance(
                currentPos,
                { lat: order.lat, lng: order.lng }
            );
            totalDistance += distInfo.distance_km;
            totalDuration += distInfo.duration_minutes;
            currentPos = { lat: order.lat, lng: order.lng };
        }

        // 计算最后一个点回到总部的距离
        if (route.length > 0) {
            const finalDistInfo = await this.getDistance(
                currentPos,
                { lat: this.headquarters.lat, lng: this.headquarters.lng }
            );
            totalDistance += finalDistInfo.distance_km;
            totalDuration += finalDistInfo.duration_minutes;
        }

        return {
            total_distance: Math.round(totalDistance * 100) / 100,
            total_duration: Math.round(totalDuration * 10) / 10
        };
    }

    /**
     * 获取两点间距离（使用Google Maps API，带缓存）
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

            const response = await this.googleMapsClient.distancematrix({
                params: {
                    origins: [`${from.lat},${from.lng}`],
                    destinations: [`${to.lat},${to.lng}`],
                    mode: 'driving',
                    language: 'zh-CN',
                    avoid: ['tolls'],
                    key: this.apiKey
                }
            });

            this.apiCallsToday++;

            if (response.data.status === 'OK' && 
                response.data.rows[0]?.elements[0]?.status === 'OK') {
                
                const element = response.data.rows[0].elements[0];
                const result = {
                    distance_km: element.distance.value / 1000,
                    duration_minutes: element.duration.value / 60,
                    distance_text: element.distance.text,
                    duration_text: element.duration.text
                };

                // 缓存结果
                this.distanceCache.set(cacheKey, result);
                return result;
            } else {
                throw new Error('Google Maps API返回错误');
            }

        } catch (error) {
            console.log(`⚠️ API调用失败，使用直线距离: ${error.message}`);
            
            // 降级：使用直线距离
            const distance = this.calculateStraightLineDistance(from.lat, from.lng, to.lat, to.lng);
            const result = {
                distance_km: distance,
                duration_minutes: distance * 2, // 估算：1km约2分钟
                distance_text: `${distance.toFixed(1)} km (估算)`,
                duration_text: `${(distance * 2).toFixed(0)} 分钟 (估算)`
            };

            return result;
        }
    }

    /**
     * 计算直线距离（Haversine公式）
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
     * 生成优化统计信息
     */
    generateStatistics(batches, originalOrders) {
        const totalOrders = originalOrders.length;
        const totalDus = originalOrders.reduce((sum, order) => sum + order.dus_count, 0);
        
        const avgDistancePerBatch = batches.length > 0 ? 
            batches.reduce((sum, batch) => sum + batch.total_distance, 0) / batches.length : 0;
        const avgOrdersPerBatch = batches.length > 0 ? totalOrders / batches.length : 0;

        return {
            total_orders: totalOrders,
            total_dus: totalDus,
            total_batches: batches.length,
            avg_distance_per_batch: Math.round(avgDistancePerBatch * 100) / 100,
            avg_orders_per_batch: Math.round(avgOrdersPerBatch * 10) / 10,
            capacity_utilization: batches.length > 0 ? 
                Math.round((totalDus / (batches.length * this.maxCapacity)) * 1000) / 10 : 0
        };
    }

    /**
     * 获取API使用统计
     */
    getApiUsageStats() {
        return {
            api_calls_today: this.apiCallsToday,
            remaining_calls: Math.max(0, 2500 - this.apiCallsToday),
            cache_size: this.distanceCache.keys().length,
            last_reset: this.lastResetDate
        };
    }

    /**
     * 重置API调用计数器（每日）
     */
    resetApiCountIfNewDay() {
        const today = new Date().toDateString();
        if (today !== this.lastResetDate) {
            this.apiCallsToday = 0;
            this.lastResetDate = today;
            console.log('🔄 API调用计数器已重置');
        }
    }
}

module.exports = RouteOptimizer; 