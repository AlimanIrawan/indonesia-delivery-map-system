#!/bin/bash

# Emoji修正提交脚本
echo "📝 开始提交emoji修正..."

# 添加所有更改
git add .

# 提交更改
git commit -m "统计面板和店铺信息emoji优化

Emoji调整:
- 统计面板第一项改为🏪 (店铺数量)
- 路线优化面板第一项改为🔴 (未出库店铺数)
- 所有DUS相关显示改为📦 (包裹emoji)
- 店铺弹窗信息中的DUS显示统一为📦
- 保持其他emoji不变 (✅已出库)

界面语义化:
- 🏪 更好地表示店铺/门店数量
- 🔴 准确表示未出库的店铺数量
- 📦 更准确地表示货物/包裹的DUS数量
- 提升界面的直观性和国际化友好度"

# 推送到远程仓库
git push origin main

echo "✅ Emoji修正已成功推送到GitHub!"
echo "�� Netlify将自动部署更新..." 