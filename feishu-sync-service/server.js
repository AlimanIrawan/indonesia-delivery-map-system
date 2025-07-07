const express = require('express');
const cron = require('node-cron');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件配置
app.use(cors());
app.use(express.json());

// 日志函数
function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
}

function error(message) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ ${message}`);
}

function success(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ✅ ${message}`);
}

// 飞书多维表格API相关函数
class FeishuBitableAPI {
    constructor() {
        this.appId = process.env.FEISHU_APP_ID;
        this.appSecret = process.env.FEISHU_APP_SECRET;
        this.appToken = process.env.FEISHU_APP_TOKEN;
        this.tableId = process.env.FEISHU_TABLE_ID;
        this.accessToken = null;
        this.tokenExpires = 0;
    }

    // 获取访问令牌
    async getAccessToken() {
        try {
            if (this.accessToken && Date.now() < this.tokenExpires) {
                return this.accessToken;
            }

            const fetch = (await import('node-fetch')).default;
            
            const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    app_id: this.appId,
                    app_secret: this.appSecret
                })
            });

            const data = await response.json();
            
            if (data.code === 0) {
                this.accessToken = data.tenant_access_token;
                this.tokenExpires = Date.now() + (data.expire - 300) * 1000; // 提前5分钟刷新
                success('飞书访问令牌获取成功');
                return this.accessToken;
            } else {
                throw new Error(`获取访问令牌失败: ${data.msg}`);
            }
        } catch (err) {
            error(`获取飞书访问令牌失败: ${err.message}`);
            throw err;
        }
    }

    // 获取数据表字段信息
    async getTableFields() {
        try {
            const token = await this.getAccessToken();
            const fetch = (await import('node-fetch')).default;

            const response = await fetch(
                `https://open.feishu.cn/open-apis/bitable/v1/apps/${this.appToken}/tables/${this.tableId}/fields`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const data = await response.json();
            
            if (data.code === 0) {
                log(`获取到 ${data.data.items.length} 个字段`);
                return data.data.items;
            } else {
                throw new Error(`获取字段失败: ${data.msg}`);
            }
        } catch (err) {
            error(`获取多维表格字段失败: ${err.message}`);
            throw err;
        }
    }

    // 读取多维表格数据
    async readBitableData() {
        try {
            const token = await this.getAccessToken();
            const fetch = (await import('node-fetch')).default;

            // 获取今天的日期 (Jakarta时区)
            const today = new Date();
            const jakartaTime = new Date(today.getTime() + (7 * 60 * 60 * 1000)); // UTC+7
            const todayStr = jakartaTime.toISOString().split('T')[0]; // YYYY-MM-DD格式
            
            log(`读取飞书多维表格数据，查找今日送货任务: ${todayStr}`);

            // 首先获取字段信息
            const fields = await this.getTableFields();
            const fieldMap = {};
            fields.forEach(field => {
                fieldMap[field.field_id] = field.field_name;
            });

            log(`字段映射: ${JSON.stringify(fieldMap)}`);

            // 读取记录数据
            const response = await fetch(
                `https://open.feishu.cn/open-apis/bitable/v1/apps/${this.appToken}/tables/${this.tableId}/records?page_size=500`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const data = await response.json();
            
            if (data.code === 0) {
                const records = data.data?.items || [];
                log(`从飞书多维表格读取到 ${records.length} 条记录`);
                
                if (records.length === 0) {
                    log('多维表格中没有数据');
                    return [];
                }

                // 查找对应的字段ID
                const findFieldId = (fieldName) => {
                    for (const [fieldId, name] of Object.entries(fieldMap)) {
                        if (name && name.toLowerCase().includes(fieldName.toLowerCase())) {
                            return fieldId;
                        }
                    }
                    return null;
                };

                const longitudeFieldId = findFieldId('经度') || findFieldId('longitude');
                const latitudeFieldId = findFieldId('纬度') || findFieldId('latitude');
                const nameFieldId = findFieldId('nama pemilik') || findFieldId('pemilik') || findFieldId('nama');
                const phoneFieldId = findFieldId('电话') || findFieldId('phone') || findFieldId('telp');
                const poTypeFieldId = findFieldId('po type') || findFieldId('type');
                const dateFieldId = findFieldId('日期') || findFieldId('date') || findFieldId('tanggal');

                log(`字段ID映射: 经度=${longitudeFieldId}, 纬度=${latitudeFieldId}, 姓名=${nameFieldId}, 电话=${phoneFieldId}, PO类型=${poTypeFieldId}, 日期=${dateFieldId}`);

                // 处理记录数据
                const deliveryData = [];
                for (let i = 0; i < records.length; i++) {
                    const record = records[i];
                    const recordFields = record.fields;
                    
                    // 检查日期是否为今天
                    let isToday = false;
                    if (dateFieldId && recordFields[dateFieldId]) {
                        const dateValue = recordFields[dateFieldId];
                        let recordDate;
                        
                        // 处理不同的日期格式
                        if (typeof dateValue === 'number') {
                            // 时间戳格式
                            recordDate = new Date(dateValue);
                        } else if (typeof dateValue === 'string') {
                            recordDate = new Date(dateValue);
                        } else if (typeof dateValue === 'object' && dateValue.timestamp) {
                            // 多维表格日期对象格式
                            recordDate = new Date(dateValue.timestamp);
                        } else {
                            recordDate = new Date();
                        }
                        
                        const recordDateStr = recordDate.toISOString().split('T')[0];
                        isToday = recordDateStr === todayStr;
                    }

                    // 如果没有日期字段，或者日期为今天，则包含这条记录
                    if (!dateFieldId || isToday) {
                        const longitude = parseFloat(recordFields[longitudeFieldId] || '0');
                        const latitude = parseFloat(recordFields[latitudeFieldId] || '0');
                        
                        // 验证坐标有效性
                        if (longitude && latitude && 
                            longitude >= -180 && longitude <= 180 && 
                            latitude >= -90 && latitude <= 90) {
                            
                            // 处理PO类型（可能是单选或多选）
                            let poType = '';
                            if (poTypeFieldId && recordFields[poTypeFieldId]) {
                                const poTypeValue = recordFields[poTypeFieldId];
                                if (Array.isArray(poTypeValue)) {
                                    // 多选字段
                                    poType = poTypeValue.map(item => item.text || item).join(', ');
                                } else if (typeof poTypeValue === 'object' && poTypeValue.text) {
                                    // 单选字段
                                    poType = poTypeValue.text;
                                } else {
                                    poType = String(poTypeValue);
                                }
                            }
                            
                            // 处理姓名字段
                            let outletName = '未知店铺';
                            if (nameFieldId && recordFields[nameFieldId]) {
                                const nameValue = recordFields[nameFieldId];
                                if (typeof nameValue === 'object' && nameValue.text) {
                                    outletName = nameValue.text;
                                } else {
                                    outletName = String(nameValue);
                                }
                            }
                            
                            // 处理电话字段
                            let phoneNumber = '';
                            if (phoneFieldId && recordFields[phoneFieldId]) {
                                const phoneValue = recordFields[phoneFieldId];
                                if (typeof phoneValue === 'object' && phoneValue.text) {
                                    phoneNumber = phoneValue.text;
                                } else {
                                    phoneNumber = String(phoneValue);
                                }
                            }
                            
                            deliveryData.push({
                                longitude: longitude,
                                latitude: latitude,
                                outlet_name: outletName,
                                phone_number: phoneNumber,
                                po_type: poType,
                                delivery_date: dateFieldId ? (recordFields[dateFieldId] || todayStr) : todayStr,
                                shop_code: `DEL_${Date.now()}_${i}` // 生成唯一标识
                            });
                        } else {
                            log(`记录 ${i+1} 坐标无效: 经度=${longitude}, 纬度=${latitude}`);
                        }
                    }
                }

                success(`处理完成，今日送货任务: ${deliveryData.length} 条`);
                return deliveryData;

            } else {
                throw new Error(`读取多维表格失败: ${data.msg}`);
            }
        } catch (err) {
            error(`读取飞书多维表格数据失败: ${err.message}`);
            throw err;
        }
    }
}

// GitHub更新函数
async function updateGitHubCSV(deliveryData) {
    try {
        log('开始更新GitHub CSV文件');
        
        const githubToken = process.env.GITHUB_TOKEN;
        const repoOwner = process.env.GITHUB_REPO_OWNER;
        const repoName = process.env.GITHUB_REPO_NAME;
        
        if (!githubToken || !repoOwner || !repoName) {
            throw new Error('GitHub配置信息不完整');
        }

        const fetch = (await import('node-fetch')).default;

        // 生成CSV内容
        const csvHeader = 'shop_code,latitude,longitude,outlet_name,phone_number,po_type,delivery_date';
        const csvRows = deliveryData.map(item => 
            `${item.shop_code},${item.latitude},${item.longitude},"${item.outlet_name}","${item.phone_number}","${item.po_type}","${item.delivery_date}"`
        );
        const csvContent = [csvHeader, ...csvRows].join('\n');

        log(`生成CSV内容，${deliveryData.length} 条记录`);

        // 获取当前文件的SHA（如果存在）
        let currentSha = null;
        try {
            const getResponse = await fetch(
                `https://api.github.com/repos/${repoOwner}/${repoName}/contents/public/markers.csv`,
                {
                    headers: {
                        'Authorization': `token ${githubToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            
            if (getResponse.ok) {
                const fileData = await getResponse.json();
                currentSha = fileData.sha;
                log('获取到现有文件SHA');
            }
        } catch (err) {
            log('文件不存在，将创建新文件');
        }

        // 更新或创建文件
        const updateData = {
            message: `🚚 更新多维表格送货数据 - ${new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Jakarta'})}`,
            content: Buffer.from(csvContent).toString('base64'),
            branch: 'main'
        };

        if (currentSha) {
            updateData.sha = currentSha;
        }

        const updateResponse = await fetch(
            `https://api.github.com/repos/${repoOwner}/${repoName}/contents/public/markers.csv`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify(updateData)
            }
        );

        if (updateResponse.ok) {
            success('GitHub CSV文件更新成功');
            return true;
        } else {
            const errorData = await updateResponse.text();
            throw new Error(`GitHub更新失败: ${updateResponse.status} - ${errorData}`);
        }

    } catch (err) {
        error(`更新GitHub失败: ${err.message}`);
        throw err;
    }
}

// 执行同步任务
async function performSync() {
    try {
        log('=== 开始执行定时同步任务 ===');
        
        // 检查必要的环境变量
        const requiredEnvs = [
            'FEISHU_APP_ID', 'FEISHU_APP_SECRET', 
            'FEISHU_APP_TOKEN', 'FEISHU_TABLE_ID',
            'GITHUB_TOKEN', 'GITHUB_REPO_OWNER', 'GITHUB_REPO_NAME'
        ];
        
        const missingEnvs = requiredEnvs.filter(env => !process.env[env]);
        if (missingEnvs.length > 0) {
            throw new Error(`缺少环境变量: ${missingEnvs.join(', ')}`);
        }

        // 创建飞书多维表格API实例
        const feishu = new FeishuBitableAPI();
        
        // 读取飞书多维表格数据
        const deliveryData = await feishu.readBitableData();
        
        // 更新GitHub CSV
        await updateGitHubCSV(deliveryData);
        
        success(`=== 同步任务完成，更新了 ${deliveryData.length} 条送货数据 ===`);
        
        return {
            success: true,
            count: deliveryData.length,
            timestamp: new Date().toISOString()
        };
        
    } catch (err) {
        error(`同步任务失败: ${err.message}`);
        return {
            success: false,
            error: err.message,
            timestamp: new Date().toISOString()
        };
    }
}

// 设置定时任务
// 每天上午9:00和下午14:00 (Jakarta时间)
cron.schedule('0 9,14 * * *', async () => {
    log('定时任务触发 - 开始同步送货数据');
    await performSync();
}, {
    timezone: "Asia/Jakarta"
});

// API路由
app.get('/', (req, res) => {
    res.json({
        service: '飞书多维表格送货数据同步服务',
        version: '1.0.0',
        status: 'running',
        schedule: '每天 09:00 和 14:00 (Jakarta时间)',
        endpoints: {
            'GET /': '服务信息',
            'GET /health': '健康检查',
            'POST /sync': '手动触发同步',
            'GET /status': '最后同步状态'
        },
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

// 手动触发同步
app.post('/sync', async (req, res) => {
    log('收到手动同步请求');
    const result = await performSync();
    res.json(result);
});

// 最后同步状态
let lastSyncResult = null;
app.get('/status', (req, res) => {
    res.json({
        lastSync: lastSyncResult,
        nextSchedule: '每天 09:00 和 14:00 (Jakarta时间)',
        currentTime: new Date().toISOString()
    });
});

// 启动服务器
app.listen(PORT, () => {
    success(`飞书多维表格同步服务启动成功，端口: ${PORT}`);
    log('定时任务已设置: 每天 09:00 和 14:00 (Jakarta时间)');
    log('服务端点:');
    log(`  - 服务信息: GET /`);
    log(`  - 健康检查: GET /health`);
    log(`  - 手动同步: POST /sync`);
    log(`  - 同步状态: GET /status`);
});

// 启动时执行一次同步（可选）
setTimeout(async () => {
    log('服务启动完成，执行初始同步...');
    lastSyncResult = await performSync();
}, 5000); 