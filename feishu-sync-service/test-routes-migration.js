/**
 * Routes API迁移测试脚本
 * 对比两种API的性能和结果
 */

require('dotenv').config();
const HybridRouteOptimizer = require('./hybrid-route-optimizer');

class MigrationTester {
    constructor() {
        this.apiKey = process.env.GOOGLE_MAPS_API_KEY;
        this.hybridOptimizer = new HybridRouteOptimizer(this.apiKey);
        
        // 测试数据
        this.testOrders = [
            {
                id: 'TEST001',
                name: 'Ibu Sri Utami',
                lat: -6.121566354,
                lng: 106.919700019061577,
                dus_count: 17,
                phone: '0812345678'
            },
            {
                id: 'TEST002',
                name: 'Ibu Murniati',
                lat: -6.124966993,
                lng: 106.951539851725251,
                dus_count: 4,
                phone: '0823456789'
            },
            {
                id: 'TEST003',
                name: 'Bapak Supriadi',
                lat: -6.108881024,
                lng: 106.937086433172223,
                dus_count: 5,
                phone: '0834567890'
            },
            {
                id: 'TEST004',
                name: 'Ibu Dewi Retno',
                lat: -6.132062599999999,
                lng: 106.9250148,
                dus_count: 12,
                phone: '0845678901'
            },
            {
                id: 'TEST005',
                name: 'Ibu Samirati',
                lat: -6.101636462340704,
                lng: 106.93333771079779,
                dus_count: 7,
                phone: '0856789012'
            }
        ];
    }

    /**
     * 运行完整的迁移测试
     */
    async runMigrationTest() {
        console.log('🧪 开始Routes API迁移测试...');
        console.log('=' .repeat(60));
        
        const results = {
            legacy_api: null,
            routes_api: null,
            comparison: null,
            recommendation: null
        };

        try {
            // 测试Legacy API
            console.log('\n📊 测试1: Distance Matrix API (Legacy)');
            results.legacy_api = await this.testLegacyApi();
            
            // 测试Routes API
            console.log('\n📊 测试2: Routes API');
            results.routes_api = await this.testRoutesApi();
            
            // 对比分析
            console.log('\n📊 测试3: 性能对比');
            results.comparison = this.compareResults(results.legacy_api, results.routes_api);
            
            // 生成建议
            results.recommendation = this.generateRecommendation(results.comparison);
            
            // 输出完整报告
            this.printDetailedReport(results);
            
            return results;
            
        } catch (error) {
            console.error('❌ 迁移测试失败:', error);
            return { error: error.message };
        }
    }

    /**
     * 测试Legacy API
     */
    async testLegacyApi() {
        console.log('🏛️ 测试Distance Matrix API (Legacy)...');
        
        this.hybridOptimizer.switchToLegacyApi();
        
        const startTime = Date.now();
        const result = await this.hybridOptimizer.optimizeAllRoutes(this.testOrders);
        const endTime = Date.now();
        
        return {
            api_type: 'distance_matrix_legacy',
            execution_time_ms: endTime - startTime,
            total_distance: result.total_distance,
            total_duration: result.total_duration,
            batches: result.batches?.length || 0,
            api_usage: result.api_usage,
            success: !result.error,
            error: result.error || null
        };
    }

    /**
     * 测试Routes API
     */
    async testRoutesApi() {
        console.log('🆕 测试Routes API...');
        
        this.hybridOptimizer.switchToRoutesApi();
        
        const startTime = Date.now();
        const result = await this.hybridOptimizer.optimizeAllRoutes(this.testOrders);
        const endTime = Date.now();
        
        return {
            api_type: 'routes_api',
            execution_time_ms: endTime - startTime,
            total_distance: result.total_distance,
            total_duration: result.total_duration,
            batches: result.batches?.length || 0,
            api_usage: result.api_usage,
            success: !result.error,
            error: result.error || null
        };
    }

