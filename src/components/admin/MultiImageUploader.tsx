import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, X, Image as ImageIcon, ZoomIn, ChevronLeft, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface MultiImageUploaderProps {
    images: string[];
    onChange: (images: string[]) => void;
    maxFiles?: number;
    maxSizeMB?: number; // Default 5MB
    bucket?: 'assets' | 'models';
}

export default function MultiImageUploader({ 
    images = [], 
    onChange, 
    maxFiles = 20, 
    maxSizeMB = 5,
    bucket = 'models'
}: MultiImageUploaderProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Lightbox State
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const isDraggingImage = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        processFiles(files);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            processFiles(files);
        }
    };

    const processFiles = async (files: File[]) => {
        setError(null);
        const validFiles: File[] = [];
        
        // Validate
        for (const file of files) {
            if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
                setError('僅支援 JPG, PNG, GIF, WebP 格式');
                return;
            }
            if (file.size > maxSizeMB * 1024 * 1024) {
                setError(`檔案 ${file.name} 超過大小限制 (${maxSizeMB}MB)`);
                return;
            }
            validFiles.push(file);
        }

        if (images.length + validFiles.length > maxFiles) {
            setError(`最多只能上傳 ${maxFiles} 張圖片`);
            return;
        }

        if (validFiles.length === 0) return;

        // Simulate Upload
        setUploading(true);
        setProgress(0);

        const newImages: string[] = [];
        let completed = 0;

        for (const file of validFiles) {
            try {
                // Upload to Supabase
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
                const filePath = `${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from(bucket)
                    .upload(filePath, file);

                if (uploadError) {
                    console.error('Upload Error Details:', {
                        message: uploadError.message,
                        statusCode: (uploadError as any).statusCode,
                        error: uploadError
                    });
                    throw uploadError;
                }

                const { data } = supabase.storage
                    .from(bucket)
                    .getPublicUrl(filePath);

                newImages.push(data.publicUrl);
                completed++;
                setProgress((completed / validFiles.length) * 100);
            } catch (err: any) {
                console.error('Upload error', err);
                const msg = err.message || 'Unknown Error';
                setError(`圖片上傳失敗: ${file.name} (${msg})`);
            }
        }

        onChange([...images, ...newImages]);
        setUploading(false);
        setProgress(0);
        
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeImage = (index: number) => {
        const newImages = [...images];
        newImages.splice(index, 1);
        onChange(newImages);
    };

    // --- Lightbox Handlers ---
    const openLightbox = (index: number) => {
        setLightboxIndex(index);
        setZoomLevel(1);
        setPan({ x: 0, y: 0 });
    };

    const closeLightbox = () => {
        setLightboxIndex(null);
    };

    const nextImage = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (lightboxIndex !== null && lightboxIndex < images.length - 1) {
            setLightboxIndex(lightboxIndex + 1);
            setZoomLevel(1);
            setPan({ x: 0, y: 0 });
        }
    };

    const prevImage = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (lightboxIndex !== null && lightboxIndex > 0) {
            setLightboxIndex(lightboxIndex - 1);
            setZoomLevel(1);
            setPan({ x: 0, y: 0 });
        }
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (lightboxIndex === null) return;
        const delta = e.deltaY * -0.001;
        setZoomLevel(prev => Math.min(Math.max(0.5, prev + delta), 4));
    };

    // Pan Handlers
    const handleMouseDown = (e: React.MouseEvent) => {
        if (zoomLevel > 1) {
            isDraggingImage.current = true;
            lastMousePos.current = { x: e.clientX, y: e.clientY };
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDraggingImage.current && zoomLevel > 1) {
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;
            setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            lastMousePos.current = { x: e.clientX, y: e.clientY };
        }
    };

    const handleMouseUp = () => {
        isDraggingImage.current = false;
    };

    // Keyboard Navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (lightboxIndex === null) return;
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowRight') nextImage();
            if (e.key === 'ArrowLeft') prevImage();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [lightboxIndex, images.length]);

    return (
        <div className="space-y-4">
            {/* Upload Area */}
            <div
                className={`border-2 border-dashed rounded-xl p-8 transition-all text-center cursor-pointer ${
                    isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/png, image/jpeg, image/gif, image/webp"
                    className="hidden"
                    onChange={handleFileSelect}
                />
                
                <div className="flex flex-col items-center gap-3">
                    <div className="p-3 bg-white rounded-full shadow-sm">
                        <Upload className={`w-6 h-6 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
                    </div>
                    <div>
                        <p className="font-bold text-gray-700">點擊或拖放圖片至此</p>
                        <p className="text-xs text-gray-400 mt-1">支援 JPG, PNG, GIF, WebP (單檔 &lt; {maxSizeMB}MB)</p>
                    </div>
                </div>

                {uploading && (
                    <div className="mt-4 max-w-xs mx-auto">
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-blue-600 font-medium">上傳中...</span>
                            <span className="text-gray-500">{Math.round(progress)}%</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-blue-500 transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                )}

                {error && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-red-500 text-sm bg-red-50 p-2 rounded-lg">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                    </div>
                )}
            </div>

            {/* Gallery Grid */}
            {images.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {images.map((src, idx) => (
                        <div 
                            key={idx} 
                            className="group relative aspect-square bg-gray-100 rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-all hover:border-blue-300"
                        >
                            <img 
                                src={src} 
                                alt={`Uploaded ${idx + 1}`} 
                                className="w-full h-full object-contain"
                                loading="lazy"
                            />
                            
                            {/* Overlay */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                                <button
                                    onClick={(e) => { e.stopPropagation(); openLightbox(idx); }}
                                    className="p-2 bg-white rounded-full text-gray-700 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                    title="放大檢視"
                                >
                                    <ZoomIn className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                                    className="p-2 bg-white rounded-full text-gray-700 hover:text-red-600 hover:bg-red-50 transition-colors"
                                    title="刪除"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* File Name (Simulated since we might only have dataURL) */}
                            <div className="absolute bottom-0 inset-x-0 bg-black/60 p-1 text-center">
                                <p className="text-[10px] text-white truncate px-1">
                                    IMG_{idx + 1}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Lightbox Modal */}
            {lightboxIndex !== null && (
                <div 
                    className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center animate-in fade-in duration-200"
                    onClick={closeLightbox}
                >
                    {/* Toolbar */}
                    <div className="absolute top-0 inset-x-0 p-4 flex justify-between items-center text-white z-10 bg-gradient-to-b from-black/50 to-transparent">
                        <span className="font-mono text-sm">
                            {lightboxIndex + 1} / {images.length}
                        </span>
                        <div className="flex gap-4">
                            <button 
                                onClick={(e) => { e.stopPropagation(); setZoomLevel(prev => prev + 0.5); }}
                                className="hover:text-gray-300"
                            >
                                +
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setZoomLevel(prev => Math.max(0.5, prev - 0.5)); }}
                                className="hover:text-gray-300"
                            >
                                -
                            </button>
                            <button onClick={closeLightbox} className="hover:text-gray-300">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </div>

                    {/* Navigation */}
                    {lightboxIndex > 0 && (
                        <button 
                            className="absolute left-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white z-10"
                            onClick={prevImage}
                        >
                            <ChevronLeft className="w-8 h-8" />
                        </button>
                    )}
                    
                    {lightboxIndex < images.length - 1 && (
                        <button 
                            className="absolute right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white z-10"
                            onClick={nextImage}
                        >
                            <ChevronRight className="w-8 h-8" />
                        </button>
                    )}

                    {/* Image Container */}
                    <div 
                        className="w-full h-full flex items-center justify-center overflow-hidden"
                        onWheel={handleWheel}
                    >
                        <img 
                            src={images[lightboxIndex]} 
                            alt="Lightbox" 
                            className="max-w-none transition-transform duration-100 ease-out"
                            style={{ 
                                transform: `scale(${zoomLevel}) translate(${pan.x / zoomLevel}px, ${pan.y / zoomLevel}px)`,
                                cursor: zoomLevel > 1 ? (isDraggingImage.current ? 'grabbing' : 'grab') : 'default',
                                maxHeight: '90vh',
                                maxWidth: '90vw',
                                objectFit: 'contain'
                            }}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                            onClick={(e) => e.stopPropagation()}
                            draggable={false}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}