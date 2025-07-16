/**
 * Routes API 路线可视化优化器 v2.0
 * 集成方案B枚举优化算法 + Routes API可视化
 * 
 * 方案B特性：
 * - 智能枚举分批优化
 * - 地理聚类 + 边界优化  
 * - 容量均衡 (30%-70%测试)
 * - 迭代边界调整
 * - Routes API真实路径可视化
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
        
        console.log('🗺️ Routes API可视化优化器v2.0初始化完成 (集成方案B算法)');
    }

    /**
     * 主优化算法：将所有订单分批并优化路线
     */
    async optimizeAllRoutes(orders) {
        try {
            console.log(`🚀 开始方案B Routes API路线优化...`);
            console.log(`📦 总订单数: ${orders.length}`);
            console.log(`🚛 车辆容量限制: ${this.maxCapacity}件`);

            // 验证订单数据
            const validatedOrders = this.validateOrders(orders);
            if (validatedOrders.length === 0) {
                return { error: '没有有效的订单数据' };
            }

            // 第一步：方案B枚举优化分批
            const batches = await this.splitIntoBatches(validatedOrders);
            console.log(`📋 方案B优化完成，分成 ${batches.length} 个批次`);

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
                visualization_ready: true, // 标识包含可视化数据
                algorithm: 'Method B - Enumerative Optimization + Routes API Visual'
            };

            console.log(`\n✅ 方案B Routes API路线优化完成!`);
            console.log(`📊 总距离: ${totalDistance.toFixed(1)}km`);
            console.log(`⏱️ 总时间: ${totalDuration.toFixed(1)}分钟`);
            console.log(`🗺️ 可视化数据: 已生成`);

            return result;

        } catch (error) {
            console.error('❌ 方案B Routes API优化失败:', error);
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
            
            // 调试：输出Routes API响应结构
            console.log(`🔍 Routes API响应:`, JSON.stringify(response.data, null, 2).substring(0, 500) + '...');

            if (response.data.routes && response.data.routes.length > 0) {
                const route = response.data.routes[0];
                
                // 安全提取polyline数据
                const polyline = route.polyline && route.polyline.encodedPolyline 
                    ? route.polyline.encodedPolyline 
                    : null;
                
                const result = {
                    distance_km: route.distanceMeters / 1000,
                    duration_minutes: this.parseDuration(route.duration),
                    polyline: polyline, // 安全提取可视化数据
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
     * 验证并清理订单数据
     */
    validateOrders(orders) {
        const validated = [];

        for (const order of orders) {
            try {
                // 检查必需字段 - 支持多种字段名格式
                const lat = order.lat || order.latitude;
                const lng = order.lng || order.longitude;
                const dusCount = order.dus_count || order.totalDUS;
                
                if (!lat || !lng || !dusCount) {
                    console.log(`⚠️ 跳过无效订单: 缺少必需字段 (lat=${lat}, lng=${lng}, dus=${dusCount})`);
                    continue;
                }

                // 验证坐标有效性
                const latFloat = parseFloat(lat);
                const lngFloat = parseFloat(lng);
                if (!(latFloat >= -90 && latFloat <= 90 && lngFloat >= -180 && lngFloat <= 180)) {
                    console.log(`⚠️ 跳过无效订单: 坐标超出范围 (${latFloat}, ${lngFloat})`);
                    continue;
                }

                // 验证货物数量
                const dusCountInt = parseInt(dusCount);
                if (dusCountInt <= 0) {
                    console.log(`⚠️ 跳过无效订单: 货物数量无效 (${dusCountInt})`);
                    continue;
                }

                // 标准化订单数据
                const validatedOrder = {
                    id: order.id || order.shop_code || `order_${validated.length}`,
                    name: order.name || order.outlet_name || '未知店铺',
                    address: order.address || order.outlet_name || '未知地址',
                    lat: latFloat,
                    lng: lngFloat,
                    dus_count: dusCountInt,
                    phone: order.phone || order.phoneNumber || '',
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
     * 方案B：枚举优化分批算法 - 找到总距离最短的订单分配
     */
    async splitIntoBatches(orders) {
        console.log('🔍 使用方案B枚举优化算法...');
        
        const totalDUS = orders.reduce((sum, order) => sum + order.dus_count, 0);
        
        // 如果订单较少（≤15个），使用完全枚举优化
        if (orders.length <= 15) {
            console.log('📊 订单数较少，使用完全枚举优化');
            return await this.enumerativeOptimization(orders);
        }
        
        // 订单较多时，使用智能枚举（测试多种分割策略）
        console.log('📊 订单数较多，使用智能枚举优化');
        return await this.smartEnumerativeOptimization(orders);
    }

    /**
     * 完全枚举优化：适用于订单数较少的情况
     */
    async enumerativeOptimization(orders) {
        let bestSolution = null;
        let minTotalDistance = Infinity;
        
        const totalDUS = orders.reduce((sum, order) => sum + order.dus_count, 0);
        console.log(`📊 总货物量: ${totalDUS}件, 车辆容量: ${this.maxCapacity}件`);
        
        // 🔍 智能判断：如果总货物量 ≤ 车辆容量，优先考虑一趟完成
        if (totalDUS <= this.maxCapacity) {
            console.log('🚛 货物可以一趟完成，测试一趟 vs 分两趟方案...');
            
            // 测试一趟完成方案
            const singleTripDistance = await this.testSingleTrip(orders);
            console.log(`📏 一趟完成距离: ${singleTripDistance.toFixed(2)}km`);
            
            bestSolution = [orders];
            minTotalDistance = singleTripDistance;
        }
        
        // 定义不同的排序和分割策略
        const strategies = [
            { 
                name: '按纬度排序', 
                sort: (a, b) => a.lat - b.lat 
            },
            { 
                name: '按经度排序', 
                sort: (a, b) => a.lng - b.lng 
            },
            { 
                name: '按件数降序', 
                sort: (a, b) => b.dus_count - a.dus_count 
            },
            { 
                name: '按件数升序', 
                sort: (a, b) => a.dus_count - b.dus_count 
            }
        ];

        // 测试分两趟的方案
        const minFirstCapacity = Math.max(20, Math.floor(totalDUS * 0.3)); // 至少30%或20件
        let maxFirstCapacity;
        
        if (totalDUS <= this.maxCapacity) {
            // 如果可以一趟完成，测试更广范围的分割（包含接近100%）
            maxFirstCapacity = Math.min(this.maxCapacity, totalDUS - 10); // 确保第二趟至少10件
            console.log(`🔄 测试分两趟范围: ${minFirstCapacity}-${maxFirstCapacity}件 (对比一趟完成)`);
        } else {
            // 如果必须分两趟，使用原有逻辑
            maxFirstCapacity = Math.min(this.maxCapacity, Math.floor(totalDUS * 0.7));
            console.log(`🔄 测试分两趟范围: ${minFirstCapacity}-${maxFirstCapacity}件`);
        }

        for (const strategy of strategies) {
            console.log(`📊 测试策略: ${strategy.name}`);
            const sortedOrders = [...orders].sort(strategy.sort);
            
            // 测试不同的容量分配
            for (let firstCapacity = minFirstCapacity; firstCapacity <= maxFirstCapacity; firstCapacity += 5) {
                const solution = await this.testBatchSplit(sortedOrders, firstCapacity);
                
                if (solution && solution.totalDistance < minTotalDistance) {
                    minTotalDistance = solution.totalDistance;
                    bestSolution = solution.batches;
                    console.log(`🎯 找到更优解: ${strategy.name}, 容量=${firstCapacity}, 距离=${solution.totalDistance.toFixed(2)}km`);
                }
            }
        }

        if (bestSolution) {
            if (bestSolution.length === 1) {
                console.log(`✅ 最优方案: 一趟完成`);
                console.log(`📊 总距离: ${minTotalDistance.toFixed(2)}km`);
                console.log(`📦 一趟完成: ${bestSolution[0].length} 个订单, ${totalDUS} 件货物`);
            } else {
                console.log(`✅ 最优方案: 分两趟`);
                console.log(`📊 总距离: ${minTotalDistance.toFixed(2)}km`);
                
                // 输出批次信息
                bestSolution.forEach((batch, index) => {
                    const capacity = batch.reduce((sum, order) => sum + order.dus_count, 0);
                    console.log(`📦 批次 ${index + 1}: ${batch.length} 个订单, ${capacity} 件货物`);
                });
            }
        }

        return bestSolution || this.defaultSplit(orders);
    }

    /**
     * 智能枚举优化：适用于订单数较多的情况
     */
    async smartEnumerativeOptimization(orders) {
        console.log('🧠 使用智能枚举策略...');
        
        const totalDUS = orders.reduce((sum, order) => sum + order.dus_count, 0);
        console.log(`📊 总货物量: ${totalDUS}件, 车辆容量: ${this.maxCapacity}件`);
        
        // 🔍 智能判断：如果总货物量 ≤ 车辆容量，优先考虑一趟完成
        if (totalDUS <= this.maxCapacity) {
            console.log('🚛 货物可以一趟完成，测试一趟 vs 分两趟方案...');
            
            // 测试一趟完成方案
            const singleTripDistance = await this.testSingleTrip(orders);
            console.log(`📏 一趟完成距离: ${singleTripDistance.toFixed(2)}km`);
            
            // 测试分两趟的最优方案
            console.log('📏 测试分两趟的最优方案...');
            const clusters = await this.geographicClustering(orders);
            const optimizedClusters = await this.optimizeClusterBoundaries(clusters);
            const twoTripDistance = await this.calculateClustersDistance(optimizedClusters);
            console.log(`📏 分两趟距离: ${twoTripDistance.toFixed(2)}km`);
            
            // 比较并选择更短的方案
            if (singleTripDistance <= twoTripDistance) {
                console.log(`✅ 选择一趟完成方案，节省距离: ${(twoTripDistance - singleTripDistance).toFixed(2)}km`);
                return [orders];
            } else {
                console.log(`✅ 选择分两趟方案，节省距离: ${(singleTripDistance - twoTripDistance).toFixed(2)}km`);
                return optimizedClusters;
            }
        } else {
            console.log('📦 货物量超过车辆容量，必须分两趟');
            // 先用地理聚类粗分，再枚举优化边界
            const clusters = await this.geographicClustering(orders);
            
            // 枚举优化：调整边界订单
            const optimizedClusters = await this.optimizeClusterBoundaries(clusters);
            
            return optimizedClusters;
        }
    }

    /**
     * 地理聚类：按南北或东西方向分割
     */
    async geographicClustering(orders) {
        const avgLat = orders.reduce((sum, order) => sum + order.lat, 0) / orders.length;
        const avgLng = orders.reduce((sum, order) => sum + order.lng, 0) / orders.length;
        
        // 测试南北分割和东西分割，选择更均衡的
        const northSouth = {
            cluster1: orders.filter(order => order.lat > avgLat),
            cluster2: orders.filter(order => order.lat <= avgLat)
        };
        
        const eastWest = {
            cluster1: orders.filter(order => order.lng > avgLng),
            cluster2: orders.filter(order => order.lng <= avgLng)
        };
        
        // 计算容量分布的均衡性
        const nsBalance = this.calculateBalance(northSouth);
        const ewBalance = this.calculateBalance(eastWest);
        
        console.log(`📊 南北分割均衡度: ${nsBalance.toFixed(2)}`);
        console.log(`📊 东西分割均衡度: ${ewBalance.toFixed(2)}`);
        
        const chosenClusters = nsBalance > ewBalance ? northSouth : eastWest;
        console.log(`📍 选择${nsBalance > ewBalance ? '南北' : '东西'}分割策略`);
        
        return [chosenClusters.cluster1, chosenClusters.cluster2].filter(cluster => cluster.length > 0);
    }

    /**
     * 计算聚类均衡性（容量分布）
     */
    calculateBalance(clusters) {
        const cap1 = clusters.cluster1.reduce((sum, order) => sum + order.dus_count, 0);
        const cap2 = clusters.cluster2.reduce((sum, order) => sum + order.dus_count, 0);
        const total = cap1 + cap2;
        
        if (total === 0) return 0;
        
        // 均衡度 = 1 - |容量差异| / 总容量
        const imbalance = Math.abs(cap1 - cap2) / total;
        return 1 - imbalance;
    }

    /**
     * 优化聚类边界：调整边界订单以减少总距离
     */
    async optimizeClusterBoundaries(clusters) {
        console.log('🔧 优化聚类边界...');
        
        if (clusters.length !== 2) return clusters;
        
        let [cluster1, cluster2] = clusters;
        let improved = true;
        let iterations = 0;
        const maxIterations = 20;
        
        while (improved && iterations < maxIterations) {
            improved = false;
            iterations++;
            
            // 计算当前总距离
            const currentDistance = await this.calculateClustersDistance([cluster1, cluster2]);
            
            // 尝试移动边界订单
            for (let i = 0; i < cluster1.length; i++) {
                const order = cluster1[i];
                
                // 检查容量约束
                const cluster1Capacity = cluster1.reduce((s, o) => s + o.dus_count, 0);
                const cluster2Capacity = cluster2.reduce((s, o) => s + o.dus_count, 0);
                
                if (cluster1Capacity - order.dus_count >= 20 && 
                    cluster2Capacity + order.dus_count <= this.maxCapacity) {
                    
                    // 尝试移动订单
                    const newCluster1 = cluster1.filter((_, idx) => idx !== i);
                    const newCluster2 = [...cluster2, order];
                    
                    const newDistance = await this.calculateClustersDistance([newCluster1, newCluster2]);
                    
                    if (newDistance < currentDistance) {
                        cluster1 = newCluster1;
                        cluster2 = newCluster2;
                        improved = true;
                        console.log(`🔄 第${iterations}次优化: 移动订单${order.id}, 距离改善${(currentDistance - newDistance).toFixed(2)}km`);
                        break;
                    }
                }
            }
            
            // 反向尝试：从cluster2移动到cluster1
            if (!improved) {
                for (let i = 0; i < cluster2.length; i++) {
                    const order = cluster2[i];
                    
                    const cluster1Capacity = cluster1.reduce((s, o) => s + o.dus_count, 0);
                    const cluster2Capacity = cluster2.reduce((s, o) => s + o.dus_count, 0);
                    
                    if (cluster2Capacity - order.dus_count >= 20 && 
                        cluster1Capacity + order.dus_count <= this.maxCapacity) {
                        
                        const newCluster1 = [...cluster1, order];
                        const newCluster2 = cluster2.filter((_, idx) => idx !== i);
                        
                        const newDistance = await this.calculateClustersDistance([newCluster1, newCluster2]);
                        
                        if (newDistance < currentDistance) {
                            cluster1 = newCluster1;
                            cluster2 = newCluster2;
                            improved = true;
                            console.log(`🔄 第${iterations}次优化: 移动订单${order.id}, 距离改善${(currentDistance - newDistance).toFixed(2)}km`);
                            break;
                        }
                    }
                }
            }
        }
        
        const finalClusters = [cluster1, cluster2].filter(cluster => cluster.length > 0);
        
        // 输出最终结果
        finalClusters.forEach((cluster, index) => {
            const capacity = cluster.reduce((sum, order) => sum + order.dus_count, 0);
            console.log(`📦 批次 ${index + 1}: ${cluster.length} 个订单, ${capacity} 件货物`);
        });
        
        return finalClusters;
    }

    /**
     * 计算多个聚类的总距离
     */
    async calculateClustersDistance(clusters) {
        let totalDistance = 0;
        
        for (const cluster of clusters) {
            if (cluster.length === 0) continue;
            
            // 使用最近邻TSP估算
            const tsp = await this.nearestNeighborTsp(cluster);
            const distance = await this.calculateRouteDistance(tsp);
            totalDistance += distance.total_distance;
        }
        
        return totalDistance;
    }

    /**
     * 计算路线总距离（基于直线距离估算，适用于分批优化）
     */
    async calculateRouteDistance(route) {
        if (route.length === 0) {
            return { total_distance: 0, total_duration: 0 };
        }

        let totalDistance = 0;
        let totalDuration = 0;

        // 从总部到第一个点
        const toFirstDistance = this.calculateStraightLineDistance(
            this.headquarters.lat, this.headquarters.lng,
            route[0].lat, route[0].lng
        );
        totalDistance += toFirstDistance;
        totalDuration += toFirstDistance * 2.5; // 估算时间

        // 遍历路线中的每个点
        for (let i = 0; i < route.length - 1; i++) {
            const distance = this.calculateStraightLineDistance(
                route[i].lat, route[i].lng,
                route[i + 1].lat, route[i + 1].lng
            );
            totalDistance += distance;
            totalDuration += distance * 2.5;
        }

        // 从最后一个点回到总部
        const fromLastDistance = this.calculateStraightLineDistance(
            route[route.length - 1].lat, route[route.length - 1].lng,
            this.headquarters.lat, this.headquarters.lng
        );
        totalDistance += fromLastDistance;
        totalDuration += fromLastDistance * 2.5;

        return {
            total_distance: totalDistance,
            total_duration: totalDuration
        };
    }

    /**
     * 测试一趟完成的方案
     */
    async testSingleTrip(orders) {
        console.log('🔍 计算一趟完成的总距离...');
        
        // 使用最近邻算法优化路线顺序
        const optimizedRoute = await this.nearestNeighborTsp(orders);
        
        // 计算总距离（包含从总部出发和返回总部）
        const routeDistance = this.calculateRouteDistanceFromStraightLine(optimizedRoute);
        
        return routeDistance.total_distance;
    }

    /**
     * 测试特定的批次分割
     */
    async testBatchSplit(sortedOrders, firstCapacity) {
        let firstBatch = [];
        let secondBatch = [];
        let currentCapacity = 0;

        // 贪心选择第一批次
        for (const order of sortedOrders) {
            if (currentCapacity + order.dus_count <= firstCapacity) {
                firstBatch.push(order);
                currentCapacity += order.dus_count;
            } else {
                secondBatch.push(order);
            }
        }

        // 检查第二批次是否超载
        const secondCapacity = secondBatch.reduce((sum, order) => sum + order.dus_count, 0);
        if (secondCapacity > this.maxCapacity) {
            return null; // 不可行的分割
        }

        if (firstBatch.length === 0 || secondBatch.length === 0) {
            return null; // 无效分割
        }

        // 计算总距离
        const totalDistance = await this.calculateClustersDistance([firstBatch, secondBatch]);
        
        return {
            batches: [firstBatch, secondBatch],
            totalDistance: totalDistance
        };
    }

    /**
     * 默认分割策略（备用）
     */
    defaultSplit(orders) {
        console.log('📋 使用默认分割策略');
        
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