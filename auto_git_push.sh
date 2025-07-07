#!/bin/bash

# 印尼地图送货数据同步系统 - 自动Git推送脚本
# =====================================

echo "🚀 开始提交印尼地图送货数据同步系统到Git仓库..."

# 检查是否已初始化Git仓库
if [ ! -d ".git" ]; then
    echo "📦 初始化Git仓库..."
    git init
    
    echo "📝 创建.gitignore文件..."
    cat > .gitignore << 'EOF'
# 依赖文件
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# 生产构建
/build
/dist

# 环境变量文件
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# 日志文件
*.log
logs/

# 临时文件
.DS_Store
.vscode/
.idea/
*.swp
*.swo
*~

# 测试覆盖率
coverage/

# 缓存
.cache/
.parcel-cache/

# 锁文件（可选保留）
# package-lock.json
# yarn.lock

# 飞书同步服务的环境变量
feishu-sync-service/.env
feishu-sync-service/.env.*
!feishu-sync-service/env.example

# 其他敏感文件
config/secrets.js
config/production.env
EOF
    
    echo "✅ .gitignore文件创建完成"
fi

# 添加所有文件到暂存区
echo "📁 添加文件到Git暂存区..."
git add .

# 提交更改
echo "💾 提交更改到本地仓库..."
git commit -m "🚚 印尼地图送货数据同步系统

✨ 新功能:
- 飞书表格数据自动同步系统
- 每日两次定时读取送货数据（09:00和14:00）
- 全云端架构（Render + GitHub + Netlify）
- 送货地点信息显示（店铺、电话、PO类型、日期）
- 地图/卫星视图切换功能
- 用户位置定位功能
- 总部位置特殊标记

🔧 技术实现:
- 飞书开放API集成
- Node.js定时任务服务
- GitHub API自动更新CSV
- React地图前端优化
- 响应式设计

📁 文件结构:
- feishu-sync-service/ (Render云服务)
- src/ (前端React应用)
- public/markers.csv (数据文件)
- 配置和文档文件

🌟 系统特点:
- 完全自动化，无需人工干预
- 数据实时同步
- 专为送货路线优化的界面
- 支持手机和电脑访问"

# 检查是否已配置远程仓库
if ! git remote | grep -q "origin"; then
    echo ""
    echo "🔗 配置远程Git仓库..."
    echo "请选择Git托管平台："
    echo "1) GitHub"
    echo "2) GitLab"
    echo "3) 其他Git平台"
    read -p "请输入选择 (1-3): " choice
    
    case $choice in
        1)
            echo "📘 GitHub配置指南："
            echo "1. 访问 https://github.com/new"
            echo "2. 创建新仓库，仓库名建议：indonesia-delivery-map-system"
            echo "3. 复制仓库URL"
            ;;
        2)
            echo "📙 GitLab配置指南："
            echo "1. 访问 https://gitlab.com/projects/new"
            echo "2. 创建新项目，项目名建议：indonesia-delivery-map-system"
            echo "3. 复制项目URL"
            ;;
        3)
            echo "📗 其他平台请手动创建仓库"
            ;;
    esac
    
    echo ""
    read -p "🔗 请输入远程仓库URL: " repo_url
    
    if [ -n "$repo_url" ]; then
        git remote add origin "$repo_url"
        echo "✅ 远程仓库配置完成"
        
        # 设置默认分支名
        git branch -M main
        
        # 推送到远程仓库
        echo "🚀 推送到远程仓库..."
        if git push -u origin main; then
            echo ""
            echo "🎉 恭喜！印尼地图送货数据同步系统已成功推送到Git仓库！"
            echo ""
            echo "📋 下一步部署指南："
            echo "1. 📖 查看详细部署说明：送货数据同步部署指南.txt"
            echo "2. 🔧 配置飞书应用：飞书API配置指南.txt"
            echo "3. ☁️ 部署Render服务：feishu-sync-service/"
            echo "4. 🌐 部署Netlify前端：当前目录"
            echo ""
            echo "🔗 仓库地址: $repo_url"
            echo "📱 系统特点: 每日自动同步，全云端运行"
        else
            echo "❌ 推送失败，请检查："
            echo "1. 仓库URL是否正确"
            echo "2. 是否有推送权限"
            echo "3. 网络连接是否正常"
        fi
    else
        echo "⚠️  未配置远程仓库，仅本地提交完成"
    fi
else
    # 已配置远程仓库，直接推送
    echo "🚀 推送到远程仓库..."
    if git push; then
        echo ""
        echo "🎉 印尼地图送货数据同步系统更新已推送到Git仓库！"
        echo ""
        echo "📋 系统状态："
        echo "✅ 前端地图应用已更新"
        echo "✅ 飞书同步服务已更新"
        echo "✅ 配置文档已更新"
        echo ""
        echo "🔄 如需重新部署："
        echo "1. Render服务会自动检测更新"
        echo "2. Netlify会自动重新构建"
        echo "3. 系统将在下次定时任务时生效"
    else
        echo "❌ 推送失败，请检查网络连接和权限"
    fi
fi

echo ""
echo "📝 Git操作完成！"