    /**
     * 对比两种API的结果
     */
    compareResults(legacyResult, routesResult) {
        if (!legacyResult.success || !routesResult.success) {
            return {
                valid_comparison: false,
                legacy_failed: !legacyResult.success,
                routes_failed: !routesResult.success
            };
        }

        const comparison = {
            valid_comparison: true,
            
            // 性能对比
            performance: {
                legacy_time_ms: legacyResult.execution_time_ms,
                routes_time_ms: routesResult.execution_time_ms,
                time_difference_ms: routesResult.execution_time_ms - legacyResult.execution_time_ms,
                routes_faster: routesResult.execution_time_ms < legacyResult.execution_time_ms,
                performance_improvement: this.calculatePercentageChange(
                    legacyResult.execution_time_ms, 
                    routesResult.execution_time_ms
                )
            },
            
            // 距离对比
            distance: {
                legacy_distance: legacyResult.total_distance,
                routes_distance: routesResult.total_distance,
                distance_difference: routesResult.total_distance - legacyResult.total_distance,
                routes_shorter: routesResult.total_distance < legacyResult.total_distance,
                distance_improvement: this.calculatePercentageChange(
                    legacyResult.total_distance, 
                    routesResult.total_distance
                )
            },
            
            // 时间对比
            duration: {
                legacy_duration: legacyResult.total_duration,
                routes_duration: routesResult.total_duration,
                duration_difference: routesResult.total_duration - legacyResult.total_duration,
                routes_faster_duration: routesResult.total_duration < legacyResult.total_duration,
                duration_improvement: this.calculatePercentageChange(
                    legacyResult.total_duration, 
                    routesResult.total_duration
                )
            },
            
            // API使用对比
            api_usage: {
                legacy_calls_today: legacyResult.api_usage?.api_calls_today || 0,
                routes_calls_today: routesResult.api_usage?.api_calls_today || 0,
                legacy_remaining: legacyResult.api_usage?.remaining_calls || 0,
                routes_remaining: routesResult.api_usage?.remaining_calls || 0,
                routes_has_more_quota: (routesResult.api_usage?.remaining_calls || 0) > (legacyResult.api_usage?.remaining_calls || 0)
            }
        };

        return comparison;
    }

    /**
     * 计算百分比变化
     */
    calculatePercentageChange(oldValue, newValue) {
        if (oldValue === 0) return newValue === 0 ? 0 : 100;
        return Math.round(((newValue - oldValue) / oldValue) * 100 * 10) / 10;
    }

    /**
     * 生成迁移建议
     */
    generateRecommendation(comparison) {
        if (!comparison.valid_comparison) {
            return {
                recommendation: 'unable_to_compare',
                reason: 'API测试失败，无法生成有效对比',
                action: '检查API配置和网络连接'
            };
        }

        const scores = {
            routes_api: 0,
            legacy_api: 0
        };

        // 性能评分
        if (comparison.performance.routes_faster) {
            scores.routes_api += 2;
        } else {
            scores.legacy_api += 1;
        }

        // 距离评分
        if (comparison.distance.routes_shorter) {
            scores.routes_api += 2;
        } else {
            scores.legacy_api += 1;
        }

        // 时间评分
        if (comparison.duration.routes_faster_duration) {
            scores.routes_api += 2;
        } else {
            scores.legacy_api += 1;
        }

        // 配额评分
        if (comparison.api_usage.routes_has_more_quota) {
            scores.routes_api += 3; // 配额更重要
        } else {
            scores.legacy_api += 1;
        }

        // 生成建议
        if (scores.routes_api > scores.legacy_api) {
            return {
                recommendation: 'migrate_to_routes_api',
                confidence: Math.round((scores.routes_api / (scores.routes_api + scores.legacy_api)) * 100),
                reasons: [
                    comparison.performance.routes_faster ? '执行速度更快' : null,
                    comparison.distance.routes_shorter ? '路线距离更短' : null,
                    comparison.duration.routes_faster_duration ? '预计时间更短' : null,
                    comparison.api_usage.routes_has_more_quota ? '免费配额更多' : null
                ].filter(Boolean),
                benefits: [
                    `免费配额从2,500增加到10,000次/月`,
                    `性能提升: ${Math.abs(comparison.performance.performance_improvement)}%`,
                    `支持更多新功能`
                ]
            };
        } else {
            return {
                recommendation: 'keep_legacy_api',
                confidence: Math.round((scores.legacy_api / (scores.routes_api + scores.legacy_api)) * 100),
                reasons: [
                    '当前Legacy API表现更稳定',
                    '迁移成本可能超过收益',
                    '现有系统运行良好'
                ],
                action: '继续使用Legacy API，定期重新评估'
            };
        }
    }

