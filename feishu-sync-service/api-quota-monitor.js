/**
 * Google Maps API配额监控和保护系统
 * 防止意外超出免费额度
 */

class ApiQuotaMonitor {
    constructor() {
        this.dailyLimit = 2400; // 设为2400，留100次缓冲
        this.warningThreshold = 2000; // 2000次时警告
        this.emergencyStopThreshold = 2300; // 2300次时强制停止
        this.callsToday = 0;
        this.lastResetDate = new Date().toDateString();
        this.forceFallbackMode = false;
    }

    /**
     * 检查是否可以进行API调用
     */
    canMakeApiCall() {
        this.resetCounterIfNewDay();
        
        // 强制备用模式
        if (this.forceFallbackMode) {
            return false;
        }
        
        // 达到紧急停止阈值
        if (this.callsToday >= this.emergencyStopThreshold) {
            console.log(`🚨 API调用已达到紧急停止阈值 (${this.callsToday}/${this.emergencyStopThreshold})，强制切换备用模式`);
            this.forceFallbackMode = true;
            return false;
        }
        
        // 达到每日限制
        if (this.callsToday >= this.dailyLimit) {
            console.log(`⚠️ 已达到每日API调用限制 (${this.callsToday}/${this.dailyLimit})，切换到备用模式`);
            return false;
        }
        
        return true;
    }

    /**
     * 记录API调用
     */
    recordApiCall(success = true) {
        this.resetCounterIfNewDay();
        this.callsToday++;
        
        // 警告检查
        if (this.callsToday >= this.warningThreshold && this.callsToday < this.emergencyStopThreshold) {
            console.log(`⚠️ API使用量警告: ${this.callsToday}/${this.dailyLimit} (${((this.callsToday/this.dailyLimit)*100).toFixed(1)}%)`);
        }
        
        // 返回统计信息
        return {
            calls_today: this.callsToday,
            remaining_calls: Math.max(0, this.dailyLimit - this.callsToday),
            usage_percentage: ((this.callsToday / this.dailyLimit) * 100).toFixed(1),
            force_fallback: this.forceFallbackMode
        };
    }

    /**
     * 获取使用统计
     */
    getUsageStats() {
        this.resetCounterIfNewDay();
        
        return {
            calls_today: this.callsToday,
            daily_limit: this.dailyLimit,
            remaining_calls: Math.max(0, this.dailyLimit - this.callsToday),
            usage_percentage: ((this.callsToday / this.dailyLimit) * 100).toFixed(1),
            warning_threshold: this.warningThreshold,
            emergency_threshold: this.emergencyStopThreshold,
            force_fallback: this.forceFallbackMode,
            last_reset: this.lastResetDate,
            status: this.getStatus()
        };
    }

    /**
     * 获取当前状态
     */
    getStatus() {
        if (this.forceFallbackMode) return 'EMERGENCY_FALLBACK';
        if (this.callsToday >= this.dailyLimit) return 'DAILY_LIMIT_REACHED';
        if (this.callsToday >= this.emergencyStopThreshold) return 'EMERGENCY_THRESHOLD';
        if (this.callsToday >= this.warningThreshold) return 'WARNING_THRESHOLD';
        return 'NORMAL';
    }

    /**
     * 如果是新的一天，重置计数器
     */
    resetCounterIfNewDay() {
        const today = new Date().toDateString();
        if (today !== this.lastResetDate) {
            console.log(`📅 新的一天开始，重置API调用计数器`);
            this.callsToday = 0;
            this.lastResetDate = today;
            this.forceFallbackMode = false; // 新一天重置备用模式
        }
    }

    /**
     * 手动重置（紧急情况使用）
     */
    manualReset() {
        console.log('🔄 手动重置API配额监控器');
        this.callsToday = 0;
        this.forceFallbackMode = false;
        this.lastResetDate = new Date().toDateString();
    }

    /**
     * 批量调用预检查
     * @param {number} batchSize 预计的批量调用数量
     */
    checkBatchCall(batchSize) {
        this.resetCounterIfNewDay();
        
        const projectedTotal = this.callsToday + batchSize;
        
        if (projectedTotal > this.dailyLimit) {
            console.log(`⚠️ 批量调用预检查失败: 当前${this.callsToday} + 预计${batchSize} = ${projectedTotal} > 限制${this.dailyLimit}`);
            return {
                allowed: false,
                reason: 'WOULD_EXCEED_DAILY_LIMIT',
                current_calls: this.callsToday,
                batch_size: batchSize,
                projected_total: projectedTotal,
                daily_limit: this.dailyLimit
            };
        }
        
        if (projectedTotal > this.emergencyStopThreshold) {
            console.log(`⚠️ 批量调用可能触发紧急停止: ${projectedTotal} > ${this.emergencyStopThreshold}`);
            return {
                allowed: true,
                warning: 'APPROACHING_EMERGENCY_THRESHOLD',
                current_calls: this.callsToday,
                batch_size: batchSize,
                projected_total: projectedTotal
            };
        }
        
        return {
            allowed: true,
            current_calls: this.callsToday,
            batch_size: batchSize,
            projected_total: projectedTotal
        };
    }
}

module.exports = ApiQuotaMonitor; 