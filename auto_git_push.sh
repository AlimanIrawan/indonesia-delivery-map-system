#!/bin/bash

# 印尼雅加达送货路线优化系统 - 自动Git推送脚本
# ==============================================

# 颜色输出函数
print_success() {
    echo -e "\033[32m✅ $1\033[0m"
}

print_error() {
    echo -e "\033[31m❌ $1\033[0m"
}

print_info() {
    echo -e "\033[34mℹ️  $1\033[0m"
}

print_warning() {
    echo -e "\033[33m⚠️  $1\033[0m"
}

# 脚本开始
echo "🚀 印尼雅加达送货路线优化系统 - Git自动推送"
echo "============================================"

# 检查是否在Git仓库中
if [ ! -d ".git" ]; then
    print_info "初始化Git仓库..."
    git init
    print_success "Git仓库初始化完成"
fi

# 检查Git配置
if [ -z "$(git config user.name)" ]; then
    print_info "设置Git用户信息..."
    read -p "请输入您的Git用户名: " git_username
    read -p "请输入您的Git邮箱: " git_email
    git config user.name "$git_username"
    git config user.email "$git_email"
    print_success "Git用户信息设置完成"
fi

# 添加所有文件到暂存区
print_info "添加文件到Git暂存区..."
git add .

# 检查是否有变更
if git diff --staged --quiet; then
    print_warning "没有发现文件变更，无需提交"
    exit 0
fi

# 显示将要提交的文件
echo ""
print_info "将要提交的文件:"
git diff --staged --name-status

# 生成提交信息
current_date=$(date "+%Y-%m-%d %H:%M:%S")
commit_message="🚚 更新送货路线优化系统 - $current_date

✨ 新功能:
- 订单状态管理（Gudang OUT字段支持）
- 智能路线优化（TSP算法）
- 云端部署集成（Netlify + Render）
- Google Maps API集成
- 实时数据同步

🔧 技术栈:
- 前端: React + TypeScript + Leaflet
- 后端: Node.js + Express + 飞书API
- 优化: Google Maps API + 缓存机制
- 部署: 云端自动化部署

📊 系统特性:
- 自动过滤已出库订单
- 多批次路线优化
- 响应式地图界面
- 实时统计面板"

# 提交变更
print_info "提交变更到本地仓库..."
git commit -m "$commit_message"
print_success "本地提交完成"

# 检查是否已配置远程仓库
remote_url=$(git remote get-url origin 2>/dev/null)
if [ -z "$remote_url" ]; then
    print_warning "未发现远程仓库配置"
    echo ""
    print_info "请选择远程仓库平台:"
    echo "1) GitHub"
    echo "2) GitLab"
    echo "3) 其他Git仓库"
    echo "4) 跳过远程推送"
    
    read -p "请选择 (1-4): " platform_choice
    
    case $platform_choice in
        1)
            print_info "配置GitHub仓库..."
            read -p "请输入GitHub用户名: " github_username
            read -p "请输入仓库名称: " repo_name
            remote_url="https://github.com/$github_username/$repo_name.git"
            ;;
        2)
            print_info "配置GitLab仓库..."
            read -p "请输入GitLab用户名: " gitlab_username
            read -p "请输入仓库名称: " repo_name
            remote_url="https://gitlab.com/$gitlab_username/$repo_name.git"
            ;;
        3)
            print_info "配置自定义Git仓库..."
            read -p "请输入完整的Git仓库URL: " remote_url
            ;;
        4)
            print_warning "跳过远程推送，仅保留本地提交"
            exit 0
            ;;
        *)
            print_error "无效选择，退出脚本"
            exit 1
            ;;
    esac
    
    # 添加远程仓库
    git remote add origin "$remote_url"
    print_success "远程仓库配置完成: $remote_url"
fi

# 检查远程仓库连接
print_info "检查远程仓库连接..."
if git ls-remote origin &>/dev/null; then
    print_success "远程仓库连接正常"
else
    print_error "无法连接到远程仓库，请检查网络和仓库配置"
    print_info "您可以稍后手动推送: git push -u origin main"
    exit 1
fi

# 检查当前分支
current_branch=$(git branch --show-current)
if [ -z "$current_branch" ]; then
    current_branch="main"
    git checkout -b main
    print_info "创建并切换到main分支"
fi
        
        # 推送到远程仓库
print_info "推送到远程仓库..."
if git push -u origin "$current_branch"; then
    print_success "远程推送完成！"
else
    print_warning "推送失败，尝试强制推送..."
    read -p "是否要强制推送？这会覆盖远程仓库 (y/N): " force_push
    if [[ $force_push =~ ^[Yy]$ ]]; then
        git push -u origin "$current_branch" --force
        print_success "强制推送完成！"
        else
        print_error "推送被取消"
        exit 1
    fi
fi

# 显示仓库信息
        echo ""
print_success "Git推送完成！"
echo "📝 提交信息: 送货路线优化系统更新"
echo "🌐 远程仓库: $remote_url"
echo "🌿 分支: $current_branch"
echo "📅 提交时间: $current_date"
        echo ""
print_info "您可以通过以下方式访问仓库:"
echo "   git clone $remote_url"
        echo ""

# 可选：打开仓库网页
if command -v open &> /dev/null; then
    read -p "是否要打开仓库网页？ (y/N): " open_browser
    if [[ $open_browser =~ ^[Yy]$ ]]; then
        # 转换Git URL为网页URL
        web_url=$(echo "$remote_url" | sed 's/\.git$//' | sed 's/^git@github\.com:/https:\/\/github.com\//')
        open "$web_url"
        print_success "已在浏览器中打开仓库"
    fi
fi

print_success "�� 印尼送货路线优化系统推送完成！"
