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
  iconUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
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

// 红色订单标记图标
const redMarkerIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <circle cx="12" cy="12" r="10" fill="#dc3545" stroke="white" stroke-width="2"/>
    </svg>
  `),
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12]
});

// 灰色订单标记图标（已到店）
const grayMarkerIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <circle cx="12" cy="12" r="10" fill="#6c757d" stroke="white" stroke-width="2"/>
    </svg>
  `),
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12]
});

// 红色优先级标记图标（带黄色惊叹号）
const redPriorityMarkerIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <circle cx="12" cy="12" r="10" fill="#dc3545" stroke="white" stroke-width="2"/>
      <text x="12" y="16" text-anchor="middle" fill="#FFD700" font-size="14" font-weight="bold">!</text>
    </svg>
  `),
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12]
});

// 灰色优先级标记图标（带黄色惊叹号）
const grayPriorityMarkerIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <circle cx="12" cy="12" r="10" fill="#6c757d" stroke="white" stroke-width="2"/>
      <text x="12" y="16" text-anchor="middle" fill="#FFD700" font-size="14" font-weight="bold">!</text>
    </svg>
  `),
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12]
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
  gudangOut?: string;  // Gudang OUT状态（保留兼容性）
  outletIn?: string;   // 新增：Outlet IN状态（已到店/未到店）
  prioritas?: string;  // 新增：Prioritas状态（❗️/- 优先级标识）
  fields?: any;
}

interface LoginFormProps {
  onLogin: () => void;
}

interface RoutePolyline {
  from: string;
  to: string;
  polyline: string | null;
  distance: number;
  duration: number;
  from_coords: {
    lat: number;
    lng: number;
  };
  to_coords: {
    lat: number;
    lng: number;
  };
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
  route_polylines?: RoutePolyline[]; // Routes API可视化数据
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
// const MARKER_COLOR = '#FF0000';  // 鲜艳的红色
// const EXCLUDED_MARKER_COLOR = '#999999';  // 灰色（已出库）

// Polyline解码函数
const decodePolyline = (encoded: string): [number, number][] => {
  const poly: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lng += deltaLng;

    poly.push([lat / 1e5, lng / 1e5]);
  }

