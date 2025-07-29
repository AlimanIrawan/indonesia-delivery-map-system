const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const { Octokit } = require('@octokit/rest');
const cors = require('cors');
const RoutesVisualOptimizer = require('./routes-visual-optimizer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件配置
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // 添加静态文件服务

// 飞书API配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const FEISHU_APP_TOKEN = process.env.FEISHU_APP_TOKEN;
const FEISHU_TABLE_ID = process.env.FEISHU_TABLE_ID;

// GitHub配置
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME;

// Google Maps API配置
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

// 初始化Routes API可视化优化器
let routeOptimizer = null;
if (GOOGLE_MAPS_API_KEY) {
  routeOptimizer = new RoutesVisualOptimizer(GOOGLE_MAPS_API_KEY);
  console.log('✅ Routes API可视化优化器初始化成功');
} else {
  console.log('⚠️ 未找到Google Maps API密钥，路线优化功能不可用');
}

let accessToken = null;
let tokenExpiry = 0;

// 获取飞书访问令牌
async function getFeishuAccessToken() {
  try {
    if (accessToken && Date.now() < tokenExpiry) {
      return accessToken;
    }

    console.log('🔑 获取飞书访问令牌...');
    
    // 检查必要的环境变量
    if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) {
      throw new Error('飞书API配置不完整：缺少APP_ID或APP_SECRET');
    }

    const response = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET
    }, {
      timeout: 10000 // 10秒超时
    });

    if (response.data.code === 0) {
      accessToken = response.data.tenant_access_token;
      tokenExpiry = Date.now() + (response.data.expire - 300) * 1000; // 提前5分钟刷新
      console.log('✅ 飞书访问令牌获取成功');
      return accessToken;
    } else {
      throw new Error(`获取访问令牌失败 (code: ${response.data.code}): ${response.data.msg}`);
    }
  } catch (error) {
    if (error.response) {
      console.error('❌ 飞书API响应错误:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
      throw new Error(`飞书API错误 ${error.response.status}: ${error.response.statusText}`);
    } else if (error.request) {
      console.error('❌ 飞书API网络错误:', error.message);
      throw new Error(`网络连接失败: ${error.message}`);
    } else {
      console.error('❌ 获取飞书访问令牌失败:', error.message);
      throw error;
    }
  }
}

