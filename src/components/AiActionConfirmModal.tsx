import React, { useEffect, useState } from 'react';
import { Wand2, Scissors, X, Sparkles, ShieldAlert, RefreshCw } from 'lucide-react';
import { apiUrl } from '@/lib/apiBase';

interface AiActionConfirmModalProps {
  action: 'toon_ink' | 'remove_bg' | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const ACTION_CONFIG = {
  toon_ink: {
    icon: <Wand2 className="w-6 h-6 text-purple-600" />,
    iconBg: 'bg-purple-100',
    title: 'AI 卡通化功能',
    desc: 'AI 卡通化可讓您快速預覽趣味風格效果！處理結果僅供畫面預覽，印刷品質可能與螢幕顯示有所差異。',
    tip: '✨  若您追求完美的印刷品質，強烈建議您在結帳購物車時勾選【數位修復】服務，由真人設計師為您精修，印出最完美的商品！',
    confirmLabel: '我知道了，繼續使用 AI 卡通化',
    confirmColor: 'bg-purple-600 hover:bg-purple-700',
    accentColor: 'text-purple-600',
    badgeColor: 'from-purple-50 to-indigo-50 border-purple-100',
  },
  remove_bg: {
    icon: <Scissors className="w-6 h-6 text-rose-600" />,
    iconBg: 'bg-rose-100',
    title: 'AI 去背功能',
    desc: 'AI 去背可協助您快速預覽效果！但若您的圖片背景較複雜（如：髮絲、陰影、相近色），可能會殘留白邊，印刷的時候也會跟著印出來喔。',
    tip: '✨  若您追求完美的印刷品質，強烈建議您在結帳購物車時勾選【專業設計師精修去背】服務，由真人設計師幫您去背景，印出最完美的商品！',
    confirmLabel: '我知道了，繼續使用 AI 預覽去背',
    confirmColor: 'bg-gray-900 hover:bg-black',
    accentColor: 'text-rose-600',
    badgeColor: 'from-rose-50 to-orange-50 border-rose-100',
  },
};

export default function AiActionConfirmModal({ action, onConfirm, onCancel }: AiActionConfirmModalProps) {
  const [usageCount, setUsageCount] = useState(0);
  const [limit, setLimit] = useState(Number(localStorage.getItem('ppbears_ai_usage_limit') || '20'));
  const [resetAtStr, setResetAtStr] = useState<string>('');
  const [animated, setAnimated] = useState(false);
  const [countdown, setCountdown] = useState('');
  const COST = action === 'toon_ink' ? 5 : 1; // 卡通化=5點，去背=1點

  useEffect(() => {
    if (!action) return;
    let isMounted = true;
    const fetchStatus = async () => {
        try {
            const pId = localStorage.getItem('ppbears_current_product_id') || '';
            const url = apiUrl(`/api/ai/usage-status${pId ? `?product_id=${pId}` : ''}`);
            const res = await fetch(url);
            const data = await res.json();
            if (isMounted && data.success) {
                setUsageCount(data.count);
                setLimit(data.limit);
                setResetAtStr(data.resetAt);
                localStorage.setItem('ppbears_ai_usage_limit', data.limit.toString());
            }
        } catch (err) {
            console.error('Failed to fetch AI usage:', err);
            const today = new Date().toISOString().split('T')[0];
            if (isMounted) setUsageCount(Number(localStorage.getItem(`ppbears_ai_usage_${today}`) || '0'));
        } finally {
            if (isMounted) setTimeout(() => setAnimated(true), 80);
        }
    };
    fetchStatus();
    return () => { isMounted = false; };
  }, [action]);

  // Countdown to next reset time
  useEffect(() => {
    const tick = () => {
      let resetDate: Date;
      if (resetAtStr) {
          resetDate = new Date(resetAtStr);
      } else {
          // fallback to 00:00 Taiwan time
          resetDate = new Date();
          resetDate.setUTCHours(16, 0, 0, 0);
          if (resetDate <= new Date()) resetDate.setUTCDate(resetDate.getUTCDate() + 1);
      }
      
      const now = new Date();
      const diff = resetDate.getTime() - now.getTime();
      
      if (diff <= 0) {
          setCountdown('0h 00m 00s');
          return;
      }
      
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [resetAtStr]);

  if (!action) return null;

  const cfg = ACTION_CONFIG[action];
  const remaining = Math.max(0, limit - usageCount);
  const canUse = remaining >= COST;
  const pct = Math.min(100, (usageCount / limit) * 100);
  const barColor = remaining <= 4 ? 'bg-orange-400' : 'bg-blue-500';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-200 overflow-hidden">
        {/* Header Strip */}
        <div className="px-5 pt-5 pb-4">
          {/* Title row */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl ${cfg.iconBg}`}>{cfg.icon}</div>
              <div>
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide">注意說明</span>
                </div>
                <h3 className="font-bold text-gray-900 text-base leading-tight">{cfg.title}</h3>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* AI Usage Badge */}
          <div className={`rounded-xl border bg-gradient-to-r ${cfg.badgeColor} p-3 mb-3`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                AI 創意點數
              </span>
              <span className={`text-xs font-bold ${!canUse ? 'text-orange-500' : 'text-gray-700'}`}>
                {!canUse ? `點數不足` : `剩餘 ${remaining} / ${limit}`}
              </span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
                style={{ width: animated ? `${pct}%` : '0%' }}
              />
            </div>
            <p className="text-[10px] text-gray-500 mt-1 flex items-center justify-between">
              <span>{!canUse ? `點數不足（需 ${COST} 點，剩餘 ${remaining} 點）` : `執行後將消耗 ${COST} 點，剩餘 ${remaining - COST} 點`}</span>
              <span className="flex items-center gap-1 text-gray-400">
                <RefreshCw size={9} /> 重置於 {countdown}
              </span>
            </p>
          </div>

          {/* Description */}
          <p className="text-sm text-gray-600 leading-relaxed mb-3">{cfg.desc}</p>

          {/* Tip box */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 leading-relaxed">
            {cfg.tip}
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="px-5 pb-5 space-y-2 pt-1">
          <button
            onClick={onConfirm}
            disabled={!canUse}
            className={`w-full py-3 rounded-xl text-white text-sm font-bold transition-all active:scale-95 shadow-sm ${cfg.confirmColor} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {cfg.confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="w-full py-2.5 rounded-xl text-gray-500 text-sm font-medium hover:text-gray-700 hover:bg-gray-50 transition-all"
          >
            暫時不需要
          </button>
        </div>
      </div>
    </div>
  );
}
