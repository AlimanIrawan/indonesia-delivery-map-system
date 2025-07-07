#!/bin/bash

# 印尼地图标注系统 - 修复前端构建错误推送脚本
echo "🔧 开始修复前端构建错误..."

# 添加所有更改
git add .

# 提交更改
git commit -m "修复前端构建错误

🐛 修复问题:
- 删除未使用的getExcludedMarkers函数
- 解决ESLint no-unused-vars错误
- 确保Netlify部署成功

✅ 现在前端应该能正常部署"

# 推送到远程仓库
echo "📤 推送到GitHub..."
git push origin main

echo "✅ 构建错误修复已推送到GitHub!"
echo "🌐 Netlify将自动重新部署前端"
echo "⏱️ 预计1-2分钟后完成部署" 