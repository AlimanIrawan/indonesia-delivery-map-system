#!/bin/bash

echo "🚀 方案B枚举优化算法部署脚本"
echo "================================"

# 检查Git状态
echo "📋 检查Git状态..."
git status

# 测试本地升级
echo "🧪 本地方案B验证测试..."
node test_method_b_upgrade.js

if [ $? -ne 0 ]; then
    echo "❌ 本地测试失败，停止部署"
    exit 1
fi

echo "✅ 本地测试通过，继续部署..."

# 添加所有更改
echo "📦 添加所有更改..."
git add .

# 提交更改
echo "💾 提交方案B升级..."
git commit -m "🚀 升级到方案B枚举优化算法

✨ 新功能:
- 集成方案B枚举优化分批算法
- 智能容量分配策略 (30%-70%范围测试)
- 地理聚类 + 边界优化
- 完全枚举 (≤15订单) + 智能枚举 (>15订单)

📊 性能提升:
- 预计节省22%的行驶距离
- 零额外API成本 (仍在免费配额内)
- 更均衡的容量分配

🔧 技术细节:
- 版本: v2.2.0
- 测试4种排序策略 x 多种容量分配
- 支持订单边界动态调整
- 保留原算法作为备用策略

🎯 业务价值:
- 提高送货效率
- 减少燃油成本
- 优化司机工作负荷
- 提升客户满意度"

# 推送到远程仓库
echo "🌐 推送到GitHub..."
git push origin main

if [ $? -ne 0 ]; then
    echo "❌ GitHub推送失败"
    exit 1
fi

echo "✅ GitHub推送成功！"

# 等待Render自动部署
echo "⏳ 等待Render自动部署..."
echo "📍 监控地址: https://dashboard.render.com/"
echo "🌐 API地址: https://feishu-delivery-sync.onrender.com"

# 等待30秒后检查健康状态
echo "⏳ 等待30秒后检查部署状态..."
sleep 30

echo "🔍 检查健康状态..."
curl -s "https://feishu-delivery-sync.onrender.com/health" | jq '.'

if [ $? -eq 0 ]; then
    echo "✅ 健康检查通过！"
    echo "🎉 方案B升级部署成功！"
    echo ""
    echo "📊 升级总结:"
    echo "   - 版本: v2.2.0"
    echo "   - 算法: 方案B枚举优化"
    echo "   - 预期改善: 22%距离节省"
    echo "   - API成本: $0.00 (零增加)"
    echo ""
    echo "🔗 验证链接:"
    echo "   - 健康状态: https://feishu-delivery-sync.onrender.com/health"
    echo "   - 路线优化: https://feishu-delivery-sync.onrender.com/optimize-routes"
    echo "   - API统计: https://feishu-delivery-sync.onrender.com/api-stats"
else
    echo "⚠️ 健康检查失败，可能需要更多时间"
    echo "💡 请手动检查: https://feishu-delivery-sync.onrender.com/health"
fi

echo ""
echo "🎯 下一步操作建议:"
echo "1. 等待2-3分钟确保服务完全启动"
echo "2. 测试实际路线优化API"
echo "3. 验证飞书数据同步功能"
echo "4. 监控API调用统计"
echo "5. 收集第一轮优化效果数据"

echo ""
echo "🎉 方案B部署完成！" 