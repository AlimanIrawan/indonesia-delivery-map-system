#!/bin/bash

# 印尼地图标注系统 - 增强Gudang OUT状态显示推送脚本
echo "🔧 开始推送Gudang OUT状态显示增强..."

# 拉取最新远程更改
echo "📥 拉取远程更改..."
git pull origin main

# 添加所有更改
git add .

# 提交更改
git commit -m "增强Gudang OUT状态显示功能

✨ 新功能:
- CSV格式新增gudangOut字段，显示Gudang OUT状态
- 前端统一处理已出库和待出库订单显示
- 根据出库状态显示不同样式的地图标记(红色/灰色)
- 增强订单统计面板：显示待出库、已出库、总货物数量
- 弹窗中显示完整订单信息：店铺代码、价格、出库状态

🔧 技术改进:
- 修复CSV解析中坐标字段顺序
- 统一订单状态管理逻辑
- 优化地图标记显示性能"

# 推送到远程仓库
echo "📤 推送到GitHub..."
git push origin main

echo "✅ Gudang OUT状态显示增强已推送到GitHub!"
echo "📍 现在可以清晰区分已出库和待出库订单"
echo "�� 前端和后端将在1-2分钟内自动更新" 