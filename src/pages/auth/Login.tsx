import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { User, Lock, Loader2, ShieldCheck, ArrowRight } from 'lucide-react';

export default function Login() {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            await login(email, password);
            navigate('/seller/products');
        } catch (err: any) {
            console.error('[Login] Error:', err);
            if (err.message.includes("Email not confirmed")) {
                setError('您的帳號尚未啟用，請檢查信箱。');
            } else {
                setError('登入失敗，請檢查帳號密碼。');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen w-full bg-[#f8f9fa] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Dynamic Background Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-500/5 rounded-full blur-[120px] animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-black/5 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>

            <div className="w-full max-w-[1100px] grid md:grid-cols-2 bg-white/80 backdrop-blur-xl rounded-[32px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-white/40 overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-700">

                {/* Left Side: Branding & Info */}
                <div className="hidden md:flex flex-col justify-between p-12 bg-black text-white relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-red-600/20 to-transparent pointer-events-none"></div>

                    <div className="relative z-10">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full border border-white/10 text-xs font-medium tracking-wider mb-8">
                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></span>
                            SELLER CENTER
                        </div>
                        <h2 className="text-4xl font-extrabold leading-tight mb-4">
                            管理您的 <span className="text-red-500">PPBears</span><br />
                            商業設計
                        </h2>
                        <p className="text-gray-400 max-w-xs text-lg leading-relaxed">
                            歡迎回到商家中心。這裡提供最直觀的設計管理工具，助力您的品牌成長。
                        </p>
                    </div>

                    <div className="relative z-10 mt-12">
                        <div className="flex -space-x-3 mb-4">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="w-10 h-10 rounded-full border-2 border-black bg-gray-800 flex items-center justify-center overflow-hidden">
                                    <img src={`https://i.pravatar.cc/100?u=${i}`} alt="user" className="w-full h-full object-cover grayscale" />
                                </div>
                            ))}
                            <div className="w-10 h-10 rounded-full border-2 border-black bg-red-600 flex items-center justify-center text-[10px] font-bold">
                                +50
                            </div>
                        </div>
                        <p className="text-sm text-gray-400 font-medium">已有超過 50 位設計師加入</p>
                    </div>
                </div>

                {/* Right Side: Login Form */}
                <div className="p-8 md:p-12 lg:p-16 flex flex-col justify-center bg-white/40">
                    <div className="mb-10">
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">商家登入</h1>
                        <p className="text-gray-500 font-medium">請輸入您的商家憑證以繼續</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 ml-1">電子郵件</label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-red-500 transition-colors">
                                        <User className="w-5 h-5" />
                                    </div>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="block w-full pl-12 pr-4 py-4 bg-white border border-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-4 focus:ring-red-500/5 focus:border-red-500/50 transition-all shadow-sm"
                                        placeholder="name@company.com"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between ml-1">
                                    <label className="text-sm font-semibold text-gray-700">登入密碼</label>
                                    <button type="button" className="text-xs font-bold text-red-600 hover:text-red-700 transition-colors">
                                        忘記密碼？
                                    </button>
                                </div>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-red-500 transition-colors">
                                        <Lock className="w-5 h-5" />
                                    </div>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="block w-full pl-12 pr-4 py-4 bg-white border border-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-4 focus:ring-red-500/5 focus:border-red-500/50 transition-all shadow-sm"
                                        placeholder="••••••••"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-sm font-bold flex items-center gap-3 animate-in slide-in-from-top-2">
                                <ShieldCheck className="w-5 h-5 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full flex items-center justify-center py-4 px-6 bg-black text-white rounded-2xl font-bold text-lg hover:bg-gray-900 focus:outline-none focus:ring-4 focus:ring-red-500/10 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.2)] transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group"
                        >
                            {isSubmitting ? (
                                <Loader2 className="w-6 h-6 animate-spin" />
                            ) : (
                                <span className="flex items-center gap-2">
                                    立即登入
                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </span>
                            )}
                        </button>

                        <div className="text-center pt-2">
                            <p className="text-sm text-gray-500">
                                還沒有帳號？ <a href="mailto:ppbears@ppbears.com" className="text-black font-bold hover:underline">聯繫管理員申請</a>
                            </p>
                        </div>
                    </form>
                </div>
            </div>

            {/* Attribution */}
            <div className="absolute bottom-6 left-0 right-0 text-center text-gray-400 text-xs font-medium tracking-wide">
                &copy; {new Date().getFullYear()} PPBears Custom SaaS. All rights reserved.
            </div>
        </div>
    );
}
