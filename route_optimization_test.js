const fs = require('fs');

// 读取订单数据
function loadOrders() {
    const csvContent = fs.readFileSync('./public/markers.csv', 'utf8');
    const lines = csvContent.trim().split('\n');
    
    return lines.slice(1).map(line => {
        // 更精确的CSV解析，处理引号内的逗号
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current); // 添加最后一个值
        
        return {
            shop_code: values[0],
            latitude: parseFloat(values[1]),
            longitude: parseFloat(values[2]),
            outlet_name: values[3].replace(/"/g, ''),
            phoneNumber: values[4].replace(/"/g, ''),
            kantong: values[5].replace(/"/g, ''),
            orderType: values[6].replace(/"/g, ''),
            totalDUS: parseInt(values[7].replace(/"/g, '')),
            finalPrice: values[8].replace(/"/g, ''),
            gudangOut: values[9].replace(/"/g, '')
        };
    });
}

// 计算两点间距离（简化版，使用欧几里得距离）
function calculateDistance(point1, point2) {
    const dx = point1.longitude - point2.longitude;
    const dy = point1.latitude - point2.latitude;
    return Math.sqrt(dx * dx + dy * dy) * 111; // 转换为大概的公里数
}

// TSP求解（贪心近似）
function solveTSP(orders, depot = { latitude: -6.11, longitude: 106.92 }) {
    if (orders.length === 0) return { path: [], distance: 0 };
    
    let unvisited = [...orders];
    let current = depot;
    let path = [];
    let totalDistance = 0;
    
    while (unvisited.length > 0) {
        let nearest = unvisited[0];
        let nearestIndex = 0;
        let minDistance = calculateDistance(current, nearest);
        
        for (let i = 1; i < unvisited.length; i++) {
            const distance = calculateDistance(current, unvisited[i]);
            if (distance < minDistance) {
                minDistance = distance;
                nearest = unvisited[i];
                nearestIndex = i;
            }
        }
        
        path.push(nearest);
        totalDistance += minDistance;
        current = nearest;
        unvisited.splice(nearestIndex, 1);
    }
    
    // 返回仓库
    totalDistance += calculateDistance(current, depot);
    
    return { path, distance: totalDistance };
}

// 方案A: 地理聚类 + 容量调整
function methodA_GeographicClustering(orders, maxCapacity = 80) {
    console.log('\n=== 方案A: 地理聚类 + 容量调整 ===');
    
    // 简单的南北分割
    const avgLat = orders.reduce((sum, order) => sum + order.latitude, 0) / orders.length;
    
    let northOrders = orders.filter(order => order.latitude > avgLat);
    let southOrders = orders.filter(order => order.latitude <= avgLat);
    
    console.log(`初始分割: 北部${northOrders.length}个订单, 南部${southOrders.length}个订单`);
    
    // 计算容量
    const northCapacity = northOrders.reduce((sum, order) => sum + order.totalDUS, 0);
    const southCapacity = southOrders.reduce((sum, order) => sum + order.totalDUS, 0);
    
    console.log(`容量分布: 北部${northCapacity}件, 南部${southCapacity}件`);
    
    // 容量调整：如果某一边超过80件，转移订单到另一边
    if (northCapacity > maxCapacity) {
        // 将北部最南边的订单转移到南部
        northOrders.sort((a, b) => a.latitude - b.latitude);
        while (northOrders.length > 0 && 
               northOrders.reduce((sum, order) => sum + order.totalDUS, 0) > maxCapacity) {
            const transferred = northOrders.shift();
            southOrders.push(transferred);
            console.log(`转移订单 ${transferred.shop_code} 从北部到南部`);
        }
    } else if (southCapacity > maxCapacity) {
        // 将南部最北边的订单转移到北部
        southOrders.sort((a, b) => b.latitude - a.latitude);
        while (southOrders.length > 0 && 
               southOrders.reduce((sum, order) => sum + order.totalDUS, 0) > maxCapacity) {
            const transferred = southOrders.shift();
            northOrders.push(transferred);
            console.log(`转移订单 ${transferred.shop_code} 从南部到北部`);
        }
    }
    
    const routes = [northOrders, southOrders].filter(route => route.length > 0);
    
    // 计算每条路线的TSP
    const results = routes.map((route, index) => {
        const tsp = solveTSP(route);
        const capacity = route.reduce((sum, order) => sum + order.totalDUS, 0);
        return {
            route: index + 1,
            orders: route.length,
            capacity: capacity,
            distance: tsp.distance
        };
    });
    
    const totalDistance = results.reduce((sum, result) => sum + result.distance, 0);
    
    console.log('结果:');
    results.forEach(result => {
        console.log(`  第${result.route}趟: ${result.orders}个订单, ${result.capacity}件, ${result.distance.toFixed(2)}km`);
    });
    console.log(`总距离: ${totalDistance.toFixed(2)}km`);
    
    return { method: 'A', routes, results, totalDistance };
}

// 方案B: 枚举优化（简化版，只考虑前几种组合）
function methodB_EnumerativeOptimization(orders, maxCapacity = 80) {
    console.log('\n=== 方案B: 枚举优化 ===');
    
    let bestSolution = null;
    let minDistance = Infinity;
    
    // 为了演示，我们只尝试几种不同的分割方式
    const splitMethods = [
        () => orders.slice().sort((a, b) => a.latitude - b.latitude), // 按纬度排序
        () => orders.slice().sort((a, b) => a.longitude - b.longitude), // 按经度排序
        () => orders.slice().sort((a, b) => b.totalDUS - a.totalDUS), // 按件数降序
        () => orders.slice().sort((a, b) => a.totalDUS - b.totalDUS)   // 按件数升序
    ];
    
    splitMethods.forEach((sortMethod, methodIndex) => {
        const sortedOrders = sortMethod();
        
        // 尝试不同的第一趟容量
        for (let firstTripCapacity = 50; firstTripCapacity <= maxCapacity; firstTripCapacity += 10) {
            let firstTrip = [];
            let currentCapacity = 0;
            let secondTrip = [...sortedOrders];
            
            // 贪心选择第一趟订单
            for (let i = 0; i < sortedOrders.length && currentCapacity < firstTripCapacity; i++) {
                if (currentCapacity + sortedOrders[i].totalDUS <= firstTripCapacity) {
                    firstTrip.push(sortedOrders[i]);
                    currentCapacity += sortedOrders[i].totalDUS;
                    secondTrip.splice(secondTrip.indexOf(sortedOrders[i]), 1);
                }
            }
            
            if (firstTrip.length === 0) continue;
            
            // 计算总距离
            const trip1TSP = solveTSP(firstTrip);
            const trip2TSP = solveTSP(secondTrip);
            const totalDistance = trip1TSP.distance + trip2TSP.distance;
            
            if (totalDistance < minDistance) {
                minDistance = totalDistance;
                bestSolution = {
                    method: methodIndex,
                    firstTripCapacity,
                    trip1: { orders: firstTrip, ...trip1TSP },
                    trip2: { orders: secondTrip, ...trip2TSP },
                    totalDistance
                };
            }
        }
    });
    
    if (bestSolution) {
        console.log(`最优解: 方法${bestSolution.method}, 第一趟容量${bestSolution.firstTripCapacity}`);
        console.log(`第1趟: ${bestSolution.trip1.orders.length}个订单, ${bestSolution.trip1.orders.reduce((s,o) => s + o.totalDUS, 0)}件, ${bestSolution.trip1.distance.toFixed(2)}km`);
        console.log(`第2趟: ${bestSolution.trip2.orders.length}个订单, ${bestSolution.trip2.orders.reduce((s,o) => s + o.totalDUS, 0)}件, ${bestSolution.trip2.distance.toFixed(2)}km`);
        console.log(`总距离: ${bestSolution.totalDistance.toFixed(2)}km`);
    } else {
        console.log('未找到可行解');
        bestSolution = { totalDistance: Infinity };
    }
    
    return bestSolution;
}

// 方案C: 启发式算法
function methodC_HeuristicOptimization(orders, maxCapacity = 80) {
    console.log('\n=== 方案C: 启发式算法 ===');
    
    // 初始解：贪心分配
    let firstTrip = [];
    let secondTrip = [];
    let currentCapacity = 0;
    
    const shuffledOrders = orders.slice().sort(() => Math.random() - 0.5);
    
    shuffledOrders.forEach(order => {
        if (currentCapacity + order.totalDUS <= maxCapacity) {
            firstTrip.push(order);
            currentCapacity += order.totalDUS;
        } else {
            secondTrip.push(order);
        }
    });
    
    let bestSolution = {
        trip1: firstTrip,
        trip2: secondTrip,
        distance: solveTSP(firstTrip).distance + solveTSP(secondTrip).distance
    };
    
    console.log(`初始解距离: ${bestSolution.distance.toFixed(2)}km`);
    
    // 迭代改进
    for (let iteration = 0; iteration < 100; iteration++) {
        // 随机选择一个订单进行交换
        const trip1Capacity = bestSolution.trip1.reduce((s, o) => s + o.totalDUS, 0);
        const trip2Capacity = bestSolution.trip2.reduce((s, o) => s + o.totalDUS, 0);
        
        let improved = false;
        
        // 尝试从trip1移动到trip2
        if (bestSolution.trip1.length > 1) {
            const randomIndex = Math.floor(Math.random() * bestSolution.trip1.length);
            const orderToMove = bestSolution.trip1[randomIndex];
            
            if (trip2Capacity + orderToMove.totalDUS <= maxCapacity) {
                const newTrip1 = bestSolution.trip1.filter((_, i) => i !== randomIndex);
                const newTrip2 = [...bestSolution.trip2, orderToMove];
                const newDistance = solveTSP(newTrip1).distance + solveTSP(newTrip2).distance;
                
                if (newDistance < bestSolution.distance) {
                    bestSolution = {
                        trip1: newTrip1,
                        trip2: newTrip2,
                        distance: newDistance
                    };
                    improved = true;
                }
            }
        }
        
        // 尝试从trip2移动到trip1
        if (!improved && bestSolution.trip2.length > 1) {
            const randomIndex = Math.floor(Math.random() * bestSolution.trip2.length);
            const orderToMove = bestSolution.trip2[randomIndex];
            
            if (trip1Capacity + orderToMove.totalDUS <= maxCapacity) {
                const newTrip1 = [...bestSolution.trip1, orderToMove];
                const newTrip2 = bestSolution.trip2.filter((_, i) => i !== randomIndex);
                const newDistance = solveTSP(newTrip1).distance + solveTSP(newTrip2).distance;
                
                if (newDistance < bestSolution.distance) {
                    bestSolution = {
                        trip1: newTrip1,
                        trip2: newTrip2,
                        distance: newDistance
                    };
                    improved = true;
                }
            }
        }
        
        if (iteration % 20 === 0) {
            console.log(`第${iteration}次迭代，当前距离: ${bestSolution.distance.toFixed(2)}km`);
        }
    }
    
    const trip1Capacity = bestSolution.trip1.reduce((s, o) => s + o.totalDUS, 0);
    const trip2Capacity = bestSolution.trip2.reduce((s, o) => s + o.totalDUS, 0);
    
    console.log(`最终解:`);
    console.log(`第1趟: ${bestSolution.trip1.length}个订单, ${trip1Capacity}件, ${solveTSP(bestSolution.trip1).distance.toFixed(2)}km`);
    console.log(`第2趟: ${bestSolution.trip2.length}个订单, ${trip2Capacity}件, ${solveTSP(bestSolution.trip2).distance.toFixed(2)}km`);
    console.log(`总距离: ${bestSolution.distance.toFixed(2)}km`);
    
    return bestSolution;
}

// 主函数
function main() {
    console.log('🚚 路线优化方案对比测试');
    console.log('========================================');
    
    const orders = loadOrders();
    console.log(`总订单数: ${orders.length}`);
    console.log(`总件数: ${orders.reduce((sum, order) => sum + order.totalDUS, 0)}件`);
    
    const results = [];
    
    // 测试三种方案
    results.push(methodA_GeographicClustering(orders));
    results.push(methodB_EnumerativeOptimization(orders));
    results.push(methodC_HeuristicOptimization(orders));
    
    // 对比结果
    console.log('\n📊 方案对比总结:');
    console.log('========================================');
    results.forEach((result, index) => {
        const method = ['A: 地理聚类', 'B: 枚举优化', 'C: 启发式算法'][index];
        console.log(`${method}: ${result.totalDistance || result.distance}km`);
    });
    
    const bestMethod = results.reduce((best, current, index) => {
        const distance = current.totalDistance || current.distance;
        return distance < best.distance ? { index, distance, method: ['A', 'B', 'C'][index] } : best;
    }, { distance: Infinity });
    
    console.log(`\n🏆 最优方案: 方案${bestMethod.method}, 总距离: ${bestMethod.distance.toFixed(2)}km`);
}

// 运行测试
main(); 