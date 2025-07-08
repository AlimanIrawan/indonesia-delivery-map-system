#!/bin/bash

# 简化部署脚本 - 避免Git拉取卡住
echo "🚀 简化部署流程启动..."

# 步骤1: 检查网络连接
echo "🌐 检查网络连接..."
if ! ping -c 1 github.com &> /dev/null; then
    echo "❌ 网络连接失败，请检查网络"
    exit 1
fi

# 步骤2: 检查Git状态但不拉取
echo "📋 检查Git状态..."
git status --porcelain

# 步骤3: 如果处于合并状态，直接退出合并
if [ -f .git/MERGE_HEAD ]; then
    echo "🔄 检测到合并状态，中止合并..."
    git merge --abort 2>/dev/null || true
fi

# 步骤4: 重置到HEAD状态
echo "🔄 重置到HEAD状态..."
git reset --hard HEAD

# 步骤5: 直接强制推送当前状态
echo "📦 添加所有更改..."
git add .

# 步骤6: 提交
if git diff --staged --quiet; then
    echo "ℹ️ 没有新的更改需要提交"
else
    echo "💾 创建提交..."
    git commit -m "部署更新 - $(date '+%Y%m%d_%H%M%S')"
fi

# 步骤7: 强制推送（避免拉取冲突）
echo "📤 强制推送到远程..."
git push --force-with-lease origin main

if [ $? -eq 0 ]; then
    echo "✅ 推送成功!"
    echo ""
    echo "🎉 部署完成!"
    echo "🔄 Render将自动检测更改并重新部署"
    echo "⏱️ 预计部署时间: 3-5分钟"
    echo ""
    echo "📱 应用访问链接:"
    echo "🌍 前端地图系统: https://indonesia-delivery-map-system.netlify.app"
    echo "🔧 后端API服务: https://feishu-delivery-sync.onrender.com"
    echo ""
    echo "📋 可选的验证步骤:"
    echo "运行: ./test_api_fixes.sh"
else
    echo "❌ 推送失败，请检查网络连接和权限"
    exit 1
fi 