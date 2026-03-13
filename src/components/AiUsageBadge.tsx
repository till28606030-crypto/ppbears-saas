import { useState, useEffect, useCallback } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';

interface AiUsageData {
    count: number;
    limit: number;
    remaining: number;
    resetAt: string; // ISO string
}

interface AiUsageBadgeProps {
    productId?: string | null;
    refreshTrigger?: number;
}

function getLocalStorageUsage(limit: number): AiUsageData {
    const today = new Date().toISOString().split('T')[0];
    const count = Number(localStorage.getItem(`ppbears_ai_usage_${today}`) || '0');
    const tomorrowMidnight = new Date();
    tomorrowMidnight.setHours(24, 0, 0, 0);
    return {
        count,
        limit,
        remaining: Math.max(0, limit - count),
        resetAt: tomorrowMidnight.toISOString(),
    };
}

export default function AiUsageBadge({ productId, refreshTrigger = 0 }: AiUsageBadgeProps) {
    // Immediately show localStorage data — no loading flicker
    const [usage, setUsage] = useState<AiUsageData>(() => getLocalStorageUsage(20)); // v6.0: default 20
    const [countdown, setCountdown] = useState('');

    const fetchFromServer = useCallback(async () => {
        try {
            const apiOrigin = (import.meta as any).env?.VITE_API_ORIGIN || '';
            const url = productId
                ? `${apiOrigin}/api/ai/usage-status?product_id=${encodeURIComponent(productId)}`
                : `${apiOrigin}/api/ai/usage-status`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('server error');
            const data = await res.json();
            if (data.success) {
                // Server data is more accurate (IP-based) — override
                const tomorrowMidnight = new Date();
                tomorrowMidnight.setHours(24, 0, 0, 0);
                setUsage({
                    count: data.count,
                    limit: data.limit,
                    remaining: data.remaining,
                    resetAt: data.resetAt ?? tomorrowMidnight.toISOString(),
                });
                // Sync localStorage so future reads stay consistent
                const today = new Date().toISOString().split('T')[0];
                localStorage.setItem(`ppbears_ai_usage_${today}`, String(data.count));
            }
        } catch {
            // Silently fall back — localStorage is already showing
        }
    }, [productId]);

    // Refresh from localStorage immediately when refreshTrigger changes
    useEffect(() => {
        setUsage(prev => getLocalStorageUsage(prev.limit));
        // Then try to get accurate server data in background
        fetchFromServer();
    }, [refreshTrigger, fetchFromServer]);

    // Countdown timer
    useEffect(() => {
        if (!usage?.resetAt) return;
        const update = () => {
            const diff = new Date(usage.resetAt).getTime() - Date.now();
            if (diff <= 0) { setCountdown('即將重置'); return; }
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setCountdown(`${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`);
        };
        update();
        const timer = setInterval(update, 1000);
        return () => clearInterval(timer);
    }, [usage?.resetAt]);

    const pct = usage.limit > 0 ? Math.max(0, Math.min(100, (usage.remaining / usage.limit) * 100)) : 0;
    const isLow = usage.remaining <= Math.max(1, Math.floor(usage.limit * 0.2));
    const isEmpty = usage.remaining === 0;

    const barColor = isEmpty ? '#ef4444' : isLow ? '#f97316' : '#6366f1';
    const bgColor = isEmpty ? 'rgba(239,68,68,0.07)' : isLow ? 'rgba(249,115,22,0.07)' : 'rgba(99,102,241,0.07)';
    const textColor = isEmpty ? '#ef4444' : isLow ? '#ea580c' : '#4f46e5';

    return (
        <div
            style={{
                margin: '8px 12px 4px',
                padding: '10px 12px',
                background: bgColor,
                borderRadius: 12,
                border: `1px solid ${barColor}30`,
            }}
        >
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Sparkles size={12} style={{ color: barColor }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: textColor, letterSpacing: '-0.2px' }}>
                        AI 今日點數
                    </span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 800, color: textColor }}>
                    {isEmpty ? '已用盡' : `${usage.remaining} / ${usage.limit}`}
                </span>
            </div>

            {/* Progress bar */}
            <div style={{ height: 5, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
                <div
                    style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: isEmpty
                            ? '#ef4444'
                            : isLow
                            ? 'linear-gradient(90deg, #f97316, #ef4444)'
                            : 'linear-gradient(90deg, #818cf8, #6366f1)',
                        borderRadius: 99,
                        transition: 'width 0.4s ease',
                    }}
                />
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, color: '#9ca3af' }}>
                    {isEmpty ? '⏱' : '🔄'} 重置於 {countdown}
                </span>
                <button
                    onClick={() => {
                        setUsage(prev => getLocalStorageUsage(prev.limit));
                        fetchFromServer();
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center' }}
                    title="重新整理"
                >
                    <RefreshCw size={10} />
                </button>
            </div>
        </div>
    );
}
