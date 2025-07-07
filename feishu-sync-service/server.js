const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const { Octokit } = require('@octokit/rest');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件配置
app.use(cors());
app.use(express.json());

// 飞书API配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const FEISHU_APP_TOKEN = process.env.FEISHU_APP_TOKEN;
const FEISHU_TABLE_ID = process.env.FEISHU_TABLE_ID;

// GitHub配置
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME;

const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

let accessToken = null;
let tokenExpiry = 0;

// 获取飞书访问令牌
async function getFeishuAccessToken() {
  try {
    if (accessToken && Date.now() < tokenExpiry) {
      return accessToken;
    }

    console.log('🔑 获取飞书访问令牌...');
    const response = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET
    });

    if (response.data.code === 0) {
      accessToken = response.data.tenant_access_token;
      tokenExpiry = Date.now() + (response.data.expire - 300) * 1000; // 提前5分钟刷新
      console.log('✅ 飞书访问令牌获取成功');
      return accessToken;
    } else {
      throw new Error(`获取访问令牌失败: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('❌ 获取飞书访问令牌失败:', error.message);
    throw error;
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
        params
      });

      if (response.data.code === 0) {
        const records = response.data.data.items || [];
        allRecords = allRecords.concat(records);
        
        hasMore = response.data.data.has_more;
        pageToken = response.data.data.page_token;
        
        console.log(`📦 已获取 ${records.length} 条记录`);
      } else {
        throw new Error(`获取数据失败: ${response.data.msg}`);
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
      
      // 确保经纬度是数字
      const latitude = parseFloat(fields['latitude']) || 0;
      const longitude = parseFloat(fields['longitude']) || 0;
      
      // 如果经纬度无效，跳过此记录
      if (latitude === 0 || longitude === 0) {
        console.log(`⚠️ 跳过无效坐标的记录: ${fields['Outlet Code']}`);
        return null;
      }

      return {
        shop_code: fields['Outlet Code'] || '',
        latitude: latitude,
        longitude: longitude,
        outlet_name: fields['Nama Pemilik'] || '',
        phoneNumber: fields['No Telepon Pemilik'] || '',
        kantong: fields['Kantong'] || '',
        orderType: fields['Order Type'] || '',
        totalDUS: fields['Total DUS'] || '',
        finalPrice: fields['Final Price IDR'] || ''
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
  const headers = 'shop_code,latitude,longitude,outlet_name,phoneNumber,kantong,orderType,totalDUS,finalPrice';
  const rows = data.map(item => 
    `${item.shop_code},${item.latitude},${item.longitude},"${item.outlet_name}","${item.phoneNumber}","${item.kantong}","${item.orderType}","${item.totalDUS}","${item.finalPrice}"`
  );
  return [headers, ...rows].join('\n');
}

// 更新GitHub仓库中的CSV文件
async function updateGitHubCSV(csvContent) {
  try {
    console.log('📤 更新GitHub仓库中的CSV文件...');
    
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
      // 如果文件不存在，sha保持为null
      console.log('📝 文件不存在，将创建新文件');
    }

    const today = getTodayDateString();
    const message = `🚚 更新送货数据 - ${today}`;

    // 更新或创建文件
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: GITHUB_REPO_OWNER,
      repo: GITHUB_REPO_NAME,
      path: 'public/markers.csv',
      message: message,
      content: Buffer.from(csvContent).toString('base64'),
      sha: sha, // 如果文件存在则提供SHA，不存在则为null
    });

    console.log('✅ GitHub CSV文件更新成功');
  } catch (error) {
    console.error('❌ 更新GitHub CSV文件失败:', error.message);
    throw error;
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
      const emptyCSV = 'shop_code,latitude,longitude,outlet_name,phoneNumber,kantong,orderType,totalDUS,finalPrice';
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
    timezone: 'Asia/Jakarta'
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

app.listen(PORT, () => {
  console.log(`🚀 服务运行在端口 ${PORT}`);
  console.log(`🌍 服务地址: https://feishu-delivery-sync.onrender.com`);
  console.log('/' .repeat(60));
}); 

// 版本更新: 添加手动刷新API支持 - v1.1.0 