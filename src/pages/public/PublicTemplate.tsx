import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Loader2, AlertCircle } from 'lucide-react';

export default function PublicTemplate() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchAndRedirect = async () => {
            if (!slug) return;

            try {
                // 1. Fetch Design
                const { data: design, error: fetchError } = await supabase
                    .from('designs')
                    .select('id, slug, is_published, default_context')
                    .eq('slug', slug)
                    .eq('is_published', true)
                    .single();

                if (fetchError || !design) {
                    setError("此模板不存在或尚未發布");
                    return;
                }

                // 2. Construct Redirect URL
                const params = new URLSearchParams();
                params.set('template_slug', slug);

                // 3. Apply Default Context
                if (design.default_context) {
                    const ctx = design.default_context as Record<string, any>;
                    Object.entries(ctx).forEach(([key, value]) => {
                        if (value) params.set(key, String(value));
                    });
                }

                // 4. Redirect to Designer
                navigate(`/?${params.toString()}`, { replace: true });

            } catch (err) {
                console.error("Template redirect error:", err);
                setError("載入模板時發生錯誤");
            }
        };

        fetchAndRedirect();
    }, [slug, navigate]);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-md w-full text-center space-y-4">
                    <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto">
                        <AlertCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-xl font-bold text-gray-900">無法載入模板</h1>
                    <p className="text-gray-500">{error}</p>
                    <button 
                        onClick={() => navigate('/')}
                        className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
                    >
                        前往首頁
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
            <p className="text-gray-500 font-medium">正在載入設計模板...</p>
        </div>
    );
}
