import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Marker, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';
import L from 'leaflet';

// 修复leaflet图标问题
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// 创建总部自定义图标
const headquartersIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" width="60" height="60">
      <defs>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="2" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.4)"/>
        </filter>
      </defs>
      <polygon points="30,5 38,22 57,22 43,34 50,52 30,40 10,52 17,34 3,22 22,22" 
               fill="#FF8C00" 
               stroke="#FFFFFF" 
               stroke-width="3" 
               filter="url(#shadow)"/>
      <polygon points="30,10 36,24 50,24 39,33 44,48 30,37 16,48 21,33 10,24 24,24" 
               fill="#FFD700" 
               stroke="#FFFFFF" 
               stroke-width="2"/>
    </svg>
  `),
  iconSize: [60, 60],
  iconAnchor: [30, 30],
  popupAnchor: [0, -30],
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
  shadowSize: [60, 60],
  shadowAnchor: [20, 30]
});

interface MarkerData {
  shop_code: string;
  latitude: number;
  longitude: number;
  outlet_name: string;
  phoneNumber: string;
  kantong: string;
  orderType: string;
  totalDUS: string;
  finalPrice: string;
  fields?: any;
}

interface LoginFormProps {
  onLogin: () => void;
}

interface OptimizedBatch {
  batch_number: number;
  route: Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    dus_count: number;
    phone: string;
    address: string;
  }>;
  total_distance: number;
  total_duration: number;
  capacity_used: number;
}

interface OptimizationResult {
  success: boolean;
  active_orders: number;
  excluded_orders: number;
  optimization_result?: {
    batches: OptimizedBatch[];
    total_distance: number;
    total_duration: number;
    statistics: any;
  };
  excluded_points?: MarkerData[];
  calculation_time?: string;
  error?: string;
}

// 统一使用鲜艳的红色标记
const MARKER_COLOR = '#FF0000';  // 鲜艳的红色
const EXCLUDED_MARKER_COLOR = '#999999';  // 灰色（已出库）

// 路线颜色配置
const ROUTE_COLORS = [
  '#FF0000', // 红色
  '#0066FF', // 蓝色
  '#00AA00', // 绿色
  '#FF8800', // 橙色
  '#8800FF', // 紫色
  '#00AAAA', // 青色
];

// 总部坐标（固定不变）
const HEADQUARTERS_POSITION: [number, number] = [-6.11258762834466, 106.91732818555802];

// 地图图层配置
const MAP_LAYERS = {
  street: {
    name: '标准地图',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  satellite: {
    name: '卫星视图',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics'
  }
};

type MapLayerType = keyof typeof MAP_LAYERS;

// 路线优化控制面板组件
const RouteOptimizationPanel: React.FC<{
  onCalculateRoutes: () => void;
  isCalculating: boolean;
  routeData: OptimizationResult | null;
  onClearRoutes: () => void;
}> = ({ onCalculateRoutes, isCalculating, routeData, onClearRoutes }) => {
  return (
    <div className="route-optimization-panel">
      <div className="panel-header">
        <h3>🚛 路线优化</h3>
      </div>
      
      <div className="panel-actions">
        <button
          onClick={onCalculateRoutes}
          disabled={isCalculating}
          className={`btn btn-primary ${isCalculating ? 'calculating' : ''}`}
          title="计算最优送货路线"
        >
          {isCalculating ? '计算中...' : '🧮 计算路线'}
        </button>
        
        {routeData && (
          <button
            onClick={onClearRoutes}
            className="btn btn-outline-primary btn-sm"
            title="清除路线显示"
          >
            🧹 清除路线
          </button>
        )}
      </div>

      {routeData && routeData.success && routeData.optimization_result && (
        <div className="route-summary">
          <h4>📊 路线统计</h4>
          <div className="summary-stats">
            <div className="stat-row">
              <span>参与计算:</span>
              <span>{routeData.active_orders} 个订单</span>
            </div>
            <div className="stat-row">
              <span>已出库:</span>
              <span>{routeData.excluded_orders} 个订单</span>
            </div>
            <div className="stat-row">
              <span>总距离:</span>
              <span>{routeData.optimization_result.total_distance.toFixed(1)} km</span>
            </div>
            <div className="stat-row">
              <span>总时间:</span>
              <span>{routeData.optimization_result.total_duration.toFixed(0)} 分钟</span>
            </div>
            <div className="stat-row">
              <span>批次数:</span>
              <span>{routeData.optimization_result.batches.length} 个</span>
            </div>
          </div>
          
          <div className="batch-legend">
            <h5>📋 批次图例</h5>
            {routeData.optimization_result.batches.map((batch, index) => (
              <div key={batch.batch_number} className="legend-item">
                <div 
                  className="color-indicator" 
                  style={{ backgroundColor: ROUTE_COLORS[index % ROUTE_COLORS.length] }}
                ></div>
                <span>批次{batch.batch_number}: {batch.route.length}站</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {routeData && !routeData.success && (
        <div className="error-message">
          <p>❌ {routeData.error}</p>
        </div>
      )}
    </div>
  );
};

// 总部标记组件
const HeadquartersMarker: React.FC = () => {
  return (
    <Marker 
      position={HEADQUARTERS_POSITION} 
      icon={headquartersIcon}
      zIndexOffset={1000}
    >
      <Popup>
        <div className="popup-content headquarters-popup">
          <h3>🏢 公司总部</h3>
          <p><strong>地址:</strong> 印度尼西亚雅加达</p>
          <p><strong>坐标:</strong> {HEADQUARTERS_POSITION[0].toFixed(6)}, {HEADQUARTERS_POSITION[1].toFixed(6)}</p>
          <p><strong>类型:</strong> 总部办公室</p>
        </div>
      </Popup>
    </Marker>
  );
};

// 路线显示组件
const RouteOverlay: React.FC<{ 
  routeData: OptimizationResult | null 
}> = ({ routeData }) => {
  if (!routeData || !routeData.success || !routeData.optimization_result) {
    return null;
  }

  const renderRouteLines = () => {
    return routeData.optimization_result!.batches.map((batch, batchIndex) => {
      const color = ROUTE_COLORS[batchIndex % ROUTE_COLORS.length];
      
      // 构建路线路径：总部 -> 各个订单点 -> 总部
      const routePath: [number, number][] = [HEADQUARTERS_POSITION];
      
      batch.route.forEach(order => {
        routePath.push([order.lat, order.lng]);
      });
      
      routePath.push(HEADQUARTERS_POSITION);

      return (
        <Polyline
          key={`route-${batch.batch_number}`}
          positions={routePath}
          pathOptions={{
            color: color,
            weight: 4,
            opacity: 0.8,
            dashArray: '10, 5'
          }}
        >
          <Popup>
            <div>
              <h4>批次 {batch.batch_number}</h4>
              <p>距离: {batch.total_distance.toFixed(1)} km</p>
              <p>时间: {batch.total_duration.toFixed(0)} 分钟</p>
              <p>货物: {batch.capacity_used} 件</p>
              <p>路线: {batch.route.length} 个地点</p>
            </div>
          </Popup>
        </Polyline>
      );
    });
  };

  return <>{renderRouteLines()}</>;
};

// 图层切换组件
const LayerControl: React.FC<{
  currentLayer: MapLayerType;
  onLayerChange: (layer: MapLayerType) => void;
}> = ({ currentLayer, onLayerChange }) => {
  return (
    <div className="layer-control">
      <button
        className={`layer-button ${currentLayer === 'street' ? 'active' : ''}`}
        onClick={() => onLayerChange('street')}
        title="标准地图"
      >
        🗺️
      </button>
      <button
        className={`layer-button ${currentLayer === 'satellite' ? 'active' : ''}`}
        onClick={() => onLayerChange('satellite')}
        title="卫星视图"
      >
        🛰️
      </button>
    </div>
  );
};

// 用户定位组件
const LocationMarker: React.FC = () => {
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const map = useMap();

  const startLocating = () => {
    setIsLocating(true);
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationError('您的浏览器不支持地理定位');
      setIsLocating(false);
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserPosition([latitude, longitude]);
        map.flyTo([latitude, longitude], map.getZoom());
        setIsLocating(false);
      },
      (error) => {
        console.error('定位错误:', error);
        let errorMessage = '无法获取位置';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = '请允许访问位置信息';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = '位置信息不可用';
            break;
          case error.TIMEOUT:
            errorMessage = '获取位置超时';
            break;
        }
        setLocationError(errorMessage);
        setIsLocating(false);
      },
      options
    );
  };

  useEffect(() => {
    return () => {
      if (userPosition) {
        setUserPosition(null);
      }
    };
  }, [userPosition]);

  return (
    <>
      <button 
        onClick={startLocating}
        className={`control-button location-button ${isLocating ? 'locating' : ''}`}
        disabled={isLocating}
        title={isLocating ? '正在定位...' : '获取我的位置'}
      >
        📍
      </button>
      {locationError && <div className="location-error">{locationError}</div>}

      {userPosition && (
        <CircleMarker
          center={userPosition}
          radius={10}
          pathOptions={{
            fillColor: '#3388ff',
            fillOpacity: 0.7,
            color: '#fff',
            weight: 3,
            opacity: 1
          }}
        >
          <Popup>
            <div>
              <h3>您的当前位置</h3>
              <p>纬度: {userPosition[0].toFixed(6)}</p>
              <p>经度: {userPosition[1].toFixed(6)}</p>
            </div>
          </Popup>
        </CircleMarker>
      )}
    </>
  );
};

// 登录凭据
const LOGIN_CREDENTIALS = {
  username: 'One Meter',
  password: 'prioritaspelayanan'
};

// 登录组件
const LoginForm: React.FC<LoginFormProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 800));

    if (username === LOGIN_CREDENTIALS.username && password === LOGIN_CREDENTIALS.password) {
      localStorage.setItem('isLoggedIn', 'true');
      onLogin();
    } else {
      setError('用户名或密码错误');
    }
    setIsLoading(false);
  };

  return (
    <div className="login-overlay">
      <div className="login-container">
        <div className="login-header">
          <h2>🗺️ Delivery Map System</h2>
          <p>请登录以访问地图系统</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">用户名:</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              required
              disabled={isLoading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">密码:</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
              disabled={isLoading}
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button 
            type="submit" 
            className={`login-btn ${isLoading ? 'loading' : ''}`}
            disabled={isLoading}
          >
            {isLoading ? '登录中...' : '登录'}
          </button>
        </form>
        <div className="login-footer">
          <p>🚚 印尼送货地图管理系统</p>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [markers, setMarkers] = useState<MarkerData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentLayer, setCurrentLayer] = useState<MapLayerType>('street');
  
  // 路线优化相关状态
  const [routeData, setRouteData] = useState<OptimizationResult | null>(null);
  const [isCalculatingRoutes, setIsCalculatingRoutes] = useState(false);
  
  // 手动更新相关状态
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [lastManualUpdate, setLastManualUpdate] = useState(0);

  // 加载CSV数据
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/markers.csv');
      if (!response.ok) {
        throw new Error(`加载数据失败: ${response.status}`);
      }
      
      const csvText = await response.text();
      const processedMarkers = parseCSV(csvText);
      setMarkers(processedMarkers);
    } catch (error) {
      console.error('加载数据失败:', error);
      setError('加载数据失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  }, []);

  // 计算路线优化
  const handleCalculateRoutes = async () => {
    setIsCalculatingRoutes(true);
    setRouteData(null);

    try {
      console.log('🚀 开始计算路线优化...');
      
      const response = await fetch('https://feishu-delivery-sync.onrender.com/api/calculate-routes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`路线计算失败: ${response.status}`);
      }

      const result: OptimizationResult = await response.json();
      setRouteData(result);

      if (result.success) {
        console.log('✅ 路线优化计算完成');
      } else {
        console.error('❌ 路线优化失败:', result.error);
      }

    } catch (error) {
      console.error('路线计算错误:', error);
      setRouteData({
        success: false,
        error: error instanceof Error ? error.message : '路线计算失败',
        active_orders: 0,
        excluded_orders: 0
      });
    } finally {
      setIsCalculatingRoutes(false);
    }
  };

  // 清除路线显示
  const handleClearRoutes = () => {
    setRouteData(null);
  };

  // 手动刷新数据
  const handleManualUpdate = async () => {
    const now = Date.now();
    const cooldownTime = 60000; // 1分钟冷却时间

    // 检查冷却时间
    if (now - lastManualUpdate < cooldownTime) {
      const remainingTime = Math.ceil((cooldownTime - (now - lastManualUpdate)) / 1000);
      setUpdateMessage(`请等待 ${remainingTime} 秒后再次刷新`);
      setTimeout(() => setUpdateMessage(null), 3000);
      return;
    }

    setIsUpdating(true);
    setUpdateMessage(null);

    try {
      // 1. 调用后端API触发飞书数据同步
      console.log('🔄 开始手动同步飞书数据...');
      const syncResponse = await fetch('https://feishu-delivery-sync.onrender.com/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!syncResponse.ok) {
        throw new Error(`同步API调用失败: ${syncResponse.status}`);
      }

      // 2. 等待GitHub更新（给一些时间让文件更新）
      console.log('⏳ 等待数据同步完成...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 3. 重新加载CSV数据
      console.log('📥 重新加载地图数据...');
      await loadData();

      // 4. 清除旧的路线数据（因为数据已更新）
      setRouteData(null);

      // 5. 更新状态
      setLastManualUpdate(now);
      setUpdateMessage('✅ 数据更新成功！');
      setTimeout(() => setUpdateMessage(null), 5000);

    } catch (error) {
      console.error('手动更新失败:', error);
      setUpdateMessage('❌ 更新失败，请稍后重试');
      setTimeout(() => setUpdateMessage(null), 5000);
    } finally {
      setIsUpdating(false);
    }
  };

  // 页面加载时获取数据
  useEffect(() => {
    loadData();
  }, [loadData]);

  // 检查登录状态
  useEffect(() => {
    const loginStatus = localStorage.getItem('isLoggedIn');
    setIsLoggedIn(loginStatus === 'true');
  }, []);

  // 登录处理
  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  // 登出处理
  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    setIsLoggedIn(false);
  };

  // 如果未登录，显示登录界面
  if (!isLoggedIn) {
    return <LoginForm onLogin={handleLogin} />;
  }

  // 切换地图图层
  const handleLayerChange = (layer: MapLayerType) => {
    setCurrentLayer(layer);
  };

  const currentLayerConfig = MAP_LAYERS[currentLayer];

  // 获取已出库订单（用于灰色显示）
  const getExcludedMarkers = (): MarkerData[] => {
    if (!routeData || !routeData.excluded_points) {
      return [];
    }
    return routeData.excluded_points;
  };

  return (
    <div className="App">
      <div className="map-container">
        {loading && (
          <div className="loading-overlay">
            <div className="loading-content">
              <div className="spinner"></div>
              <p>正在加载地图数据...</p>
            </div>
          </div>
        )}
        
        {error && (
          <div className="error-overlay">
            <div className="error-content">
              <h3>加载失败</h3>
              <p>{error}</p>
              <button onClick={loadData} className="btn btn-primary">重试</button>
            </div>
          </div>
        )}

        {/* 左侧面板容器 */}
        <div className="left-panels">
          {/* 订单信息面板 */}
          <div className="info-panel">
            <div className="info-content">
              <h3>📊 订单统计</h3>
              <div className="info-stats">
                <div className="stat-item">
                  <span className="stat-label">总订单数</span>
                  <span className="stat-value">{markers.length}</span>
                </div>
                {routeData && (
                  <>
                    <div className="stat-item">
                      <span className="stat-label">参与计算</span>
                      <span className="stat-value">{routeData.active_orders}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">已出库</span>
                      <span className="stat-value">{routeData.excluded_orders}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 路线优化控制面板 */}
          <RouteOptimizationPanel
            onCalculateRoutes={handleCalculateRoutes}
            isCalculating={isCalculatingRoutes}
            routeData={routeData}
            onClearRoutes={handleClearRoutes}
          />
        </div>

        {/* 更新按钮和状态 */}
        <div className="update-controls">
          <button
            onClick={handleManualUpdate}
            disabled={isUpdating}
            className={`btn btn-outline-primary ${isUpdating ? 'updating' : ''}`}
            title="手动同步飞书数据"
          >
            {isUpdating ? '🔄 同步中...' : '🔄 刷新数据'}
          </button>
          
          <button
            onClick={handleLogout}
            className="btn btn-outline-primary btn-sm"
            title="退出登录"
          >
            🚪 退出
          </button>
        </div>

        {updateMessage && (
          <div className={`update-message ${updateMessage.includes('❌') ? 'error' : 'success'}`}>
            {updateMessage}
          </div>
        )}

        <MapContainer
          center={[-6.2, 106.8]}
          zoom={10}
          style={{ height: '100vh', width: '100%' }}
        >
          <TileLayer
            key={currentLayer}
            attribution={currentLayerConfig.attribution}
            url={currentLayerConfig.url}
          />
          
          <HeadquartersMarker />
          
          <LocationMarker />
          
          <LayerControl 
            currentLayer={currentLayer} 
            onLayerChange={handleLayerChange} 
          />

          {/* 路线叠加层 */}
          <RouteOverlay routeData={routeData} />
          
          {/* 普通订单标记（红色） */}
          {markers.map((marker, index) => (
            <CircleMarker
              key={`${marker.shop_code}-${index}`}
              center={[marker.latitude, marker.longitude]}
              radius={12}
              pathOptions={{
                fillColor: MARKER_COLOR,
                fillOpacity: 0.9,
                color: '#fff',
                weight: 3,
                opacity: 1
              }}
            >
              <Popup>
                <div className="popup-content">
                  <h3>🏪 {marker.outlet_name}</h3>
                  <div className="delivery-info">
                    <p><strong>🏷️</strong> {marker.kantong || '-'}</p>
                    <p><strong>📋</strong> {marker.orderType || '-'}</p>
                    <p><strong>📦</strong> {marker.totalDUS || '-'} DUS</p>
                    <p><strong>📞</strong> {marker.phoneNumber || '-'}</p>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {/* 已出库订单标记（灰色） */}
          {getExcludedMarkers().map((marker, index) => (
            <CircleMarker
              key={`excluded-${marker.shop_code}-${index}`}
              center={[marker.latitude, marker.longitude]}
              radius={8}
              pathOptions={{
                fillColor: EXCLUDED_MARKER_COLOR,
                fillOpacity: 0.6,
                color: '#666',
                weight: 2,
                opacity: 0.8,
                dashArray: '3, 3'
              }}
            >
              <Popup>
                <div className="popup-content">
                  <h3>📦 {marker.outlet_name}</h3>
                  <p className="excluded-label">✅ 已出库</p>
                  <div className="delivery-info">
                    <p><strong>🏷️</strong> {marker.kantong || '-'}</p>
                    <p><strong>📋</strong> {marker.orderType || '-'}</p>
                    <p><strong>📦</strong> {marker.totalDUS || '-'} DUS</p>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

// CSV解析函数
const parseCSV = (csvText: string): MarkerData[] => {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',');
  const markers: MarkerData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length !== headers.length) continue;

    const latitude = parseFloat(values[1]);    // 修复：values[1] 是 latitude
    const longitude = parseFloat(values[2]);   // 修复：values[2] 是 longitude
    
    if (isNaN(latitude) || isNaN(longitude)) continue;

    markers.push({
      shop_code: values[0] || '',
      latitude: latitude,
      longitude: longitude,
      outlet_name: values[3]?.replace(/"/g, '') || '',
      phoneNumber: values[4]?.replace(/"/g, '') || '',
      kantong: values[5]?.replace(/"/g, '') || '',
      orderType: values[6]?.replace(/"/g, '') || '',
      totalDUS: values[7]?.replace(/"/g, '') || '',
      finalPrice: values[8]?.replace(/"/g, '') || ''
    });
  }

  return markers;
};

export default App; 