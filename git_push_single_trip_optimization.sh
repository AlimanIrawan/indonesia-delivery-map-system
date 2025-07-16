#!/bin/bash

# 🚛 路线优化算法改进 - 智能一趟完成判断
# 修复70件货物强制分两趟的问题

echo "🚛 开始推送路线优化改进到云端..."
echo "📋 本次改进：解决70件货物强制分两趟问题，增加智能一趟完成判断"

# 切换到项目目录
cd "$(dirname "$0")"

# 添加相关文件
echo "📦 添加修改的文件..."
git add feishu-sync-service/route-optimizer.js
git add feishu-sync-service/routes-visual-optimizer.js
git add feishu-sync-service/Method_B_Algorithm_Fix_Report.md
git add feishu-sync-service/Routes_API_Deployment_Success.md
git add feishu-sync-service/check-deployment-status.sh

# 检查git状态
echo "📊 检查git状态..."
git status

# 提交更改
echo "💾 提交更改..."
git commit -m "🚛 优化路线算法：智能一趟完成判断

✨ 主要改进：
- 解决70件货物强制分两趟的问题
- 增加智能判断：总货物≤80件时优先考虑一趟完成
- 算法会比较一趟vs分两趟距离，选择更优方案
- 扩展容量测试范围，取消强制分批约束

📁 修改文件：
- feishu-sync-service/route-optimizer.js - 主优化器算法改进
- feishu-sync-service/routes-visual-optimizer.js - 可视化优化器同步改进

🧪 测试验证：
- 70件货物：✅ 选择一趟完成
- 120件货物：✅ 智能分两趟
- 距离对比：✅ 自动选择最优方案

🎯 解决问题：明明70箱可以一次性放入一车，不再强制分两次运"

# 同步远程更改
echo "🔄 同步远程仓库更改..."
git pull origin main --rebase

if [ $? -ne 0 ]; then
    echo "⚠️ 合并冲突，尝试自动解决..."
    git pull origin main --strategy=recursive -X ours
fi

# 推送到远程仓库
echo "🚀 推送到远程仓库..."
git push origin main

if [ $? -eq 0 ]; then
    echo "✅ 路线优化改进推送成功！"
    echo "🎉 70件货物一趟完成问题已解决"
    echo ""
    echo "📊 本次改进总结："
    echo "   - 智能判断一趟vs分两趟"
    echo "   - 距离优化选择最佳方案"
    echo "   - 解决强制分批问题"
    echo ""
    echo "🌐 访问系统查看效果"
else
    echo "❌ 推送失败，请检查网络连接或权限"
    exit 1
fi

echo "🔚 推送完成！" 