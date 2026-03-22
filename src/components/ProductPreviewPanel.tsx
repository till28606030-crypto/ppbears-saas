import React, { useState, useEffect, useRef } from 'react';
import { X, ShoppingBag, ChevronLeft, ChevronRight, Image as ImageIcon, Check, ZoomIn } from 'lucide-react';
import { useStep1Products, Step1Product } from '../hooks/useStep1Products';

interface ProductPreviewPanelProps {
    productId: string | null | undefined;
    productName?: string;
    isOpen: boolean;
    onClose: () => void;
}

// ────────────────────────────────────────────
// Skeleton Card
// ────────────────────────────────────────────
function SkeletonCard() {
    return (
        <div className="ppb-prev-card ppb-prev-card--skeleton">
            <div className="ppb-prev-card__img-wrap skeleton-pulse" />
            <div className="ppb-prev-card__body">
                <div className="skeleton-line" style={{ width: '70%', height: 12 }} />
                <div className="skeleton-line" style={{ width: '45%', height: 10, marginTop: 6 }} />
            </div>
        </div>
    );
}

// ────────────────────────────────────────────
// Lightbox
// ────────────────────────────────────────────
function Lightbox({
    images,
    index,
    onClose,
    onPrev,
    onNext,
}: {
    images: string[];
    index: number;
    onClose: () => void;
    onPrev: () => void;
    onNext: () => void;
}) {
    // Touch swipe state
    const [touchStartX, setTouchStartX] = useState<number | null>(null);
    const [touchEndX, setTouchEndX] = useState<number | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft') onPrev();
            if (e.key === 'ArrowRight') onNext();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, onPrev, onNext]);

    const handleTouchStart = (e: React.TouchEvent) => {
        setTouchStartX(e.targetTouches[0].clientX);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        setTouchEndX(e.targetTouches[0].clientX);
    };

    const handleTouchEnd = () => {
        if (touchStartX === null || touchEndX === null) return;
        const diff = touchStartX - touchEndX;
        // Swipe threshold
        if (diff > 50) onNext();
        else if (diff < -50) onPrev();
        setTouchStartX(null);
        setTouchEndX(null);
    };

    return (
        <div className="ppb-lightbox" onClick={onClose}>
            <button className="ppb-lightbox__close" onClick={onClose}><X size={20} /></button>
            <div 
                className="ppb-lightbox__content" 
                onClick={e => e.stopPropagation()}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <img 
                    src={images[index]} 
                    alt={`preview-${index}`} 
                    className="ppb-lightbox__img cursor-pointer" 
                    onClick={(e) => {
                        e.stopPropagation();
                        // If only 1 image, click does nothing or closes. If > 1, go to next.
                        if (images.length > 1) onNext();
                    }}
                />
                {images.length > 1 && (
                    <>
                        <button className="ppb-lightbox__nav ppb-lightbox__nav--left" onClick={onPrev}>
                            <ChevronLeft size={24} />
                        </button>
                        <button className="ppb-lightbox__nav ppb-lightbox__nav--right" onClick={onNext}>
                            <ChevronRight size={24} />
                        </button>
                        <div className="ppb-lightbox__dots">
                            {images.map((_, i) => (
                                <span key={i} className={`ppb-lightbox__dot${i === index ? ' active' : ''}`} />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ────────────────────────────────────────────
// Product Card
// ────────────────────────────────────────────
function ProductCard({ product, onClick }: { product: Step1Product; onClick: () => void }) {
    const { group } = product;
    const ui = group.uiConfig as any;
    const thumbnail = group.thumbnail;
    const hasImages = thumbnail || ui?.descriptionImages?.length || ui?.descriptionImage;
    const allTags: { label: string; theme: string; expiresAt?: string }[] = ui?.marketingTags || [];
    const now = new Date();
    const marketingTags = allTags.filter(t => !t.expiresAt || new Date(t.expiresAt) > now);
    const price = (group as any).priceModifier ?? null;

    return (
        <div className="ppb-prev-card" onClick={onClick} role="button" tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onClick()}>
            <div className="ppb-prev-card__img-wrap">
                {thumbnail ? (
                    <img src={thumbnail} alt={group.name} className="ppb-prev-card__img" />
                ) : (
                    <div className="ppb-prev-card__img-placeholder">
                        <ImageIcon size={28} className="ppb-prev-card__img-icon" />
                    </div>
                )}
                {/* Support badge */}
                <div className="ppb-prev-card__badge">
                    <Check size={10} strokeWidth={3} />
                    <span>支援</span>
                </div>
                {/* Zoom hint */}
                {hasImages && (
                    <div className="ppb-prev-card__zoom-hint">
                        <ZoomIn size={14} />
                    </div>
                )}
                {/* Marketing tags */}
                {marketingTags.length > 0 && (
                    <div className="ppb-prev-card__mktags">
                        {marketingTags.slice(0, 2).map((t, i) => (
                            <span key={i} className={`ppb-prev-card__mktag ppb-prev-card__mktag--${t.theme}`}>
                                {t.label}
                            </span>
                        ))}
                    </div>
                )}
                {/* Price badge (bottom-right) */}
                {price !== null && price !== 0 && (
                    <div style={{
                        position: 'absolute',
                        bottom: 4,
                        right: 4,
                        background: 'rgba(0,0,0,0.55)',
                        color: '#fff',
                        fontSize: 9,
                        fontWeight: 600,
                        borderRadius: 4,
                        padding: '1px 4px',
                        lineHeight: 1.4,
                        letterSpacing: '0.01em',
                        pointerEvents: 'none',
                    }}>
                        {price > 0 ? `+NT$${price}` : `NT$${Math.abs(price)}`}
                    </div>
                )}
            </div>
            <div className="ppb-prev-card__body">
                <p className="ppb-prev-card__name">{group.name}</p>
                {ui?.description && (
                    <p className="ppb-prev-card__desc">{String(ui.description).replace(/<[^>]+>/g, '').slice(0, 30)}</p>
                )}
            </div>
        </div>
    );
}

// ────────────────────────────────────────────
// Main Panel
// ────────────────────────────────────────────
export default function ProductPreviewPanel({
    productId,
    productName,
    isOpen,
    onClose,
}: ProductPreviewPanelProps) {
    const { step1Products, loading, error, categories } = useStep1Products(productId);
    const [activeCategory, setActiveCategory] = useState<string>('全部');
    const [lightboxImages, setLightboxImages] = useState<string[]>([]);
    const [lightboxIndex, setLightboxIndex] = useState(0);
    const panelRef = useRef<HTMLDivElement>(null);

    // Reset category on open
    useEffect(() => {
        if (isOpen) setActiveCategory('全部');
    }, [isOpen]);

    // Filtered products
    const filtered =
        activeCategory === '全部'
            ? step1Products
            : step1Products.filter(p => p.category === activeCategory);

    const openLightbox = (product: Step1Product) => {
        const ui = product.group.uiConfig as any;
        const imgs: string[] = [];
        if (product.group.thumbnail) imgs.push(product.group.thumbnail);
        if (Array.isArray(ui?.descriptionImages)) imgs.push(...ui.descriptionImages);
        else if (ui?.descriptionImage) imgs.push(ui.descriptionImage);
        if (imgs.length === 0) return;
        setLightboxImages(imgs);
        setLightboxIndex(0);
    };

    const closeLightbox = () => setLightboxImages([]);

    const allTabs = ['全部', ...categories];

    if (!isOpen) return null;

    return (
        <>
            {/* Overlay (mobile) */}
            <div className="ppb-prev-overlay" onClick={onClose} aria-hidden="true" />

            {/* Panel */}
            <div
                ref={panelRef}
                className={`ppb-prev-panel${isOpen ? ' ppb-prev-panel--open' : ''}`}
                role="dialog"
                aria-label="商品預覽"
            >
                {/* Header */}
                <div className="ppb-prev-header">
                    <div className="ppb-prev-header__left">
                        <ShoppingBag size={16} className="ppb-prev-header__icon" />
                        <div>
                            <h3 className="ppb-prev-header__title">支援商品</h3>
                            {productName && (
                                <p className="ppb-prev-header__sub">{productName}</p>
                            )}
                        </div>
                    </div>
                    <button className="ppb-prev-header__close" onClick={onClose} aria-label="關閉">
                        <X size={16} />
                    </button>
                </div>

                {/* Category Tabs */}
                {allTabs.length > 1 && !loading && (
                    <div className="ppb-prev-tabs">
                        {allTabs.map(tab => (
                            <button
                                key={tab}
                                className={`ppb-prev-tab${activeCategory === tab ? ' ppb-prev-tab--active' : ''}`}
                                onClick={() => setActiveCategory(tab)}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                )}

                {/* Content */}
                <div className="ppb-prev-content">
                    {loading && (
                        <div className="ppb-prev-grid">
                            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
                        </div>
                    )}

                    {!loading && error && (
                        <div className="ppb-prev-empty">
                            <p>{error}</p>
                        </div>
                    )}

                    {!loading && !error && filtered.length === 0 && (
                        <div className="ppb-prev-empty">
                            <ShoppingBag size={36} className="ppb-prev-empty__icon" />
                            <p>此型號暫無可用商品</p>
                        </div>
                    )}

                    {!loading && !error && filtered.length > 0 && (
                        <>
                            <div className="ppb-prev-count">
                                共 <strong>{filtered.length}</strong> 款可訂製商品
                            </div>
                            <div className="ppb-prev-grid">
                                {filtered.map(p => (
                                    <ProductCard
                                        key={p.group.id}
                                        product={p}
                                        onClick={() => openLightbox(p)}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer hint */}
                <div className="ppb-prev-footer">
                    <p>完成設計後點「保存設計」即可選購</p>
                </div>
            </div>

            {/* Lightbox */}
            {lightboxImages.length > 0 && (
                <Lightbox
                    images={lightboxImages}
                    index={lightboxIndex}
                    onClose={closeLightbox}
                    onPrev={() => setLightboxIndex(i => (i - 1 + lightboxImages.length) % lightboxImages.length)}
                    onNext={() => setLightboxIndex(i => (i + 1) % lightboxImages.length)}
                />
            )}
        </>
    );
}
