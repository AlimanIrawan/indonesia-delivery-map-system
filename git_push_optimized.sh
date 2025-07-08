#!/bin/bash

# 优化的Git推送脚本 - 避免合并冲突
echo "🚀 开始优化Git推送流程..."

# 检查是否有变更
if git diff --quiet && git diff --staged --quiet; then
    echo "⚠️ 没有发现文件变更，无需提交"
    exit 0
fi

# 显示将要提交的文件
echo "📋 将要提交的文件:"
git diff --name-status HEAD

# 添加所有更改
echo "📦 添加文件到暂存区..."
git add .

# 检查是否处于合并状态
if [ -f .git/MERGE_HEAD ]; then
    echo "🔄 检测到合并状态，直接完成合并..."
    git commit -m "自动合并远程更改 - $(date '+%Y-%m-%d %H:%M:%S')"
else
    # 正常提交
    commit_message="系统更新 - $(date '+%Y-%m-%d %H:%M:%S')

    自动提交包含:
    - 错误处理增强
    - API诊断功能
    - 路线过滤逻辑修复
    - 系统稳定性改进"
    
    echo "💾 创建提交..."
    git commit -m "$commit_message"
fi

# 尝试强制推送（如果简单推送失败）
echo "📤 推送到远程仓库..."
if git push origin main; then
    echo "✅ 推送成功!"
else
    echo "⚠️ 简单推送失败，尝试强制推送..."
    echo "📋 注意：这将覆盖远程的冲突更改"
    read -p "是否继续强制推送？(y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git push --force-with-lease origin main
        echo "✅ 强制推送完成!"
    else
        echo "❌ 推送取消"
        exit 1
    fi
fi

echo ""
echo "🎉 Git推送流程完成!"
echo "🔄 Render服务将自动检测更改并重新部署"
echo "⏱️ 预计部署时间: 3-5分钟" 