  return poly;
};

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
        <h3>🚛 路线</h3>
      </div>
      
      <div className="panel-actions">
        <button
          onClick={onCalculateRoutes}
          disabled={isCalculating}
          className={`btn btn-primary btn-sm ${isCalculating ? 'calculating' : ''}`}
          title="计算最优送货路线"
        >
          {isCalculating ? '⏳' : '🧮'}
        </button>
        
        {routeData && (
          <button
            onClick={onClearRoutes}
            className="btn btn-outline-primary btn-sm"
            title="清除路线显示"
          >
            🧹
          </button>
        )}
      </div>

      {routeData && routeData.success && routeData.optimization_result && (
        <div className="route-summary">
          <div className="summary-stats">
            <div className="stat-row">
              <span>🔴</span>
              <span>{routeData.active_orders}</span>
            </div>
            <div className="stat-row">
              <span>✅</span>
              <span>{routeData.excluded_orders}</span>
            </div>
            <div className="stat-row">
              <span>📏</span>
              <span>{routeData.optimization_result.total_distance.toFixed(0)}km</span>
            </div>
            <div className="stat-row">
              <span>⏱️</span>
              <span>{routeData.optimization_result.total_duration.toFixed(0)}分</span>
            </div>
          </div>
          
          <div className="batch-legend">
            {routeData.optimization_result.batches.map((batch, index) => (
              <div key={batch.batch_number} className="legend-item">
                <div 
                  className="color-indicator" 
                  style={{ backgroundColor: ROUTE_COLORS[index % ROUTE_COLORS.length] }}
                ></div>
                <span>{batch.capacity_used}📦</span>
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

// 路线显示组件 - 升级支持Routes API可视化
const RouteOverlay: React.FC<{ 
  routeData: OptimizationResult | null 
}> = ({ routeData }) => {
  if (!routeData || !routeData.success || !routeData.optimization_result) {
    return null;
  }

  return (
    <>
      {/* 渲染每个批次的路线 */}
      {routeData.optimization_result.batches.map((batch, batchIndex) => {
        const color = ROUTE_COLORS[batchIndex % ROUTE_COLORS.length];
        
        // 检查是否有Routes API可视化数据
        const hasRoutePolylines = batch.route_polylines && batch.route_polylines.length > 0;
        
        if (hasRoutePolylines) {
          // 使用Routes API的真实路线数据
          return (
            <React.Fragment key={`routes-api-${batch.batch_number}`}>
              {batch.route_polylines!.map((segment, segmentIndex) => {
                // 根据是否有polyline数据选择路径
                let segmentPath: [number, number][];
                let isRealRoute = false;
                
                if (segment.polyline) {
                  // 解码真实路线数据
                  try {
                    segmentPath = decodePolyline(segment.polyline);
                    isRealRoute = true;
                    console.log(`🗺️ 批次${batch.batch_number}段${segmentIndex + 1}: 使用Routes API真实路线 (${segmentPath.length}个点)`);
                  } catch (error) {
                    console.warn(`⚠️ Polyline解码失败，使用备用方案:`, error);
                    // 备用方案：使用起点和终点坐标
                    segmentPath = [
                      [segment.from_coords.lat, segment.from_coords.lng],
                      [segment.to_coords.lat, segment.to_coords.lng]
                    ];
                  }
                } else {
                  // 备用方案：使用起点和终点坐标
                  segmentPath = [
                    [segment.from_coords.lat, segment.from_coords.lng],
                    [segment.to_coords.lat, segment.to_coords.lng]
                  ];
                }

                return (
                  <Polyline
                    key={`segment-${batch.batch_number}-${segmentIndex}`}
                    positions={segmentPath}
                    pathOptions={{
                      color: color,
                      weight: isRealRoute ? 6 : 4,
                      opacity: isRealRoute ? 0.9 : 0.7,
                      // 真实路线显示实线，估算路线显示虚线
                      dashArray: isRealRoute ? undefined : '8, 8'
                    }}
                  >
                    <Popup>
                      <div className="route-segment-popup">
                        <h4>🛣️ 路线段 {segmentIndex + 1}</h4>
                        <div className="segment-details">
                          <p><strong>📍 起点:</strong> {segment.from === 'headquarters' ? '🏢 总部' : `🏪 ${segment.from}`}</p>
                          <p><strong>📍 终点:</strong> {segment.to === 'headquarters' ? '🏢 总部' : `🏪 ${segment.to}`}</p>
                          <p><strong>📏 距离:</strong> {segment.distance.toFixed(1)} km</p>
                          <p><strong>⏱️ 时间:</strong> {segment.duration.toFixed(0)} 分钟</p>
                          <p><strong>🗺️ 数据源:</strong> {isRealRoute ? 'Routes API真实路线' : '直线估算'}</p>
                          {isRealRoute && <p><strong>🎯 路径点数:</strong> {segmentPath.length} 个</p>}
                        </div>
                      </div>
                    </Popup>
                  </Polyline>
                );
              })}
              
              {/* 批次总览信息标记 */}
              <Marker
                key={`batch-info-${batch.batch_number}`}
                position={[batch.route[0]?.lat || HEADQUARTERS_POSITION[0], batch.route[0]?.lng || HEADQUARTERS_POSITION[1]]}
                icon={L.divIcon({
                  className: 'batch-info-marker',
                  html: `
                    <div style="
                      background: ${color};
                      color: white;
                      padding: 4px 8px;
                      border-radius: 12px;
                      font-size: 12px;
                      font-weight: bold;
                      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                      border: 2px solid white;
                      white-space: nowrap;
                    ">
                      批次${batch.batch_number}: ${batch.total_distance.toFixed(0)}km
                    </div>
                  `,
                  iconSize: [120, 24],
                  iconAnchor: [60, 12]
                })}
              >
                <Popup>
                  <div className="route-popup">
                    <h4>🚛 批次 {batch.batch_number} (Routes API优化)</h4>
                    <div className="route-details">
                      <p><strong>📏 总距离:</strong> {batch.total_distance.toFixed(1)} km</p>
                      <p><strong>⏱️ 总时间:</strong> {batch.total_duration.toFixed(0)} 分钟</p>
                      <p><strong>📦 货物:</strong> {batch.capacity_used} DUS</p>
                      <p><strong>🏪 站点:</strong> {batch.route.length} 个</p>
                      <p><strong>🛣️ 路线段:</strong> {batch.route_polylines?.length || 0} 段</p>
                      <p><strong>🗺️ 可视化:</strong> Routes API真实路线</p>
                    </div>
                    <div className="route-sequence">
                      <h5>📋 访问顺序:</h5>
                      <ol className="sequence-list">
                        <li>🏢 总部 (出发)</li>
                        {batch.route.map((order, index) => (
                          <li key={order.id}>
                            🏪 {order.name} ({order.dus_count} DUS)
                          </li>
                        ))}
                        <li>🏢 总部 (返回)</li>
                      </ol>
                    </div>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        } else {
          // 备用方案：使用简单的点对点连接（Legacy模式）
          const routePath: [number, number][] = [HEADQUARTERS_POSITION];
          
          batch.route.forEach(order => {
            routePath.push([order.lat, order.lng]);
          });
          
          routePath.push(HEADQUARTERS_POSITION);

          return (
            <React.Fragment key={`legacy-route-${batch.batch_number}`}>
              <Polyline
                positions={routePath}
                pathOptions={{
                  color: color,
                  weight: 4,
                  opacity: 0.7,
                  dashArray: '10, 10' // 虚线表示估算路线
                }}
              >
                <Popup>
                  <div className="route-popup">
                    <h4>🚛 批次 {batch.batch_number} (估算路线)</h4>
                    <div className="route-details">
                      <p><strong>📏 距离:</strong> {batch.total_distance.toFixed(1)} km (估算)</p>
                      <p><strong>⏱️ 时间:</strong> {batch.total_duration.toFixed(0)} 分钟 (估算)</p>
                      <p><strong>📦 货物:</strong> {batch.capacity_used} DUS</p>
                      <p><strong>🏪 站点:</strong> {batch.route.length} 个</p>
                      <p><strong>🗺️ 数据源:</strong> 直线估算</p>
                    </div>
                    <div className="route-sequence">
                      <h5>📋 访问顺序:</h5>
                      <ol className="sequence-list">
                        <li>🏢 总部 (出发)</li>
                        {batch.route.map((order, index) => (
                          <li key={order.id}>
                            🏪 {order.name} ({order.dus_count} DUS)
                          </li>
                        ))}
                        <li>🏢 总部 (返回)</li>
                      </ol>
                    </div>
                  </div>
                </Popup>
              </Polyline>
            </React.Fragment>
          );
        }
      })}
    </>
  );
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

  // 保存路线数据到localStorage
  const saveRouteData = useCallback((data: OptimizationResult | null) => {
    try {
      if (data) {
        const routeDataWithTimestamp = {
          ...data,
          savedAt: Date.now()
        };
        localStorage.setItem('routeData', JSON.stringify(routeDataWithTimestamp));
        console.log('✅ 路线数据已保存到本地存储');
      } else {
        localStorage.removeItem('routeData');
        console.log('🗑️ 路线数据已从本地存储清除');
      }
    } catch (error) {
      console.error('保存路线数据失败:', error);
    }
  }, []);

  // 从localStorage恢复路线数据
  const loadRouteData = useCallback(() => {
    try {
      const savedData = localStorage.getItem('routeData');
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        
        // 检查是否需要自动清除（超过24小时或过了当晚12点）
        const now = new Date();
        const savedTime = new Date(parsedData.savedAt);
        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
        
        // 如果保存时间是在今天之前，或者现在已经过了保存当天的午夜12点，则清除数据
        if (savedTime.toDateString() !== now.toDateString() || now >= todayMidnight) {
          localStorage.removeItem('routeData');
          console.log('🕛 路线数据已过期，自动清除');
          return null;
        }
        
        console.log('📥 从本地存储恢复路线数据');
        return parsedData;
      }
    } catch (error) {
      console.error('恢复路线数据失败:', error);
      localStorage.removeItem('routeData'); // 清除损坏的数据
    }
    return null;
  }, []);

  // 设置每晚12点自动清除路线数据
  const setupMidnightClear = useCallback(() => {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    let intervalId: number | null = null;
    
    // 设置到下一个午夜的定时器
    const timeoutId = setTimeout(() => {
      console.log('🕛 午夜12点自动清除路线数据');
      setRouteData(null);
      saveRouteData(null);
      
      // 设置每24小时重复执行
      intervalId = window.setInterval(() => {
        console.log('🕛 午夜12点自动清除路线数据');
        setRouteData(null);
        saveRouteData(null);
      }, 24 * 60 * 60 * 1000); // 24小时
    }, msUntilMidnight);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [saveRouteData]);

  // 页面加载时恢复路线数据
  useEffect(() => {
    const restoredRouteData = loadRouteData();
    if (restoredRouteData) {
      setRouteData(restoredRouteData);
    }
    
    // 设置午夜自动清除
    const cleanup = setupMidnightClear();
    
    return cleanup;
  }, [loadRouteData, setupMidnightClear]);

  // 监听路线数据变化，自动保存到localStorage
  useEffect(() => {
    saveRouteData(routeData);
  }, [routeData, saveRouteData]);

  // 加载CSV数据
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('https://raw.githubusercontent.com/Alimanirawan/indonesia-delivery-map-system/main/public/markers.csv');
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
    setRouteData(null); // 清除旧的路线数据

    try {
      console.log('🚀 开始计算路线优化...');
      
      // 先自动刷新数据，确保使用最新的订单信息
      console.log('🔄 自动刷新数据以获取最新订单...');
      try {
        const syncResponse = await fetch('https://feishu-delivery-sync.onrender.com/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (syncResponse.ok) {
          // 等待数据同步完成
          await new Promise(resolve => setTimeout(resolve, 2000));
          // 重新加载地图数据
          await loadData();
          console.log('✅ 数据自动刷新完成');
        }
      } catch (syncError) {
        console.warn('⚠️ 数据同步失败，使用现有数据计算路线:', syncError);
      }
      
      const response = await fetch('https://feishu-delivery-sync.onrender.com/api/optimize-routes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`路线计算失败: ${response.status}`);
      }

      const result: OptimizationResult = await response.json();
      setRouteData(result); // 这会触发useEffect自动保存

      if (result.success) {
        console.log('✅ 路线优化计算完成并已保存');
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
    console.log('🧹 用户手动清除路线数据');
    setRouteData(null); // 这会触发useEffect自动清除localStorage
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
              <h3>📊 统计</h3>
              <div className="info-stats">
                <div className="stat-item">
                  <span className="stat-label">🏪</span>
                  <span className="stat-value">{markers.length}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">🔴</span>
                  <span className="stat-value">{markers.filter(m => m.outletIn !== '✅').length}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">✅</span>
                  <span className="stat-value">{markers.filter(m => m.outletIn === '✅').length}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">❗️</span>
                  <span className="stat-value">{markers.filter(m => m.prioritas === '❗️').length}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">📦</span>
                  <span className="stat-value">{markers.reduce((sum, m) => sum + (parseInt(m.totalDUS) || 0), 0)}</span>
                </div>
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

        {/* 右上角控制按钮 */}
        <div className="top-right-controls">
          <button
            onClick={handleManualUpdate}
            disabled={isUpdating}
            className={`control-btn ${isUpdating ? 'updating' : ''}`}
            title="手动同步飞书数据"
          >
            {isUpdating ? '⏳' : '🔄'}
          </button>
          
          <button
            onClick={handleLogout}
            className="control-btn"
            title="退出登录"
          >
            🚪
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
          
          {/* 订单标记 - 根据Outlet IN状态分类显示 */}
          {(() => {
            // 使用一个Set来跟踪已经匹配的路线位置，避免重复
            const usedPositions = new Set<string>();
            
            return markers.map((marker, index) => {
              const isExcluded = marker.outletIn === '✅';
              
              // 查找该订单在路线中的位置和批次
              let routeInfo: { batchNumber: number; orderIndex: number; batchColor: string } | null = null;
              
              if (routeData && routeData.success && routeData.optimization_result && !isExcluded) {
                for (let batchIndex = 0; batchIndex < routeData.optimization_result.batches.length; batchIndex++) {
                  const batch = routeData.optimization_result.batches[batchIndex];
                  for (let orderIndex = 0; orderIndex < batch.route.length; orderIndex++) {
                    const routeOrder = batch.route[orderIndex];
                    const positionKey = `${batch.batch_number}-${orderIndex}`;
                    
                    // 如果这个位置已经被匹配过，跳过
                    if (usedPositions.has(positionKey)) {
                      continue;
                    }
                    
                    // 更精确的坐标匹配（缩小误差范围）
                    const latDiff = Math.abs(routeOrder.lat - marker.latitude);
                    const lngDiff = Math.abs(routeOrder.lng - marker.longitude);
                    
                    if (latDiff < 0.0001 && lngDiff < 0.0001) {
                      // 额外验证：如果有shop_code，也要匹配
                      let isMatch = true;
                      if (marker.shop_code && routeOrder.id) {
                        isMatch = routeOrder.id.includes(marker.shop_code) || marker.shop_code.includes(routeOrder.id);
                      }
                      
                      if (isMatch) {
                        routeInfo = {
                          batchNumber: batch.batch_number,
                          orderIndex: orderIndex + 1, // 从1开始计数
                          batchColor: ROUTE_COLORS[batchIndex % ROUTE_COLORS.length]
                        };
                        usedPositions.add(positionKey);
                        
                        // 调试日志
                        console.log(`匹配成功: ${marker.outlet_name} -> 批次${batch.batch_number}-第${orderIndex + 1}站`);
                        break;
                      }
                    }
                  }
                  if (routeInfo) break;
                }
              }

              // 如果是参与路线的订单，创建带数字的自定义标记
              if (routeInfo) {
                const customIcon = L.divIcon({
                  className: 'custom-marker-with-number',
                  html: `
                    <div style="
                      width: 32px;
                      height: 32px;
                      background-color: #dc3545;
                      border: 3px solid ${routeInfo.batchColor};
                      border-radius: 50%;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      font-weight: bold;
                      color: white;
                      font-size: 14px;
                      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                      position: relative;
                    ">
                      ${routeInfo.orderIndex}
      </div>
                  `,
                  iconSize: [32, 32],
                  iconAnchor: [16, 16]
                });

                return (
                  <Marker
                    key={`route-marker-${index}-${routeInfo.batchNumber}-${routeInfo.orderIndex}`}
                    position={[marker.latitude, marker.longitude]}
                    icon={customIcon}
                  >
                    <Popup className="order-popup">
                      <div className="route-info">
                        <strong>批次 {routeInfo.batchNumber} - 第 {routeInfo.orderIndex} 站</strong>
    </div>
                      <div>🏪 {marker.outlet_name}</div>
                      <div>✉️ {marker.kantong}</div>
                      <div>📦 {marker.totalDUS} DUS</div>
                    </Popup>
                  </Marker>
                );
              }

              // 普通订单标记（未参与路线或已出库）
              // 根据prioritas和outletIn状态选择图标
              let markerIcon;
              if (marker.prioritas === '❗️') {
                // 优先级订单：带黄色惊叹号
                markerIcon = isExcluded ? grayPriorityMarkerIcon : redPriorityMarkerIcon;
              } else {
                // 普通订单：标准图标
                markerIcon = isExcluded ? grayMarkerIcon : redMarkerIcon;
              }
              
              return (
                <Marker
                  key={`marker-${index}`}
                  position={[marker.latitude, marker.longitude]}
                  icon={markerIcon}
                >
                  <Popup className="order-popup">
                    {isExcluded && (
                      <div className="excluded-label">已到店 ✅</div>
                    )}
                    {marker.prioritas === '❗️' && (
                      <div className="priority-label">优先级 ❗️</div>
                    )}
                    <div>🏪 {marker.outlet_name}</div>
                    <div>✉️ {marker.kantong}</div>
                    <div>📦 {marker.totalDUS} DUS</div>
                  </Popup>
                </Marker>
              );
            });
          })()}

          {/* 移除原来分开的已出库订单标记，因为现在统一处理了 */}
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
    if (values.length < headers.length) continue; // 允许字段数量差异

    const latitude = parseFloat(values[1]);    // values[1] 是 latitude
    const longitude = parseFloat(values[2]);   // values[2] 是 longitude
    
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
      finalPrice: values[8]?.replace(/"/g, '') || '',
      gudangOut: values[9]?.replace(/"/g, '') || '',  // Gudang OUT状态（保留兼容性）
      outletIn: values[10]?.replace(/"/g, '') || '',  // 新增：Outlet IN状态（已到店/未到店）
      prioritas: values[11]?.replace(/"/g, '') || ''   // 第12列：Prioritas状态（❗️/- 优先级标识）
    });
  }

  return markers;
};

export default App;