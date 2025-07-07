import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Marker } from 'react-leaflet';
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
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80">
      <defs>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="3" dy="3" stdDeviation="3" flood-color="rgba(0,0,0,0.4)"/>
        </filter>
      </defs>
      <polygon points="40,8 51,29 74,29 56.5,45 65,68 40,53 15,68 23.5,45 6,29 29,29" 
               fill="#FF8C00" 
               stroke="#FFFFFF" 
               stroke-width="4" 
               filter="url(#shadow)"/>
      <polygon points="40,14 49,32 68,32 53,44 59,62 40,50 21,62 27,44 12,32 31,32" 
               fill="#FFD700" 
               stroke="#FFFFFF" 
               stroke-width="2"/>
    </svg>
  `),
  iconSize: [80, 80],
  iconAnchor: [40, 80],
  popupAnchor: [0, -80],
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
  shadowSize: [82, 82],
  shadowAnchor: [26, 82]
});

interface MarkerData {
  latitude: number;
  longitude: number;
  outletName: string;
  shopCode: string;
  kecamatan?: string;
  phoneNumber?: string;
  poType?: string;
  deliveryDate?: string;
}

// 统一使用鲜艳的红色标记
const MARKER_COLOR = '#FF0000';  // 鲜艳的红色

// 总部坐标（固定不变）
const HEADQUARTERS_POSITION: [number, number] = [-6.112588, 106.917328];

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

function App() {
  const [markers, setMarkers] = useState<MarkerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [currentLayer, setCurrentLayer] = useState<MapLayerType>('street');

  // 处理CSV数据
  const processCSVData = useCallback((csvText: string) => {
    console.log('开始处理CSV数据');
    
    const lines = csvText.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const processedMarkers: MarkerData[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      try {
        const values = line.split(',').map(v => v.trim());
        const row: any = {};
        
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        
        const lat = parseFloat(row.latitude);
        const lng = parseFloat(row.longitude);
        
        if (isNaN(lat) || isNaN(lng)) {
          console.warn(`第 ${i + 1} 行数据坐标无效:`, row);
          continue;
        }
        
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          console.warn(`第 ${i + 1} 行数据坐标超出范围:`, row);
          continue;
        }
        
        processedMarkers.push({
          latitude: lat,
          longitude: lng,
          outletName: row.outlet_name || row.nama_pemilik || '未知店铺',
          shopCode: row.shop_code || row.outlet_code || '',
          kecamatan: row.kecamatan || '未知区域',
          phoneNumber: row.phone_number || '',
          poType: row.po_type || '',
          deliveryDate: row.delivery_date || ''
        });
      } catch (error) {
        console.error(`处理第 ${i + 1} 行数据时出错:`, error);
      }
    }
    
    console.log('处理完成，有效标记:', processedMarkers.length);
    return processedMarkers;
  }, []);

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
      const processedMarkers = processCSVData(csvText);
      setMarkers(processedMarkers);
      setLastUpdate(new Date().toLocaleString('zh-CN'));
    } catch (error) {
      console.error('加载数据失败:', error);
      setError('加载数据失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  }, [processCSVData]);

  // 页面加载时获取数据
  useEffect(() => {
    loadData();
  }, [loadData]);

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
          
          {markers.map((marker, index) => (
            <CircleMarker
              key={`${marker.shopCode}-${index}`}
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
                  <h3>🚚 送货地点</h3>
                  <div className="delivery-info">
                    <p><strong>店铺名称:</strong> {marker.outletName}</p>
                    {marker.phoneNumber && (
                      <p><strong>📞 电话号码:</strong> {marker.phoneNumber}</p>
                    )}
                    {marker.poType && (
                      <p><strong>📦 PO类型:</strong> {marker.poType}</p>
                    )}
                    {marker.deliveryDate && (
                      <p><strong>📅 送货日期:</strong> {marker.deliveryDate}</p>
                    )}
                    <p><strong>🏪 门店代码:</strong> {marker.shopCode}</p>
                    {marker.kecamatan && (
                      <p><strong>📍 区域:</strong> {marker.kecamatan}</p>
                    )}
                    <p><strong>📌 坐标:</strong> {marker.latitude.toFixed(6)}, {marker.longitude.toFixed(6)}</p>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>

        <LayerControl 
          currentLayer={currentLayer}
          onLayerChange={handleLayerChange}
        />

        <div className="info-panel">
          <h4>🚚 送货系统信息</h4>
          <p>今日送货地点: {markers.length}</p>
          <p>总部位置: 已标记 ⭐</p>
          <p>当前视图: {currentLayerConfig.name}</p>
          <p>最后更新: {lastUpdate}</p>
          <p>同步频率: 每日 09:00 & 14:00</p>
          <button onClick={loadData} className="btn btn-outline-primary btn-sm">
            🔄 刷新数据
          </button>
        </div>
      </div>
    </div>
  );
}

export default App; 