    /**
     * 打印详细报告
     */
    printDetailedReport(results) {
        console.log('\n' + '=' .repeat(60));
        console.log('📊 ROUTES API 迁移测试报告');
        console.log('=' .repeat(60));

        // Legacy API结果
        console.log('\n🏛️ Distance Matrix API (Legacy) 结果:');
        if (results.legacy_api?.success) {
            console.log(`   ✅ 执行时间: ${results.legacy_api.execution_time_ms}ms`);
            console.log(`   📏 总距离: ${results.legacy_api.total_distance}km`);
            console.log(`   ⏱️ 总时间: ${results.legacy_api.total_duration}分钟`);
            console.log(`   📦 批次数: ${results.legacy_api.batches}`);
            console.log(`   🔢 API调用: ${results.legacy_api.api_usage?.api_calls_today || 0}次`);
        } else {
            console.log(`   ❌ 失败: ${results.legacy_api?.error}`);
        }

        // Routes API结果
        console.log('\n🆕 Routes API 结果:');
        if (results.routes_api?.success) {
            console.log(`   ✅ 执行时间: ${results.routes_api.execution_time_ms}ms`);
            console.log(`   📏 总距离: ${results.routes_api.total_distance}km`);
            console.log(`   ⏱️ 总时间: ${results.routes_api.total_duration}分钟`);
            console.log(`   📦 批次数: ${results.routes_api.batches}`);
            console.log(`   🔢 API调用: ${results.routes_api.api_usage?.api_calls_today || 0}次`);
        } else {
            console.log(`   ❌ 失败: ${results.routes_api?.error}`);
        }

        // 对比结果
        if (results.comparison?.valid_comparison) {
            console.log('\n📊 对比分析:');
            console.log(`   ⚡ 性能: Routes API ${results.comparison.performance.routes_faster ? '更快' : '更慢'} ${Math.abs(results.comparison.performance.performance_improvement)}%`);
            console.log(`   📏 距离: Routes API ${results.comparison.distance.routes_shorter ? '更短' : '更长'} ${Math.abs(results.comparison.distance.distance_improvement)}%`);
            console.log(`   ⏱️ 时间: Routes API ${results.comparison.duration.routes_faster_duration ? '更短' : '更长'} ${Math.abs(results.comparison.duration.duration_improvement)}%`);
            console.log(`   💰 配额: Routes API剩余 ${results.comparison.api_usage.routes_remaining} vs Legacy ${results.comparison.api_usage.legacy_remaining}`);
        }

        // 迁移建议
        console.log('\n💡 迁移建议:');
        if (results.recommendation) {
            if (results.recommendation.recommendation === 'migrate_to_routes_api') {
                console.log(`   ✅ 建议迁移到Routes API (置信度: ${results.recommendation.confidence}%)`);
                console.log(`   📈 主要优势:`);
                results.recommendation.benefits?.forEach(benefit => {
                    console.log(`      • ${benefit}`);
                });
            } else if (results.recommendation.recommendation === 'keep_legacy_api') {
                console.log(`   ⚠️ 建议继续使用Legacy API (置信度: ${results.recommendation.confidence}%)`);
                console.log(`   📋 原因: ${results.recommendation.reasons?.join(', ')}`);
            } else {
                console.log(`   ❓ 无法生成明确建议: ${results.recommendation.reason}`);
            }
        }

        console.log('\n' + '=' .repeat(60));
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const tester = new MigrationTester();
    tester.runMigrationTest()
        .then(results => {
            console.log('\n✅ 迁移测试完成');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ 迁移测试失败:', error);
            process.exit(1);
        });
}

module.exports = MigrationTester; 