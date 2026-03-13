import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { FileSearch, Search, Loader2, ArrowRight, CheckCircle, AlertCircle, Store } from 'lucide-react';
import ppbearsLogo from '/ppbears-logo.png';

type SearchState = 'idle' | 'loading' | 'success' | 'error';

export default function DesignLookup() {
  const [inputId, setInputId] = useState('');
  const [state, setState] = useState<SearchState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [foundDesignId, setFoundDesignId] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleSearch = async () => {
    const id = inputId.trim().toUpperCase();
    if (!id) { inputRef.current?.focus(); return; }

    setState('loading');
    setErrorMsg('');
    setFoundDesignId('');

    try {
      const { data, error } = await supabase
        .from('custom_designs')
        .select('design_id, product_id')
        .eq('design_id', id)
        .maybeSingle();

      if (error || !data) {
        setState('error');
        setErrorMsg('找不到該設計ID，請確認是否輸入正確。');
      } else {
        setFoundDesignId(data.design_id);
        setState('success');
        setTimeout(() => {
          const params = new URLSearchParams();
          if (data.product_id) params.set('productId', data.product_id);
          params.set('load_design_id', data.design_id);
          navigate(`/?${params.toString()}`);
        }, 1200);
      }
    } catch {
      setState('error');
      setErrorMsg('查詢失敗，請稍後再試。');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleReset = () => {
    setInputId('');
    setState('idle');
    setErrorMsg('');
    setFoundDesignId('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div style={{
      minHeight: '100svh',
      background: '#f8f9fa', // Light gray/white background
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: "'Outfit', 'Noto Sans TC', sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Google Font */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;900&display=swap" rel="stylesheet" />

      {/* Background soft shapes */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(229,0,56,0.03) 0%, transparent 70%)',
          top: '-150px', left: '-150px',
        }} />
        <div style={{
          position: 'absolute', width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(195,13,35,0.02) 0%, transparent 70%)',
          bottom: '-120px', right: '-120px',
        }} />
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spinAnim {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .lookup-card { animation: fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both; }
        .lookup-footer { animation: fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both 0.15s; }

        .lookup-input {
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .lookup-input:focus {
          outline: none !important;
          border-color: #e50038 !important;
          box-shadow: 0 0 0 3px rgba(229,0,56,0.15) !important;
        }
        .lookup-input::placeholder { 
          color: #adb5bd; 
          font-family: 'Courier New', monospace;
        }
        .lookup-btn {
          transition: all 0.2s;
          cursor: pointer;
        }
        .lookup-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(229,0,56,0.25) !important;
          filter: brightness(1.05);
        }
        .lookup-btn:active:not(:disabled) { transform: scale(0.96); }
        .lookup-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .shop-link { transition: color 0.2s; }
        .shop-link:hover { color: #e50038 !important; }
      `}</style>

      {/* Card Container */}
      <div className="lookup-card" style={{
        width: '100%',
        maxWidth: 420,
        background: '#ffffff',
        borderRadius: 24,
        border: '1px solid rgba(0,0,0,0.06)',
        padding: '0 36px 36px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.05)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: 60, // Space for the overlapping logo
      }}>

        {/* Logo overlapping the top of the card (no square box, preserving organic shape) */}
        <div style={{
          position: 'absolute',
          top: -48, // Half of its height above the card
          left: '50%',
          transform: 'translateX(-50%)',
          width: 96,
          height: 96,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <img
            src={ppbearsLogo}
            alt="PPBears"
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'contain',
              // Add a soft drop shadow since the box is removed
              filter: 'drop-shadow(0 8px 16px rgba(209,7,44,0.25))' 
            }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        </div>

        {/* Padding for content below the absolute positioned logo */}
        <div style={{ marginTop: 64, width: '100%' }}>
          <h1 style={{
            color: '#111827', fontSize: 24, fontWeight: 800,
            margin: '0 0 12px', letterSpacing: '-0.5px',
          }}>
            查詢設計稿
          </h1>
          <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            輸入您的設計ID，即可找回並繼續編輯<br/>您的專屬設計。
          </p>
        </div>

        {/* Search area */}
        {state !== 'success' && (
          <div style={{ width: '100%' }}>
            <label style={{
              display: 'block', color: '#4b5563',
              fontSize: 12, fontWeight: 700, letterSpacing: '1px',
              textTransform: 'uppercase', marginBottom: 8,
            }}>
              設計 ID
            </label>
            
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <input
                ref={inputRef}
                className="lookup-input"
                type="text"
                placeholder="PPBEARS-XXXX"
                value={inputId}
                onChange={e => { setInputId(e.target.value.toUpperCase()); if (state === 'error') setState('idle'); }}
                onKeyDown={handleKeyDown}
                disabled={state === 'loading'}
                autoComplete="off"
                spellCheck={false}
                style={{
                  flex: 1,
                  padding: '14px 16px',
                  background: '#f9fafb',
                  border: '1.5px solid #e5e7eb',
                  borderRadius: 12,
                  color: '#111827',
                  fontSize: 15,
                  fontFamily: 'monospace',
                  letterSpacing: '0.05em',
                  minWidth: 0, // prevents flex blowout
                }}
              />
              <button
                className="lookup-btn"
                onClick={handleSearch}
                disabled={!inputId.trim() || state === 'loading'}
                style={{
                  padding: '0 20px',
                  background: 'linear-gradient(135deg, #e50038, #c30d23)',
                  border: 'none',
                  borderRadius: 12,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 15,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {state === 'loading'
                  ? <Loader2 size={18} style={{ animation: 'spinAnim 0.8s linear infinite' }} />
                  : <Search size={18} />}
                {state === 'loading' ? '查詢中' : '查詢'}
              </button>
            </div>

            {/* Error Message */}
            {state === 'error' && (
              <div style={{
                display: 'flex', gap: 8, alignItems: 'flex-start',
                padding: '12px 14px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 10,
                marginTop: 12,
                animation: 'fadeUp 0.25s ease both',
              }}>
                <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ color: '#b91c1c', fontSize: 13, margin: 0, lineHeight: 1.5, fontWeight: 500 }}>{errorMsg}</p>
              </div>
            )}

            {/* Hint */}
            <div style={{
              marginTop: 24, padding: '16px',
              background: '#f8f9fa', borderRadius: 12,
              border: '1px dashed #e5e7eb',
            }}>
              <p style={{
                color: '#6b7280', fontSize: 12, textAlign: 'center',
                lineHeight: 1.6, margin: 0,
              }}>
                💡 設計ID 由 PPBears設計館完成設計，保存設計後<br/>
                格式通常為13位數：
                <span style={{ fontFamily: 'monospace', color: '#e50038', fontWeight: 600 }}> AP65YH0MJDCU1</span> 組成
              </p>
            </div>
          </div>
        )}

        {/* Success state */}
        {state === 'success' && (
          <div style={{ textAlign: 'center', animation: 'fadeUp 0.3s ease both', width: '100%', padding: '20px 0' }}>
            <div style={{
              display: 'inline-flex', width: 64, height: 64, borderRadius: '50%',
              background: '#ecfdf5', border: '2px solid #34d399',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 16,
            }}>
              <CheckCircle size={32} color="#059669" />
            </div>
            <p style={{ color: '#059669', fontWeight: 800, fontSize: 18, marginBottom: 8 }}>找到設計稿！</p>
            <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>
              正在載入 <span style={{ color: '#e50038', fontFamily: 'monospace', fontWeight: 700 }}>{foundDesignId}</span>...
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
               <Loader2 size={24} color="#e50038" style={{ animation: 'spinAnim 0.8s linear infinite' }} />
            </div>
          </div>
        )}

      </div>

      {/* Reset Button (Outside Card) */}
      {state === 'error' && (
        <button
          onClick={handleReset}
          style={{
            marginTop: 20, background: 'none', border: 'none',
            color: '#6b7280', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            animation: 'fadeUp 0.25s ease both 0.1s',
            transition: 'color 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#111827')}
          onMouseLeave={e => (e.currentTarget.style.color = '#6b7280')}
        >
          <ArrowRight size={16} /> 重新輸入
        </button>
      )}

      {/* Footer link */}
      <div className="lookup-footer" style={{ marginTop: state === 'error' ? 20 : 40, textAlign: 'center' }}>
        <a
          href="https://ppbears.com/design"
          className="shop-link"
          style={{
            color: '#9ca3af', fontSize: 13, fontWeight: 600,
            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <Store size={14} />
          前往 PPBears 設計館
        </a>
      </div>
    </div>
  );
}
