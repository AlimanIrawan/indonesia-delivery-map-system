#!/bin/bash

echo "🧪 API修复验证测试"
echo "=================="

RENDER_URL="https://feishu-delivery-sync.onrender.com"

echo ""
echo "⏰ 等待Render服务完成部署..."
echo "预计等待时间: 3-5分钟"
sleep 10

echo ""
echo "🔍 步骤1: 检查服务健康状态"
echo "=========================="
curl -s "$RENDER_URL/health" | jq '.' 2>/dev/null || echo "健康检查API可能还在部署中..."

echo ""
echo "🔍 步骤2: 检查配置状态"
echo "===================="
echo "GET $RENDER_URL/api/config-status"
curl -s "$RENDER_URL/api/config-status" | jq '.' 2>/dev/null || echo "配置API可能还在部署中..."

echo ""
echo "🔍 步骤3: 测试API连接"
echo "=================="
echo "POST $RENDER_URL/api/test-connections"
curl -s -X POST "$RENDER_URL/api/test-connections" | jq '.' 2>/dev/null || echo "连接测试API可能还在部署中..."

echo ""
echo "🔍 步骤4: 检查当前CSV数据"
echo "======================="
echo "检查GitHub仓库中的CSV文件..."
if [ -f "public/markers.csv" ]; then
    echo "CSV文件行数: $(wc -l < public/markers.csv)"
    echo "前3行内容:"
    head -n 3 public/markers.csv
    echo ""
    echo "检查gudangOut字段（第10列）:"
    cut -d',' -f10 public/markers.csv | head -n 5
    if grep -q "\[object Object\]" public/markers.csv; then
        echo "❌ 仍然发现[object Object]，emoji修复可能未生效"
    else
        echo "✅ 没有发现[object Object]，emoji修复已生效"
    fi
else
    echo "❌ CSV文件不存在"
fi

echo ""
echo "📋 验证总结"
echo "=========="
echo "1. 等待Render完成部署（可能需要几分钟）"
echo "2. 手动访问以下URL进行详细检查:"
echo "   - 健康检查: $RENDER_URL/health"
echo "   - 配置状态: $RENDER_URL/api/config-status" 
echo "   - 连接测试: $RENDER_URL/api/test-connections (POST)"
echo "3. 在前端界面测试路线计算功能"
echo ""
echo "如果API仍然返回403错误，请检查:"
echo "- 飞书应用权限配置"
echo "- GitHub Token权限设置"
echo "- Google Maps API配额状态" 