#!/bin/bash

# 路线数据持久化功能 - Git自动推送脚本
# 创建时间: $(date '+%Y-%m-%d %H:%M:%S')

echo "🚀 开始推送路线数据持久化功能更新..."

# 检查git状态
echo "📋 检查Git状态..."
git status

# 推送到远程仓库
echo "📤 推送到远程仓库..."
git push origin main

# 检查推送结果
if [ $? -eq 0 ]; then
    echo "✅ 路线数据持久化功能推送成功！"
    echo ""
    echo "🎯 新功能说明:"
    echo "- ✨ 路线数据自动保存，刷新页面不会丢失"
    echo "- 🕛 每晚12点自动清除过期路线"
    echo "- 🧹 支持手动清除路线（刷子按钮）"
    echo "- 🔄 重新规划路线会更新数据"
    echo "- 📱 完全解决刷新页面路线消失问题"
    echo ""
    echo "🔗 在线访问: https://deliveryonemeter.netlify.app"
    echo "📊 系统监控: https://feishu-delivery-sync.onrender.com"
else
    echo "❌ 推送失败，请检查网络连接或权限设置"
    exit 1
fi

echo ""
echo "🎉 路线持久化功能部署完成！"
echo "💡 提示: 现在用户可以放心规划路线，不用担心刷新页面丢失数据了" 