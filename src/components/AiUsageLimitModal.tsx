import React from 'react';

interface AiUsageLimitModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AiUsageLimitModal: React.FC<AiUsageLimitModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{
                background: 'rgba(0, 0, 0, 0.45)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
            }}
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'rgba(255, 255, 255, 0.92)',
                    backdropFilter: 'blur(40px)',
                    WebkitBackdropFilter: 'blur(40px)',
                    borderRadius: '22px',
                    boxShadow: '0 32px 80px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.08)',
                    maxWidth: '360px',
                    width: '100%',
                    overflow: 'hidden',
                    animation: 'aiModalIn 0.28s cubic-bezier(0.34, 1.30, 0.64, 1) both',
                }}
            >
                {/* Icon Area */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    paddingTop: '32px',
                    paddingBottom: '8px',
                    paddingLeft: '24px',
                    paddingRight: '24px',
                }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '16px',
                        background: 'linear-gradient(145deg, #ff6b6b, #ee0979)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '18px',
                        boxShadow: '0 8px 24px rgba(238, 9, 121, 0.30)',
                    }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                            <path d="M2 17l10 5 10-5"/>
                            <path d="M2 12l10 5 10-5"/>
                        </svg>
                    </div>

                    {/* Title */}
                    <h2 style={{
                        fontSize: '18px',
                        fontWeight: '700',
                        color: '#1c1c1e',
                        textAlign: 'center',
                        margin: '0 0 12px 0',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
                        letterSpacing: '-0.3px',
                    }}>
                        免費 AI 次數已用盡
                    </h2>

                    {/* Message */}
                    <p style={{
                        fontSize: '14px',
                        lineHeight: '1.6',
                        color: '#3c3c43',
                        textAlign: 'center',
                        margin: '0 0 8px 0',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
                    }}>
                        您的免費 AI 生成次數已用盡。為了提供更好的服務，若需確保最佳印刷品質，請於結帳購物車加購
                        <span style={{ fontWeight: '600', color: '#1c1c1e' }}>【數位修復】</span>
                        與
                        <span style={{ fontWeight: '600', color: '#1c1c1e' }}>【專業設計師精修去背】</span>
                        服務，由真人設計師為您服務。
                    </p>
                </div>

                {/* Divider */}
                <div style={{
                    height: '1px',
                    background: 'rgba(60, 60, 67, 0.12)',
                    margin: '20px 0 0 0',
                }} />

                {/* Button */}
                <button
                    onClick={onClose}
                    style={{
                        display: 'block',
                        width: '100%',
                        padding: '16px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#007aff',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
                        textAlign: 'center',
                        transition: 'background 0.12s ease',
                        letterSpacing: '-0.1px',
                    }}
                    onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0, 122, 255, 0.06)';
                    }}
                    onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    }}
                    onMouseDown={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0, 122, 255, 0.12)';
                    }}
                    onMouseUp={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0, 122, 255, 0.06)';
                    }}
                >
                    我知道了
                </button>
            </div>

            <style>{`
                @keyframes aiModalIn {
                    from {
                        opacity: 0;
                        transform: scale(0.88) translateY(8px);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1) translateY(0);
                    }
                }
            `}</style>
        </div>
    );
};