// 获取今天的日期字符串 (YYYY/MM/DD 格式)
function getTodayDateString() {
  // 使用Jakarta时区获取当前日期
  const today = new Date();
  const jakartaDate = new Date(today.toLocaleString("en-US", {timeZone: "Asia/Jakarta"}));
  const year = jakartaDate.getFullYear();
  const month = String(jakartaDate.getMonth() + 1).padStart(2, '0');
  const day = String(jakartaDate.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

// 从飞书多维表格获取数据
async function getFeishuData() {
  try {
    const token = await getFeishuAccessToken();
    const todayDate = getTodayDateString();
    
    console.log(`📅 获取今天的送货数据: ${todayDate}`);
    
    // 获取所有记录
    let allRecords = [];
    let hasMore = true;
    let pageToken = null;

    while (hasMore) {
      const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_ID}/records`;
      const params = {
        page_size: 500
      };
      
      if (pageToken) {
        params.page_token = pageToken;
      }

      console.log('🔍 正在获取飞书数据...');
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params,
        timeout: 15000 // 15秒超时
      });

      if (response.data.code === 0) {
        const records = response.data.data.items || [];
        allRecords = allRecords.concat(records);
        
        hasMore = response.data.data.has_more;
        pageToken = response.data.data.page_token;
        
        console.log(`📦 已获取 ${records.length} 条记录`);
      } else {
        console.error('❌ 飞书数据API错误:', {
          code: response.data.code,
          msg: response.data.msg,
          url: url
        });
        throw new Error(`获取数据失败 (code: ${response.data.code}): ${response.data.msg}`);
      }
    }

    console.log(`📊 总共获取 ${allRecords.length} 条记录`);

    // 过滤今天的数据并转换格式
    const todayRecords = allRecords.filter(record => {
      const tanggalKirim = record.fields['Tanggal Kirim EsKrim'];
      if (!tanggalKirim) {
        console.log(`⚠️ 记录缺少发送日期字段: ${record.fields['Outlet Code'] || 'Unknown'}`);
        return false;
      }
      
      // 处理日期格式，可能是时间戳或日期字符串
      let recordDate;
      if (typeof tanggalKirim === 'number') {
        recordDate = new Date(tanggalKirim);
        // 转换为Jakarta时区的日期
        const jakartaDateString = recordDate.toLocaleDateString("en-CA", {timeZone: "Asia/Jakarta"});
        console.log(`📅 时间戳格式: ${tanggalKirim} -> Jakarta时区: ${jakartaDateString}`);
        recordDate = new Date(jakartaDateString);
      } else if (typeof tanggalKirim === 'string') {
        recordDate = new Date(tanggalKirim);
        console.log(`📅 字符串格式: ${tanggalKirim} -> ${recordDate.toLocaleDateString()}`);
      } else {
        console.log(`❌ 未知日期格式: ${typeof tanggalKirim} - ${tanggalKirim}`);
        return false;
      }
      
      // 检查日期是否有效
      if (isNaN(recordDate.getTime())) {
        console.log(`❌ 无效日期: ${tanggalKirim}`);
        return false;
      }
      
      const recordDateString = `${recordDate.getFullYear()}/${String(recordDate.getMonth() + 1).padStart(2, '0')}/${String(recordDate.getDate()).padStart(2, '0')}`;
      const isToday = recordDateString === todayDate;
      
      console.log(`🔍 日期比较: 记录日期=${recordDateString}, 今天=${todayDate}, 匹配=${isToday}`);
      
      if (isToday) {
        // 调试输出：显示记录的所有字段名称
        console.log(`🔍 今天的记录字段: ${record.fields['Outlet Code']} - 字段列表: ${Object.keys(record.fields).join(', ')}`);
        console.log(`📍 经纬度字段值: latitude=${record.fields['latitude']}, longitude=${record.fields['longitude']}`);
      }
      
      return isToday;
    });

    console.log(`🎯 筛选出今天的记录: ${todayRecords.length} 条`);

    // 转换为CSV格式的数据
    const csvData = todayRecords.map(record => {
      const fields = record.fields;
      
      // 辅助函数：提取飞书字段的文本值
      const getFieldText = (field) => {
        if (!field) return '';
        if (Array.isArray(field) && field.length > 0 && field[0].text) {
          return field[0].text;
        }
        if (typeof field === 'string') return field;
        if (typeof field === 'number') return field.toString();
        return '';
      };
      
      // 辅助函数：提取电话号码
      const getPhoneNumber = (field) => {
        if (!field) return '';
        if (Array.isArray(field) && field.length > 0 && field[0].fullPhoneNum) {
          return field[0].fullPhoneNum;
        }
        return getFieldText(field);
      };
      
      // 提取所有字段的文本值
      const outletCode = getFieldText(fields['Outlet Code']);
      const latitude = parseFloat(getFieldText(fields['latitude']));
      const longitude = parseFloat(getFieldText(fields['longitude']));
      const namaPemilik = getFieldText(fields['Nama Pemilik']);
      const noTelepon = getPhoneNumber(fields['No Telepon Pemilik']);
      const kantong = getFieldText(fields['Kantong']);
      const orderType = getFieldText(fields['Order Type']);
      const totalDUS = getFieldText(fields['Total DUS']);
      
      // 提取Gudang OUT状态（重要：用于路线优化时过滤已出库订单）
      const gudangOut = getFieldText(fields['Gudang OUT']);
      
      // 提取Outlet IN状态（新增：用于判断是否已到店）
      const outletIn = getFieldText(fields['Outlet IN']);
      
      // 提取最终价格 - 优先使用Final Price IDR字段
      let finalPrice = '';
      if (fields['Final Price IDR']) {
        if (typeof fields['Final Price IDR'] === 'number') {
          finalPrice = fields['Final Price IDR'].toString();
        } else {
          finalPrice = getFieldText(fields['Final Price IDR']);
        }
      } else if (fields['Price-Auto']) {
        if (typeof fields['Price-Auto'] === 'number') {
          finalPrice = fields['Price-Auto'].toString();
        } else {
          finalPrice = getFieldText(fields['Price-Auto']);
        }
      }
      
      // 详细调试输出
      console.log(`🔍 记录详情: ${outletCode}`);
      console.log(`  - 经纬度: lat=${latitude}, lng=${longitude}`);
      console.log(`  - 店主: ${namaPemilik}`);
      console.log(`  - 电话: ${noTelepon}`);
      console.log(`  - Kantong: ${kantong}, Order Type: ${orderType}, Total DUS: ${totalDUS}`);
      console.log(`  - 最终价格: ${finalPrice} IDR`);
      console.log(`  - Gudang OUT状态: ${gudangOut} ${gudangOut === '✅' ? '(已出库)' : '(未出库)'}`);      
      console.log(`  - Outlet IN状态: ${outletIn} ${outletIn === '✅' ? '(已到店)' : '(未到店)'}`);
      
      // 如果经纬度无效，跳过此记录
      if (latitude === 0 || longitude === 0) {
        console.log(`⚠️ 跳过无效坐标的记录: ${outletCode}`);
        return null;
      }

      return {
        shop_code: outletCode || '',
        latitude: latitude,
        longitude: longitude,
        outlet_name: namaPemilik || '',
        phoneNumber: noTelepon || '',
        kantong: kantong || '',
        orderType: orderType || '',
        totalDUS: totalDUS || '',
        finalPrice: finalPrice || '',
        gudangOut: gudangOut || '', // 直接添加gudangOut字段
        outletIn: outletIn || '', // 新增outletIn字段
        // 保留原始字段数据，特别是Gudang OUT和Outlet IN状态，用于路线优化过滤
        fields: {
          'Gudang OUT': gudangOut,
          'Outlet IN': outletIn,
          'Outlet Code': outletCode,
          'Nama Pemilik': namaPemilik,
          'Total DUS': totalDUS,
          ...fields // 保留所有原始字段以备后用
        }
      };
    }).filter(record => record !== null); // 过滤掉无效记录

    console.log(`✅ 有效的送货地点: ${csvData.length} 个`);
    return csvData;

  } catch (error) {
    console.error('❌ 获取飞书数据失败:', error.message);
    
    // 输出详细的错误信息
    if (error.response) {
      console.error('📄 错误状态码:', error.response.status);
      console.error('📄 错误响应头:', JSON.stringify(error.response.headers, null, 2));
      console.error('📄 错误响应数据:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('📄 请求错误:', error.request);
    } else {
      console.error('📄 其他错误:', error.message);
    }
    
    throw error;
  }
}

// 生成CSV内容
function generateCSV(data) {
  const headers = 'shop_code,latitude,longitude,outlet_name,phoneNumber,kantong,orderType,totalDUS,finalPrice,gudangOut,outletIn';
  const rows = data.map(item => {
    // 直接从item对象获取gudangOut和outletIn，而不是从fields对象
    const gudangOutStatus = item.gudangOut || '';
    const outletInStatus = item.outletIn || '';
    return `${item.shop_code},${item.latitude},${item.longitude},"${item.outlet_name}","${item.phoneNumber}","${item.kantong}","${item.orderType}","${item.totalDUS}","${item.finalPrice}","${gudangOutStatus}","${outletInStatus}"`;
  });
  return [headers, ...rows].join('\n');
}

// 更新GitHub仓库中的CSV文件
async function updateGitHubCSV(csvContent) {
  try {
    console.log('📤 更新GitHub仓库中的CSV文件...');
    
    // 检查必要的环境变量
    if (!GITHUB_TOKEN || !GITHUB_REPO_OWNER || !GITHUB_REPO_NAME) {
      throw new Error('GitHub配置不完整：缺少TOKEN、REPO_OWNER或REPO_NAME');
    }
    
    // 获取当前文件内容以获取SHA
    let sha = null;
    try {
      const { data: currentFile } = await octokit.rest.repos.getContent({
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_REPO_NAME,
        path: 'public/markers.csv',
      });
      sha = currentFile.sha;
    } catch (error) {
      if (error.status === 404) {
        console.log('📝 文件不存在，将创建新文件');
      } else {
        console.warn('⚠️ 获取文件SHA失败:', error.message);
      }
    }

    const today = getTodayDateString();
    const message = `🚚 更新送货数据 - ${today}`;

    // 更新或创建文件
    const updateResult = await octokit.rest.repos.createOrUpdateFileContents({
      owner: GITHUB_REPO_OWNER,
      repo: GITHUB_REPO_NAME,
      path: 'public/markers.csv',
      message: message,
      content: Buffer.from(csvContent).toString('base64'),
      sha: sha, // 如果文件存在则提供SHA，不存在则为null
    });

    console.log('✅ GitHub CSV文件更新成功');
    console.log(`📄 文件大小: ${csvContent.length} 字符`);
    return updateResult;
  } catch (error) {
    if (error.status === 403) {
      console.error('❌ GitHub API权限错误 (403):', {
        message: error.message,
        documentation_url: error.response?.data?.documentation_url,
        repo: `${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`
      });
      throw new Error(`GitHub权限不足：请检查Personal Access Token权限`);
    } else if (error.status === 401) {
      console.error('❌ GitHub API认证错误 (401):', error.message);
      throw new Error(`GitHub认证失败：请检查Personal Access Token是否有效`);
    } else if (error.status === 404) {
      console.error('❌ GitHub仓库不存在 (404):', `${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`);
      throw new Error(`GitHub仓库不存在或无权访问：${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`);
    } else {
      console.error('❌ 更新GitHub CSV文件失败:', {
        status: error.status,
        message: error.message,
        response: error.response?.data
      });
      throw new Error(`GitHub API错误 ${error.status || 'unknown'}: ${error.message}`);
    }
  }
}

// 执行同步任务
async function syncData() {
  try {
    console.log('\n🚀 开始执行飞书数据同步任务...');
    console.log(`⏰ 同步时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Jakarta' })}`);
    
    // 获取飞书数据
    const data = await getFeishuData();
    
    if (data.length === 0) {
      console.log('📝 今天没有送货数据，清空地图标记');
      const emptyCSV = 'shop_code,latitude,longitude,outlet_name,phoneNumber,kantong,orderType,totalDUS,finalPrice,gudangOut';
      await updateGitHubCSV(emptyCSV);
    } else {
      // 生成CSV
      const csvContent = generateCSV(data);
      
      // 更新GitHub
      await updateGitHubCSV(csvContent);
    }
    
    console.log('🎉 数据同步完成！');
    console.log('=' .repeat(60));
    
  } catch (error) {
    console.error('❌ 数据同步失败:', error.message);
    console.log('=' .repeat(60));
  }
}

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        timezone: 'Asia/Jakarta',
        version: '2.2.0', // 方案B枚举优化版本
        git_commit: 'method_b_optimization', // 方案B优化提交
        features: ['error_handling', 'diagnostics', 'method_b_route_optimization', 'smart_enumeration'] // 添加功能列表
    });
});

// 手动同步端点
app.post('/sync', async (req, res) => {
  try {
    await syncData();
    res.json({ success: true, message: '数据同步完成' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 调试字段结构端点
app.post('/debug-fields', async (req, res) => {
  try {
    const token = await getFeishuAccessToken();
    const todayDate = getTodayDateString();
    
    console.log(`📅 调试今天的字段结构: ${todayDate}`);
    
    // 获取前10条记录
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_ID}/records`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params: { page_size: 100 }
    });

    if (response.data.code === 0) {
      const records = response.data.data.items || [];
      
      // 过滤今天的记录
      const todayRecords = records.filter(record => {
        const tanggalKirim = record.fields['Tanggal Kirim EsKrim'];
        if (!tanggalKirim) return false;
        
        let recordDate = new Date(tanggalKirim);
        if (typeof tanggalKirim === 'number') {
          const jakartaDateString = recordDate.toLocaleDateString("en-CA", {timeZone: "Asia/Jakarta"});
          recordDate = new Date(jakartaDateString);
        }
        
        const recordDateString = `${recordDate.getFullYear()}/${String(recordDate.getMonth() + 1).padStart(2, '0')}/${String(recordDate.getDate()).padStart(2, '0')}`;
        return recordDateString === todayDate;
      });

      console.log(`找到 ${todayRecords.length} 条今天的记录`);
      
      // 显示字段结构
      const fieldInfo = todayRecords.map((record, index) => {
        const fields = record.fields;
        return {
          recordIndex: index + 1,
          outletCode: fields['Outlet Code'],
          allFieldNames: Object.keys(fields),
          latitudeField: {
            value: fields['latitude'],
            type: typeof fields['latitude']
          },
          longitudeField: {
            value: fields['longitude'], 
            type: typeof fields['longitude']
          },
          // 检查可能的其他坐标字段名
          possibleLatFields: Object.keys(fields).filter(key => 
            key.toLowerCase().includes('lat') || 
            key.toLowerCase().includes('纬度')
          ),
          possibleLngFields: Object.keys(fields).filter(key => 
            key.toLowerCase().includes('lng') || 
            key.toLowerCase().includes('long') ||
            key.toLowerCase().includes('经度')
          )
        };
      });
      
      res.json({
        success: true,
        todayDate: todayDate,
        recordCount: todayRecords.length,
        fieldInfo: fieldInfo
      });
    } else {
      throw new Error(`获取数据失败: ${response.data.msg}`);
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 调试同步端点 - 返回详细的执行过程
app.post('/debug-sync', async (req, res) => {
  const logs = [];
  const originalLog = console.log;
  const originalError = console.error;
  
  // 捕获所有日志输出
  console.log = (...args) => {
    const message = args.join(' ');
    logs.push({ type: 'info', message, timestamp: new Date().toISOString() });
    originalLog(...args);
  };
  
  console.error = (...args) => {
    const message = args.join(' ');
    logs.push({ type: 'error', message, timestamp: new Date().toISOString() });
    originalError(...args);
  };
  
  try {
    // 检查环境变量
    logs.push({ 
      type: 'info', 
      message: `环境变量检查: FEISHU_APP_ID=${FEISHU_APP_ID ? '已设置' : '未设置'}`, 
      timestamp: new Date().toISOString() 
    });
    logs.push({ 
      type: 'info', 
      message: `环境变量检查: FEISHU_APP_SECRET=${FEISHU_APP_SECRET ? '已设置' : '未设置'}`, 
      timestamp: new Date().toISOString() 
    });
    logs.push({ 
      type: 'info', 
      message: `环境变量检查: FEISHU_APP_TOKEN=${FEISHU_APP_TOKEN ? '已设置' : '未设置'}`, 
      timestamp: new Date().toISOString() 
    });
    logs.push({ 
      type: 'info', 
      message: `环境变量检查: FEISHU_TABLE_ID=${FEISHU_TABLE_ID ? '已设置' : '未设置'}`, 
      timestamp: new Date().toISOString() 
    });
    logs.push({ 
      type: 'info', 
      message: `环境变量检查: GITHUB_TOKEN=${GITHUB_TOKEN ? '已设置' : '未设置'}`, 
      timestamp: new Date().toISOString() 
    });
    
    await syncData();
    
    // 恢复原始的日志函数
    console.log = originalLog;
    console.error = originalError;
    
    res.json({ 
      success: true, 
      message: '调试同步完成',
      logs: logs
    });
  } catch (error) {
    // 恢复原始的日志函数
    console.log = originalLog;
    console.error = originalError;
    
    logs.push({ 
      type: 'error', 
      message: `同步失败: ${error.message}`, 
      timestamp: new Date().toISOString() 
    });
    
    res.status(500).json({ 
      success: false, 
      error: error.message,
      logs: logs
    });
  }
});

// 显示所有字段名称的调试端点
app.get('/debug-all-fields', async (req, res) => {
  try {
    const token = await getFeishuAccessToken();
    
    console.log('🔍 获取字段列表...');
    
    // 获取第一条记录查看所有字段
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_ID}/records`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params: { page_size: 1 }
    });

    if (response.data.code === 0) {
      const records = response.data.data.items || [];
      if (records.length > 0) {
        const firstRecord = records[0];
        const fieldNames = Object.keys(firstRecord.fields);
        
        console.log('📋 所有可用字段名称:');
        fieldNames.forEach((fieldName, index) => {
          console.log(`  ${index + 1}. "${fieldName}" = "${firstRecord.fields[fieldName]}"`);
        });
        
        res.json({
          success: true,
          totalFields: fieldNames.length,
          fieldNames: fieldNames,
          sampleRecord: firstRecord.fields
        });
      } else {
        res.json({ success: false, message: '没有找到记录' });
      }
    } else {
      res.json({ success: false, message: '获取数据失败', error: response.data });
    }
  } catch (error) {
    console.error('❌ 获取字段列表失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 服务信息端点
app.get('/', (req, res) => {
  const now = new Date();
  const jakartaTime = now.toLocaleString('zh-CN', { timeZone: 'Asia/Jakarta' });
  
  res.json({
    service: '印尼送货数据同步服务',
    status: 'running',
    currentTime: jakartaTime,
    timezone: 'Asia/Jakarta (UTC+7)',
    schedule: '每日 09:00 和 14:00 自动同步',
    lastSync: '查看日志了解详情',
    endpoints: {
      health: '/health',
      manualSync: 'POST /sync'
    }
  });
});

// 设置定时任务 - 每日09:00和14:00 (Jakarta时间)
cron.schedule('0 9 * * *', syncData, {
  timezone: 'Asia/Jakarta'
});

cron.schedule('0 14 * * *', syncData, {
  timezone: 'Asia/Jakarta'
});

console.log('🌟 印尼送货数据同步服务启动中...');
console.log('📅 定时同步: 每日 09:00 和 14:00 (Jakarta时间)');
console.log('🔗 手动同步: POST /sync');
console.log('❤️ 健康检查: GET /health');

// 路线优化API端点
app.post('/api/calculate-routes', async (req, res) => {
  try {
    if (!routeOptimizer) {
      return res.status(500).json({ 
        success: false, 
        error: 'Google Maps API密钥未配置，路线优化功能不可用'
      });
    }

    console.log('🚀 开始计算路线优化...');
    
    // 获取今天的飞书数据
    const allOrders = await getFeishuData();
    
    // 过滤掉已到店的订单（Outlet IN = ✅）
    const activeOrders = allOrders.filter(order => {
      // 优先从order.outletIn获取，如果没有则从fields获取（兼容性）
      const outletIn = order.outletIn || (order.fields ? order.fields['Outlet IN'] : null);
      return outletIn !== '✅';
    });

    const excludedOrders = allOrders.filter(order => {
      // 优先从order.outletIn获取，如果没有则从fields获取（兼容性）
      const outletIn = order.outletIn || (order.fields ? order.fields['Outlet IN'] : null);
      return outletIn === '✅';
    });

    console.log(`📦 总订单数: ${allOrders.length}`);
    console.log(`🔄 参与路线计算: ${activeOrders.length} 个订单`);
    console.log(`⚫ 已到店(跳过): ${excludedOrders.length} 个订单`);

    if (activeOrders.length === 0) {
      return res.json({
        success: true,
        message: '没有需要优化的订单',
        active_orders: 0,
        excluded_orders: excludedOrders.length,
        routes: [],
        excluded_points: excludedOrders
      });
    }

    // 转换数据格式以兼容路线优化器
    const optimizerInput = activeOrders.map(order => ({
      shop_code: order.shop_code,
      outlet_name: order.outlet_name,
      latitude: order.latitude,
      longitude: order.longitude,
      totalDUS: order.totalDUS,
      phoneNumber: order.phoneNumber || '',
      kantong: order.kantong || '',
      orderType: order.orderType || '',
      finalPrice: order.finalPrice || '',
      fields: order.fields || {}
    }));

    // 执行路线优化
    const optimizationResult = await routeOptimizer.optimizeAllRoutes(optimizerInput);

    if (optimizationResult.error) {
      return res.status(500).json({
        success: false,
        error: optimizationResult.error
      });
    }

    // 返回结果
    res.json({
      success: true,
      active_orders: activeOrders.length,
      excluded_orders: excludedOrders.length,
      optimization_result: optimizationResult,
      excluded_points: excludedOrders,
      calculation_time: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 路线计算失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取订单状态API（用于前端显示）
app.get('/api/order-status', async (req, res) => {
  try {
    console.log('📊 获取订单状态统计...');
    
    // 获取今天的飞书数据
    const allOrders = await getFeishuData();
    
    // 分类统计
    const activeOrders = allOrders.filter(order => {
      // 优先从order.outletIn获取，如果没有则从fields获取（兼容性）
      const outletIn = order.outletIn || (order.fields ? order.fields['Outlet IN'] : null);
      return outletIn !== '✅';
    });

    const excludedOrders = allOrders.filter(order => {
      // 优先从order.outletIn获取，如果没有则从fields获取（兼容性）
      const outletIn = order.outletIn || (order.fields ? order.fields['Outlet IN'] : null);
      return outletIn === '✅';
    });

    const activeTotal = activeOrders.reduce((sum, order) => sum + (parseInt(order.totalDUS) || 0), 0);
    const excludedTotal = excludedOrders.reduce((sum, order) => sum + (parseInt(order.totalDUS) || 0), 0);

    res.json({
      success: true,
      date: getTodayDateString(),
      total_orders: allOrders.length,
      active_orders: {
        count: activeOrders.length,
        total_dus: activeTotal
      },
      excluded_orders: {
        count: excludedOrders.length,
        total_dus: excludedTotal
      },
      last_update: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 获取订单状态失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 测试路线优化API（使用示例数据）
app.post('/api/test-route-optimization', async (req, res) => {
  try {
    if (!routeOptimizer) {
      return res.status(500).json({ 
        success: false, 
        error: 'Google Maps API密钥未配置，路线优化功能不可用'
      });
    }

    console.log('🧪 测试路线优化功能...');

    // 使用示例数据
    const testOrders = [
      {
        shop_code: 'TEST001',
        outlet_name: 'Ibu Sri Utami',
        latitude: -6.121566354,
        longitude: 106.919700019061577,
        totalDUS: 17,
        phoneNumber: '0812345678',
        kantong: 'A',
        orderType: 'reguler',
        finalPrice: '85000'
      },
      {
        shop_code: 'TEST002',
        outlet_name: 'Ibu Murniati',
        latitude: -6.124966993,
        longitude: 106.951539851725251,
        totalDUS: 4,
        phoneNumber: '0823456789',
        kantong: 'B',
        orderType: 'reguler',
        finalPrice: '20000'
      },
      {
        shop_code: 'TEST003',
        outlet_name: 'Bapak Supriadi',
        latitude: -6.108881024,
        longitude: 106.937086433172223,
        totalDUS: 5,
        phoneNumber: '0834567890',
        kantong: 'A',
        orderType: 'express',
        finalPrice: '25000'
      }
    ];

    const optimizationResult = await routeOptimizer.optimizeAllRoutes(testOrders);

    res.json({
      success: true,
      test_data: true,
      input_orders: testOrders.length,
      optimization_result: optimizationResult,
      test_time: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 测试路线优化失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 方案B路线优化API端点
app.post('/api/optimize-routes', async (req, res) => {
  try {
    console.log('🚀 开始方案B路线优化...');
    
    if (!routeOptimizer) {
      return res.status(503).json({
        success: false,
        error: 'Google Maps API未配置，路线优化服务不可用'
      });
    }
    
    // 从飞书获取今天的订单数据
    console.log('📦 获取飞书订单数据...');
    const feishuData = await getFeishuData();
    
    if (!feishuData || feishuData.length === 0) {
      return res.json({
        success: true,
        message: '今天没有待优化的订单',
        batches: [],
        total_distance: 0,
        total_duration: 0
      });
    }
    
    // 过滤掉已到店的订单（Outlet IN = ✅）
    const activeOrders = feishuData.filter(order => {
      const outletIn = order.outletIn || (order.fields ? order.fields['Outlet IN'] : null);
      return outletIn !== '✅';
    });
    
    console.log(`📦 总订单数: ${feishuData.length}`);
    console.log(`🔄 参与路线计算: ${activeOrders.length} 个订单`);
    console.log(`⚫ 已到店(跳过): ${feishuData.length - activeOrders.length} 个订单`);
    
    // 转换数据格式
    const orders = activeOrders.map(item => ({
      id: item.shop_code || 'unknown',
      name: item.outlet_name || 'unknown',
      lat: parseFloat(item.latitude),
      lng: parseFloat(item.longitude),
      dus_count: parseInt(item.totalDUS) || 1,
      phone: item.phoneNumber || '',
      address: item.outlet_name || '',
      kantong: item.kantong || '',
      orderType: item.orderType || '',
      finalPrice: item.finalPrice || ''
    })).filter(order => 
      !isNaN(order.lat) && 
      !isNaN(order.lng) && 
      order.lat !== 0 && 
      order.lng !== 0
    );
    
    console.log(`📊 有效订单数: ${orders.length}`);
    
    if (orders.length === 0) {
      return res.json({
        success: true,
        message: '没有有效的地理位置信息',
        batches: [],
        total_distance: 0,
        total_duration: 0
      });
    }
    
    // 执行方案B路线优化
    const startTime = Date.now();
    const result = await routeOptimizer.optimizeAllRoutes(orders);
    const endTime = Date.now();
    
    console.log(`✅ 方案B优化完成，耗时: ${endTime - startTime}ms`);
    
    // 格式化响应以匹配前端期望的数据结构
    const response = {
      success: true,
      algorithm: 'Method B - Enumerative Optimization',
      version: '2.2.0',
      optimization_time_ms: endTime - startTime,
      active_orders: orders.length,
      excluded_orders: feishuData.length - activeOrders.length,
      optimization_result: result.error ? null : {
        batches: result.batches || [],
        total_distance: result.total_distance || 0,
        total_duration: result.total_duration || 0,
        statistics: result.statistics || {}
      },
      excluded_points: feishuData.filter(order => {
        const outletIn = order.outletIn || (order.fields ? order.fields['Outlet IN'] : null);
        return outletIn === '✅';
      }),
      calculation_time: new Date().toISOString(),
      error: result.error || null,
      api_usage: result.api_usage
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ 方案B路线优化失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// API使用统计端点
app.get('/api/route-stats', (req, res) => {
  try {
    if (!routeOptimizer) {
      return res.status(503).json({
        success: false,
        error: '路线优化器未初始化'
      });
    }
    
    const stats = routeOptimizer.getApiUsageStats();
    
    res.json({
      success: true,
      api_usage: stats,
      algorithm: 'Method B - Enumerative Optimization',
      version: '2.2.0',
      features: [
        'smart_enumeration',
        'geographic_clustering', 
        'boundary_optimization',
        'capacity_balancing'
      ],
      performance: {
        expected_improvement: '22% distance reduction',
        additional_api_cost: '$0.00',
        optimization_strategies: 4,
        capacity_test_range: '30%-70%'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ 获取路线统计失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 更新环境变量配置信息
app.get('/api/config-status', (req, res) => {
  res.json({
    feishu_configured: !!(FEISHU_APP_ID && FEISHU_APP_SECRET && FEISHU_APP_TOKEN && FEISHU_TABLE_ID),
    feishu_details: {
      app_id_set: !!FEISHU_APP_ID,
      app_secret_set: !!FEISHU_APP_SECRET,
      app_token_set: !!FEISHU_APP_TOKEN,
      table_id_set: !!FEISHU_TABLE_ID
    },
    github_configured: !!(GITHUB_TOKEN && GITHUB_REPO_OWNER && GITHUB_REPO_NAME),
    github_details: {
      token_set: !!GITHUB_TOKEN,
      repo_owner_set: !!GITHUB_REPO_OWNER,
      repo_name_set: !!GITHUB_REPO_NAME,
      repo_path: GITHUB_REPO_OWNER && GITHUB_REPO_NAME ? `${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}` : 'not_configured'
    },
    google_maps_configured: !!GOOGLE_MAPS_API_KEY,
    route_optimizer_ready: !!routeOptimizer,
    environment: process.env.NODE_ENV || 'development',
    node_version: process.version,
    timestamp: new Date().toISOString()
  });
});

// 新增：API连接测试端点
app.post('/api/test-connections', async (req, res) => {
  const results = {
    feishu: { status: 'not_tested', message: '', details: null },
    github: { status: 'not_tested', message: '', details: null },
    google_maps: { status: 'not_tested', message: '', details: null }
  };

  // 测试飞书API连接
  try {
    if (FEISHU_APP_ID && FEISHU_APP_SECRET) {
      console.log('🧪 测试飞书API连接...');
      const token = await getFeishuAccessToken();
      results.feishu = {
        status: 'success',
        message: '飞书API连接成功',
        details: { token_obtained: !!token }
      };
    } else {
      results.feishu = {
        status: 'failed',
        message: '飞书API配置不完整',
        details: null
      };
    }
  } catch (error) {
    results.feishu = {
      status: 'failed',
      message: error.message,
      details: { error_type: error.constructor.name }
    };
  }

  // 测试GitHub API连接
  try {
    if (GITHUB_TOKEN && GITHUB_REPO_OWNER && GITHUB_REPO_NAME) {
      console.log('🧪 测试GitHub API连接...');
      const { data: repo } = await octokit.rest.repos.get({
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_REPO_NAME
      });
      results.github = {
        status: 'success',
        message: 'GitHub API连接成功',
        details: { 
          repo_accessible: true,
          repo_name: repo.full_name,
          permissions: repo.permissions
        }
      };
    } else {
      results.github = {
        status: 'failed',
        message: 'GitHub API配置不完整',
        details: null
      };
    }
  } catch (error) {
    results.github = {
      status: 'failed',
      message: `GitHub API错误 ${error.status || 'unknown'}: ${error.message}`,
      details: { 
        error_type: error.constructor.name,
        status_code: error.status
      }
    };
  }

  // 测试Google Maps API（如果已配置）
  try {
    if (routeOptimizer && GOOGLE_MAPS_API_KEY) {
      console.log('🧪 测试Google Maps API连接...');
      // 简单的距离查询测试
      const testResult = await routeOptimizer.getDistance(
        { lat: -6.1, lng: 106.8 },
        { lat: -6.2, lng: 106.9 }
      );
      results.google_maps = {
        status: 'success',
        message: 'Google Maps API连接成功',
        details: { test_distance: testResult }
      };
    } else {
      results.google_maps = {
        status: 'skipped',
        message: 'Google Maps API未配置或路线优化器未初始化',
        details: null
      };
    }
  } catch (error) {
    results.google_maps = {
      status: 'failed',
      message: error.message,
      details: { error_type: error.constructor.name }
    };
  }

  res.json({
    success: true,
    test_results: results,
    summary: {
      total_tests: Object.keys(results).length,
      passed: Object.values(results).filter(r => r.status === 'success').length,
      failed: Object.values(results).filter(r => r.status === 'failed').length,
      skipped: Object.values(results).filter(r => r.status === 'skipped').length
    },
    timestamp: new Date().toISOString()
  });
});

// Google Maps API诊断端点
app.post('/api/google-maps-diagnostic', async (req, res) => {
  try {
    console.log('🔍 开始Google Maps API诊断...');
    
    if (!GOOGLE_MAPS_API_KEY) {
      return res.status(503).json({
        success: false,
        error: 'Google Maps API密钥未配置',
        recommendations: [
          '在Render环境变量中设置GOOGLE_MAPS_API_KEY',
          '确保API密钥有效且已启用必要服务'
        ]
      });
    }

    // 导入诊断工具
    const GoogleMapsApiDiagnostic = require('./google-maps-diagnostic');
    const diagnostic = new GoogleMapsApiDiagnostic(GOOGLE_MAPS_API_KEY);
    
    // 运行完整诊断
    const results = await diagnostic.runDiagnostic();
    
    // 测试特定路线
    await diagnostic.testSpecificRoute();
    
    // 返回诊断结果
    res.json({
      success: true,
      diagnostic_results: results,
      api_key_configured: true,
      api_key_format: GOOGLE_MAPS_API_KEY.startsWith('AIza') ? 'valid' : 'invalid',
      timestamp: new Date().toISOString(),
      next_steps: results.recommendations
    });
    
  } catch (error) {
    console.error('❌ Google Maps API诊断失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      diagnostic_failed: true,
      recommendations: [
        '检查API密钥配置',
        '验证网络连接',
        '确认API服务可用性'
      ]
    });
  }
});

// API修复建议端点
app.get('/api/google-maps-fix-guide', (req, res) => {
  res.json({
    success: true,
    common_403_fixes: [
      {
        issue: 'Distance Matrix API未启用',
        solution: '访问 Google Cloud Console > APIs & Services > Library，搜索并启用 Distance Matrix API',
        url: 'https://console.cloud.google.com/apis/library/distance-matrix-backend.googleapis.com'
      },
      {
        issue: 'API密钥权限限制',
        solution: '在 Google Cloud Console > APIs & Services > Credentials 中检查API密钥限制设置',
        url: 'https://console.cloud.google.com/apis/credentials'
      },
      {
        issue: '免费配额用完',
        solution: '启用计费账户或等待配额重置（每月2500次免费调用）',
        url: 'https://console.cloud.google.com/billing'
      },
      {
        issue: 'API密钥域名限制',
        solution: '在API密钥设置中添加 *.onrender.com 到允许的域名列表，或移除域名限制',
        note: 'Render服务器IP是动态的，建议使用无限制的API密钥'
      }
    ],
    backup_solution: {
      description: '系统已实现直线距离备用方案',
      accuracy: '约为实际道路距离的70-80%',
      cost: '完全免费',
      recommendation: '对于路线优化仍然有效，只是精度略低'
    },
    status_check: {
      health_endpoint: '/health',
      diagnostic_endpoint: '/api/google-maps-diagnostic',
      stats_endpoint: '/api/route-stats'
    }
  });
});

// 服务信息端点
app.get('/', (req, res) => {
  const now = new Date();
  const jakartaTime = now.toLocaleString('zh-CN', { timeZone: 'Asia/Jakarta' });
  
  res.json({
    service: '印尼送货数据同步服务 + 方案B路线优化',
    version: '2.2.0',
    algorithm: 'Method B - Enumerative Optimization',
    status: 'running',
    currentTime: jakartaTime,
    timezone: 'Asia/Jakarta (UTC+7)',
    schedule: '每日 09:00 和 14:00 自动同步',
    lastSync: '查看日志了解详情',
    features: {
      data_sync: '飞书数据同步',
      route_optimization: routeOptimizer ? 'Routes API可视化优化已启用' : '路线优化未配置',
      smart_enumeration: '智能枚举分批',
      geographic_clustering: '地理聚类',
      boundary_optimization: '边界优化',
      capacity_balancing: '容量均衡'
    },
    performance: {
      expected_improvement: '22% distance reduction',
      additional_cost: '$0.00'
    },
    endpoints: {
      health: '/health',
      manualSync: 'POST /sync',
      optimizeRoutes: 'POST /api/optimize-routes',
      routeStats: 'GET /api/route-stats', 
      calculateRoutes: 'POST /api/calculate-routes',
      orderStatus: 'GET /api/order-status',
      testRoutes: 'POST /api/test-route-optimization',
      configStatus: 'GET /api/config-status'
    }
  });
});

// 设置定时任务 - 每日09:00和14:00 (Jakarta时间)
cron.schedule('0 9 * * *', syncData, {
  timezone: 'Asia/Jakarta'
});

cron.schedule('0 14 * * *', syncData, {
  timezone: 'Asia/Jakarta'
});

console.log('🌟 印尼送货数据同步服务启动中...');
console.log('🔗 手动同步: POST /sync');
console.log('🚛 路线优化: POST /api/calculate-routes');
console.log('❤️ 健康检查: GET /health');

// Routes API可视化功能直接测试端点
app.post('/api/test-routes-visual', async (req, res) => {
  try {
    if (!routeOptimizer) {
      return res.status(500).json({ error: 'Routes API可视化优化器未初始化' });
    }

    console.log('🗺️ 开始Routes API可视化功能测试...');

    // 从请求体获取订单数据，如果没有则使用默认测试数据
    const inputOrders = req.body && req.body.length > 0 ? req.body : [
      {
        id: 'VISUAL001',
        name: '雅加达北区配送点',
        lat: -6.1086,
        lng: 106.8456,
        dus_count: 12,
        address: 'Jl. Kemang Raya No.123, Jakarta Utara'
      },
      {
        id: 'VISUAL002', 
        name: '雅加达中央区配送点',
        lat: -6.1164,
        lng: 106.9134,
        dus_count: 8,
        address: 'Jl. Sudirman No.456, Jakarta Pusat'
      },
      {
        id: 'VISUAL003',
        name: '雅加达南区配送点', 
        lat: -6.1304,
        lng: 106.8827,
        dus_count: 15,
        address: 'Jl. Gatot Subroto No.789, Jakarta Selatan'
      },
      {
        id: 'VISUAL004',
        name: '雅加达西区配送点',
        lat: -6.1289,
        lng: 106.8067,
        dus_count: 6,
        address: 'Jl. Panjang No.321, Jakarta Barat'
      },
      {
        id: 'VISUAL005',
        name: '雅加达东区配送点',
        lat: -6.1127,
        lng: 106.9457,
        dus_count: 10,
        address: 'Jl. Raya Bekasi No.654, Jakarta Timur'
      }
    ];

    console.log(`🚛 Routes API可视化测试: ${inputOrders.length} 个订单`);

    const startTime = Date.now();
    const visualResult = await routeOptimizer.optimizeAllRoutes(inputOrders);
    const endTime = Date.now();
    const executionTime = endTime - startTime;

    console.log(`✅ Routes API可视化测试完成，耗时: ${executionTime}ms`);

    // 统计可视化数据
    let totalPolylines = 0;
    let routesWithPolylines = 0;
    
    if (visualResult.batches) {
      visualResult.batches.forEach(batch => {
        if (batch.route_polylines) {
          totalPolylines += batch.route_polylines.length;
          routesWithPolylines += batch.route_polylines.filter(p => p.polyline).length;
        }
      });
    }

    const response = {
      success: true,
      api_type: 'Routes API可视化优化',
      execution_time_ms: executionTime,
      test_summary: {
        input_orders: inputOrders.length,
        output_batches: visualResult.batches ? visualResult.batches.length : 0,
        total_route_segments: totalPolylines,
        polylines_generated: routesWithPolylines,
        visualization_ready: visualResult.visualization_ready || false
      },
      optimization_result: visualResult,
      api_usage: visualResult.api_usage || {},
      timestamp: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    console.error('❌ Routes API可视化测试失败:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      api_type: 'Routes API可视化优化',
      stack: error.stack
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 服务运行在端口 ${PORT}`);
  console.log(`🌍 服务地址: https://feishu-delivery-sync.onrender.com`);
  console.log('/' .repeat(60));
}); 

// 版本更新: 添加Routes API可视化功能 - v2.3.0