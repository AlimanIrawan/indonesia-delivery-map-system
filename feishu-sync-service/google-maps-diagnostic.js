/**
 * Google Maps API 诊断和修复工具
 * 检测API密钥状态、权限、配额等问题
 */

const { Client } = require('@googlemaps/google-maps-services-js');
const axios = require('axios');

class GoogleMapsApiDiagnostic {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.client = new Client({});
    }

    /**
     * 运行完整的API诊断
     */
    async runDiagnostic() {
        console.log('🔍 开始Google Maps API诊断...');
        console.log('=' .repeat(60));
        
        const results = {
            api_key_valid: false,
            quota_available: false,
            distance_matrix_enabled: false,
            geocoding_enabled: false,
            restrictions: [],
            quota_info: null,
            test_calls: [],
            recommendations: []
        };

        // 1. 检查API密钥格式
        console.log('📋 1. 检查API密钥格式...');
        if (!this.apiKey) {
            console.log('❌ API密钥未提供');
            results.recommendations.push('配置GOOGLE_MAPS_API_KEY环境变量');
            return results;
        }
        
        if (!this.apiKey.startsWith('AIza')) {
            console.log('⚠️ API密钥格式可能不正确（应该以AIza开头）');
            results.recommendations.push('检查API密钥格式是否正确');
        } else {
            console.log('✅ API密钥格式正确');
        }

        // 2. 测试简单的Geocoding API
        console.log('\n📋 2. 测试Geocoding API...');
        try {
            const geocodingTest = await this.client.geocode({
                params: {
                    address: 'Jakarta, Indonesia',
                    key: this.apiKey
                }
            });
            
            if (geocodingTest.data.status === 'OK') {
                console.log('✅ Geocoding API工作正常');
                results.geocoding_enabled = true;
                results.api_key_valid = true;
                results.test_calls.push({
                    api: 'geocoding',
                    status: 'success',
                    result: 'API密钥有效'
                });
            } else {
                console.log(`❌ Geocoding API错误: ${geocodingTest.data.status}`);
                results.test_calls.push({
                    api: 'geocoding',
                    status: 'failed',
                    error: geocodingTest.data.status
                });
            }
        } catch (error) {
            console.log(`❌ Geocoding API调用失败: ${error.message}`);
            results.test_calls.push({
                api: 'geocoding',
                status: 'failed',
                error: error.message
            });
            
            if (error.response?.status === 403) {
                console.log('🔍 403错误表明API密钥权限问题');
                results.recommendations.push('检查API密钥是否启用了Geocoding API');
                results.recommendations.push('检查API密钥是否有域名/IP限制');
            }
        }

        // 3. 测试Distance Matrix API
        console.log('\n📋 3. 测试Distance Matrix API...');
        try {
            const distanceTest = await this.client.distancematrix({
                params: {
                    origins: ['-6.1, 106.8'],
                    destinations: ['-6.2, 106.9'],
                    mode: 'driving',
                    key: this.apiKey
                }
            });
            
            if (distanceTest.data.status === 'OK') {
                console.log('✅ Distance Matrix API工作正常');
                results.distance_matrix_enabled = true;
                results.quota_available = true;
                results.test_calls.push({
                    api: 'distance_matrix',
                    status: 'success',
                    distance: distanceTest.data.rows[0]?.elements[0]?.distance?.text || 'unknown'
                });
            } else {
                console.log(`❌ Distance Matrix API错误: ${distanceTest.data.status}`);
                results.test_calls.push({
                    api: 'distance_matrix',
                    status: 'failed',
                    error: distanceTest.data.status
                });
            }
        } catch (error) {
            console.log(`❌ Distance Matrix API调用失败: ${error.message}`);
            results.test_calls.push({
                api: 'distance_matrix',
                status: 'failed',
                error: error.message
            });
            
            if (error.response?.status === 403) {
                console.log('🔍 403错误 - 可能的原因:');
                console.log('  - Distance Matrix API未启用');
                console.log('  - API密钥有域名/IP限制');
                console.log('  - 免费配额已用完');
                results.recommendations.push('在Google Cloud Console中启用Distance Matrix API');
                results.recommendations.push('检查API密钥限制设置');
                results.recommendations.push('检查API配额使用情况');
            }
        }

        // 4. 检查API配额信息（需要额外的API调用）
        console.log('\n📋 4. 尝试获取配额信息...');
        try {
            // 这个调用可能需要特殊权限，所以放在try-catch中
            const quotaResponse = await axios.get(
                `https://maps.googleapis.com/maps/api/quota/json?key=${this.apiKey}`
            );
            results.quota_info = quotaResponse.data;
            console.log('✅ 获取到配额信息');
        } catch (error) {
            console.log('⚠️ 无法获取配额信息（这是正常的）');
        }

        // 5. 生成修复建议
        console.log('\n📋 5. 生成修复建议...');
        this.generateRecommendations(results);

        console.log('\n' + '=' .repeat(60));
        console.log('🎯 诊断完成！');
        
        return results;
    }

    /**
     * 生成修复建议
     */
    generateRecommendations(results) {
        if (!results.api_key_valid) {
            results.recommendations.push('获取有效的Google Maps API密钥');
            results.recommendations.push('访问 https://console.cloud.google.com/apis/credentials');
        }

        if (!results.distance_matrix_enabled) {
            results.recommendations.push('启用Distance Matrix API服务');
            results.recommendations.push('访问 https://console.cloud.google.com/apis/library/distance-matrix-backend.googleapis.com');
        }

        if (!results.quota_available) {
            results.recommendations.push('检查API配额和计费设置');
            results.recommendations.push('考虑启用计费账户以获得更多免费配额');
        }

        // 通用建议
        results.recommendations.push('确保API密钥没有不必要的域名/IP限制');
        results.recommendations.push('在Render环境变量中正确设置GOOGLE_MAPS_API_KEY');
        results.recommendations.push('考虑使用直线距离作为备用方案（当前已实现）');
    }

    /**
     * 测试特定的距离计算
     */
    async testSpecificRoute() {
        console.log('\n🧪 测试实际路线计算...');
        
        const testPoints = [
            { lat: -6.11258762834466, lng: 106.91732818555802, name: '雅加达总部' },
            { lat: -6.132062599999999, lng: 106.9250148, name: 'Bapak Haryono' },
            { lat: -6.101636462340704, lng: 106.93333771079779, name: 'Ibu Dewi Romiyani' }
        ];

        for (let i = 0; i < testPoints.length - 1; i++) {
            const from = testPoints[i];
            const to = testPoints[i + 1];
            
            try {
                console.log(`📍 测试: ${from.name} -> ${to.name}`);
                
                const result = await this.client.distancematrix({
                    params: {
                        origins: [`${from.lat},${from.lng}`],
                        destinations: [`${to.lat},${to.lng}`],
                        mode: 'driving',
                        language: 'zh-CN',
                        key: this.apiKey
                    }
                });

                if (result.data.status === 'OK' && 
                    result.data.rows[0]?.elements[0]?.status === 'OK') {
                    
                    const element = result.data.rows[0].elements[0];
                    console.log(`✅ 距离: ${element.distance.text}, 时间: ${element.duration.text}`);
                } else {
                    console.log(`❌ 失败: ${result.data.status}`);
                }
            } catch (error) {
                console.log(`❌ API调用失败: ${error.message}`);
                
                // 计算直线距离作为对比
                const straightDistance = this.calculateStraightLineDistance(
                    from.lat, from.lng, to.lat, to.lng
                );
                console.log(`📏 直线距离: ${straightDistance.toFixed(2)} km (备用)`);
            }
        }
    }

    /**
     * 计算直线距离（备用方案）
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
     * 打印诊断报告
     */
    printReport(results) {
        console.log('\n📊 诊断报告');
        console.log('=' .repeat(60));
        
        console.log(`🔑 API密钥状态: ${results.api_key_valid ? '✅ 有效' : '❌ 无效'}`);
        console.log(`📊 配额状态: ${results.quota_available ? '✅ 可用' : '❌ 不可用'}`);
        console.log(`🗺️ Distance Matrix API: ${results.distance_matrix_enabled ? '✅ 启用' : '❌ 未启用'}`);
        console.log(`📍 Geocoding API: ${results.geocoding_enabled ? '✅ 启用' : '❌ 未启用'}`);
        
        if (results.test_calls.length > 0) {
            console.log('\n🧪 测试调用结果:');
            results.test_calls.forEach((call, index) => {
                console.log(`  ${index + 1}. ${call.api}: ${call.status === 'success' ? '✅' : '❌'} ${call.status === 'success' ? (call.result || call.distance || 'success') : call.error}`);
            });
        }
        
        if (results.recommendations.length > 0) {
            console.log('\n💡 修复建议:');
            results.recommendations.forEach((rec, index) => {
                console.log(`  ${index + 1}. ${rec}`);
            });
        }
    }
}

module.exports = GoogleMapsApiDiagnostic;

// 如果直接运行此文件，执行诊断
if (require.main === module) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || 'your-api-key-here';
    const diagnostic = new GoogleMapsApiDiagnostic(apiKey);
    
    (async () => {
        const results = await diagnostic.runDiagnostic();
        await diagnostic.testSpecificRoute();
        diagnostic.printReport(results);
    })();
} 