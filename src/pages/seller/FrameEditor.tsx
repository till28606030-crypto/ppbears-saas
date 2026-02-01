import React, { useEffect, useRef, useState } from 'react';
import { Canvas, FabricImage, Circle, Line, Polygon } from 'fabric';
import { Upload, Save, ArrowLeft, Trash2, MousePointer2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { uploadToSupabase } from '@/lib/upload';

export interface FrameTemplate {
    id: string;
    name: string;
    imageUrl: string;
    clipPathPoints: { x: number; y: number }[];
    width: number;
    height: number;
    createdAt: number;
    category?: string;
    tags?: string[];
}

const FrameEditor = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const canvasEl = useRef<HTMLCanvasElement>(null);
    const fabricCanvas = useRef<Canvas | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
    const [tempLines, setTempLines] = useState<Line[]>([]);
    const [tempCircles, setTempCircles] = useState<Circle[]>([]);
    const [frameName, setFrameName] = useState('New Frame');
    const [isCanvasReady, setIsCanvasReady] = useState(false);
    const [existingFrameData, setExistingFrameData] = useState<any>(null);
    const activeLine = useRef<Line | null>(null);

    // Initialize Canvas
    useEffect(() => {
        if (!canvasEl.current) return;
        const canvas = new Canvas(canvasEl.current, {
            width: 800,
            height: 600,
            backgroundColor: '#f3f4f6',
            selection: false // Disable selection while drawing
        });
        fabricCanvas.current = canvas;
        setIsCanvasReady(true);

        // Resize observer
        const resizeCanvas = () => {
            if (canvasEl.current?.parentElement) {
                const { clientWidth, clientHeight } = canvasEl.current.parentElement;
                canvas.setDimensions({ width: clientWidth, height: clientHeight });
            }
        };
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            canvas.dispose();
        };
    }, []);

    // Load existing frame data
    useEffect(() => {
        if (!id || id === 'new' || !isCanvasReady || !fabricCanvas.current) return;
        
        let isMounted = true;

        const loadFrame = async () => {
            try {
                const { data, error } = await supabase
                    .from('assets')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (error) throw error;
                if (!isMounted || !data) return;

                setExistingFrameData(data);
                setFrameName(data.name || 'Untitled Frame');
                setImageUrl(data.url);
                
                const canvas = fabricCanvas.current;
                if (!canvas) return;

                canvas.clear();
                setPoints([]);

                try {
                    const img = await FabricImage.fromURL(data.url, { crossOrigin: 'anonymous' });
                    if (!isMounted) return;

                    // Scale image to fit canvas with padding
                    const padding = 40;
                    const availW = canvas.width - padding * 2;
                    const availH = canvas.height - padding * 2;
                    const scale = Math.min(availW / (img.width || 1), availH / (img.height || 1));
                    
                    img.scale(scale);
                    img.set({
                        left: canvas.width / 2,
                        top: canvas.height / 2,
                        originX: 'center',
                        originY: 'center',
                        selectable: false,
                        evented: false,
                        opacity: 0.8
                    });
                    
                    canvas.add(img);

                    // Restore Points from metadata
                    const clipPoints = data.metadata?.clipPathPoints;
                    if (clipPoints && Array.isArray(clipPoints)) {
                        const center = img.getCenterPoint();
                        const restoredPoints = clipPoints.map((p: any) => ({
                            x: p.x * (img.scaleX || 1) + center.x,
                            y: p.y * (img.scaleY || 1) + center.y
                        }));
                        
                        setPoints(restoredPoints);

                        // Draw Polygon
                        const polygon = new Polygon(restoredPoints, {
                            fill: 'rgba(255, 0, 0, 0.3)',
                            stroke: 'red',
                            strokeWidth: 2,
                            selectable: false,
                            evented: false,
                            objectCaching: false
                        });
                        
                        canvas.add(polygon);
                    }
                    
                    canvas.requestRenderAll();
                } catch (imgError) {
                    console.error("Failed to load image from URL", imgError);
                }
            } catch (error) {
                console.error("Failed to load frame:", error);
                alert("無法載入相框資料");
                navigate('/seller/frames');
            }
        };

        loadFrame();

        return () => {
            isMounted = false;
        };
    }, [id, isCanvasReady, navigate]);

    // Handle Image Upload
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !fabricCanvas.current) return;

        setSelectedFile(file);

        const reader = new FileReader();
        reader.onload = async (f) => {
            const dataUrl = f.target?.result as string;
            setImageUrl(dataUrl);
            
            const canvas = fabricCanvas.current!;
            canvas.clear();
            setPoints([]); // Reset points

            const img = await FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' });
            
            // Scale image to fit canvas with padding
            const padding = 40;
            const availW = canvas.width - padding * 2;
            const availH = canvas.height - padding * 2;
            const scale = Math.min(availW / (img.width || 1), availH / (img.height || 1));
            
            img.scale(scale);
            img.set({
                left: canvas.width / 2,
                top: canvas.height / 2,
                originX: 'center',
                originY: 'center',
                selectable: false,
                evented: false, // Let clicks pass through for drawing? No, we need clicks on canvas
                opacity: 0.8 // Dim slightly to make red lines visible
            });
            
            canvas.add(img);
            canvas.requestRenderAll();
        };
        reader.readAsDataURL(file);
    };

    // Drawing Logic
    useEffect(() => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        const handleMouseDown = (opt: any) => {
            if (!isDrawing || !imageUrl) return;
            
            const pointer = canvas.getScenePoint(opt.e);
            const x = pointer.x;
            const y = pointer.y;

            // Check if closing loop (near first point)
            if (points.length > 2) {
                const first = points[0];
                const dist = Math.sqrt(Math.pow(x - first.x, 2) + Math.pow(y - first.y, 2));
                if (dist < 20) {
                    finishDrawing();
                    return;
                }
            }

            // Add Point
            const newPoint = { x, y };
            setPoints(prev => [...prev, newPoint]);

            // Visuals: Add Circle Marker
            const circle = new Circle({
                left: x,
                top: y,
                radius: 4,
                fill: 'red',
                originX: 'center',
                originY: 'center',
                selectable: false,
                evented: false
            });
            canvas.add(circle);
            setTempCircles(prev => [...prev, circle]);

            // Visuals: Add Line from prev point
            if (points.length > 0) {
                const prev = points[points.length - 1];
                const line = new Line([prev.x, prev.y, x, y], {
                    stroke: 'red',
                    strokeWidth: 2,
                    selectable: false,
                    evented: false
                });
                canvas.add(line);
                setTempLines(prev => [...prev, line]);
            }
        };

        const handleMouseMove = (opt: any) => {
            if (!isDrawing || points.length === 0) return;
            
            const pointer = canvas.getScenePoint(opt.e);
            
            // Render "active" line following cursor
            if (activeLine.current) {
                canvas.remove(activeLine.current);
            }
            
            const prev = points[points.length - 1];
            activeLine.current = new Line([prev.x, prev.y, pointer.x, pointer.y], {
                stroke: 'red',
                strokeWidth: 1,
                strokeDashArray: [5, 5],
                selectable: false,
                evented: false,
                opacity: 0.6
            });
            canvas.add(activeLine.current);
            canvas.requestRenderAll();
        };

        canvas.on('mouse:down', handleMouseDown);
        canvas.on('mouse:move', handleMouseMove);

        return () => {
            canvas.off('mouse:down', handleMouseDown);
            canvas.off('mouse:move', handleMouseMove);
        };
    }, [isDrawing, points, imageUrl]);

    const finishDrawing = () => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        setIsDrawing(false);
        if (activeLine.current) {
            canvas.remove(activeLine.current);
            activeLine.current = null;
        }

        // Create Final Polygon
        const polygon = new Polygon(points, {
            fill: 'rgba(255, 0, 0, 0.3)',
            stroke: 'red',
            strokeWidth: 2,
            selectable: false,
            evented: false,
            objectCaching: false
        });
        
        // Remove temp guides
        tempLines.forEach(l => canvas.remove(l));
        tempCircles.forEach(c => canvas.remove(c));
        setTempLines([]);
        setTempCircles([]);
        
        canvas.add(polygon);
        canvas.requestRenderAll();
    };

    const resetDrawing = () => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        setIsDrawing(false);
        setPoints([]);
        
        // Remove all lines/circles/polygons but keep image
        const objects = canvas.getObjects();
        objects.forEach(obj => {
            if (obj.type !== 'image') {
                canvas.remove(obj);
            }
        });
        
        if (activeLine.current) {
            activeLine.current = null;
        }
        
        canvas.requestRenderAll();
    };

    const saveFrame = async () => {
        if (!imageUrl || points.length < 3) {
            alert("請先上傳圖片並繪製完整的裁切區域");
            return;
        }

        const canvas = fabricCanvas.current;
        const imgObj = canvas?.getObjects().find(o => o.type === 'image');
        if (!imgObj) return;

        try {
            // 1. Upload Image to Supabase if a new file is selected
            let finalUrl = imageUrl;
            if (selectedFile) {
                const uploadedUrl = await uploadToSupabase(selectedFile, 'assets', 'frames');
                if (!uploadedUrl) return; // Error handled in uploadToSupabase
                finalUrl = uploadedUrl;
            } else if (!finalUrl.startsWith('http')) {
                // Should not happen if loading from DB, but safe check for DataURL without file
                alert("請重新上傳圖片");
                return;
            }

            // 2. Normalize points
            const center = imgObj.getCenterPoint();
            const normalizedPoints = points.map(p => ({
                x: (p.x - center.x) / (imgObj.scaleX || 1),
                y: (p.y - center.y) / (imgObj.scaleY || 1)
            }));

            // 3. Prepare DB Record
            const metadata = {
                clipPathPoints: normalizedPoints,
                width: imgObj.width,
                height: imgObj.height
            };

            const assetData = {
                name: frameName,
                url: finalUrl,
                type: 'frame',
                metadata: metadata,
                category: existingFrameData?.category || '未分類',
                tags: existingFrameData?.tags || []
            };

            // 4. Upsert to Supabase
            if (id && id !== 'new') {
                const { error } = await supabase
                    .from('assets')
                    .update(assetData)
                    .eq('id', id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('assets')
                    .insert(assetData);
                if (error) throw error;
            }

            alert('相框儲存成功！');
            navigate('/seller/frames');

        } catch (err: any) {
            console.error("Save failed:", err);
            alert('儲存失敗: ' + err.message);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-white">
            {/* Header */}
            <div className="h-16 border-b border-gray-200 flex items-center justify-between px-6">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/seller/frames')} className="p-2 hover:bg-gray-100 rounded-full">
                        <ArrowLeft className="w-6 h-6 text-gray-600" />
                    </button>
                    <h1 className="text-xl font-bold text-gray-800">異型相框編輯器</h1>
                </div>
                <div className="flex items-center gap-4">
                    <input 
                        type="text" 
                        value={frameName} 
                        onChange={e => setFrameName(e.target.value)}
                        className="border border-gray-300 rounded px-3 py-1.5 text-sm"
                        placeholder="Frame Name"
                    />
                    <button onClick={saveFrame} className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800">
                        <Save className="w-4 h-4" />
                        儲存相框
                    </button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <div className="w-64 border-r border-gray-200 p-4 flex flex-col gap-4 bg-gray-50">
                    <div className="p-4 bg-white rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-blue-50 hover:border-blue-400 transition-colors relative">
                        <Upload className="w-8 h-8 text-gray-400" />
                        <span className="text-sm text-gray-600 font-medium">上傳相框圖片 (PNG)</span>
                        <input type="file" accept="image/png" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                    </div>

                    {imageUrl && (
                        <div className="flex flex-col gap-2">
                            <h3 className="text-sm font-bold text-gray-700">工具</h3>
                            
                            <button 
                                onClick={() => setIsDrawing(!isDrawing)} 
                                className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium transition-colors ${isDrawing ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-white border border-gray-200 hover:bg-gray-50'}`}
                            >
                                <MousePointer2 className="w-4 h-4" />
                                {isDrawing ? '停止繪製' : '開始繪製區域'}
                            </button>

                            {points.length > 0 && (
                                <button 
                                    onClick={resetDrawing} 
                                    className="flex items-center gap-2 p-3 rounded-lg text-sm font-medium bg-white border border-gray-200 hover:bg-red-50 hover:text-red-600 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    重設區域
                                </button>
                            )}

                            <div className="mt-4 text-xs text-gray-500 bg-blue-50 p-3 rounded border border-blue-100">
                                <p className="font-bold mb-1">操作說明：</p>
                                <ul className="list-disc pl-4 space-y-1">
                                    <li>點擊「開始繪製」。</li>
                                    <li>在畫面中點擊以新增連接點。</li>
                                    <li>紅色線條代表裁切邊界。</li>
                                    <li>點擊「起始點」以封閉區域。</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>

                {/* Canvas Area */}
                <div className="flex-1 bg-gray-100 relative flex items-center justify-center p-8">
                    <div className="shadow-lg bg-white">
                        <canvas ref={canvasEl} />
                    </div>
                    {!imageUrl && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="text-gray-400 text-center">
                                <Upload className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                <p>請先上傳圖片</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FrameEditor;
