import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { User, Lock, Loader2, Mail, ShieldCheck, ArrowRight } from 'lucide-react';

export default function Register() {
    const navigate = useNavigate();
    const { register } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        setIsSubmitting(true);

        try {
            await register(email, password);
            setSuccessMessage('註冊成功！驗證信已發送，請前往您的信箱點擊連結以啟用帳號。');
        } catch (err: any) {
            setError(err.message || '註冊失敗，請稍後再試');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (successMessage) {
        return (
            <div className="min-h-screen w-full bg-[#f8f9fa] flex items-center justify-center p-4">
                <div className="bg-white/80 backdrop-blur-xl rounded-[32px] shadow-2xl w-full max-w-md p-10 text-center space-y-8 animate-in fade-in zoom-in-95 border border-white/40">
                    <div className="w-20 h-20 bg-green-50 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                        <Mail className="w-10 h-10 text-green-600" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-bold text-gray-900 mb-2">請驗證 Email</h2>
                        <p className="text-gray-500 leading-relaxed">
                            {successMessage}
                        </p>
                    </div>
                    <button
                        onClick={() => navigate('/login')}
                        className="w-full py-4 bg-black text-white rounded-2xl font-bold hover:bg-gray-900 transition-all shadow-lg"
                    >
                        前往登入
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full bg-[#f8f9fa] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Dynamic Background Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-500/5 rounded-full blur-[120px] animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-black/5 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>

            <div className="w-full max-w-[1100px] grid md:grid-cols-2 bg-white/80 backdrop-blur-xl rounded-[32px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-white/40 overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-700">

                {/* Left Side: Branding Info */}
                <div className="hidden md:flex flex-col justify-between p-12 bg-black text-white relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-red-600/20 to-transparent pointer-events-none"></div>

                    <div className="relative z-10">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full border border-white/10 text-xs font-medium tracking-wider mb-8">
                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></span>
                            SELLER REGISTRATION
                        </div>
                        <h2 className="text-4xl font-extrabold leading-tight mb-4">
                            加入 <span className="text-red-500">PPBears</span><br />
                            商業設計計畫
                        </h2>
                        <p className="text-gray-400 max-w-xs text-lg leading-relaxed">
                            開拓您的客製化市場。我們提供最完善的展示與生產管理系統。
                        </p>
                    </div>

                    <div className="relative z-10">
                        <div className="flex items-center gap-4 text-sm text-gray-400 font-medium">
                            <div className="w-10 h-10 rounded-full bg-red-600/20 flex items-center justify-center text-red-500">
                                <ShieldCheck className="w-5 h-5" />
                            </div>
                            <span>受 系統 安全防護保障</span>
                        </div>
                    </div>
                </div>

                {/* Right Side: Register Form */}
                <div className="p-8 md:p-12 lg:p-16 flex flex-col justify-center bg-white/40">
                    <div className="mb-10">
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">建立商家帳號</h1>
                        <p className="text-gray-500 font-medium">填寫下方資訊以開始您的商家之旅</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 ml-1">電子郵件</label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-red-500 transition-colors">
                                        <Mail className="w-5 h-5" />
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
                                <label className="text-sm font-semibold text-gray-700 ml-1">設定登入密碼</label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-red-500 transition-colors">
                                        <Lock className="w-5 h-5" />
                                    </div>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="block w-full pl-12 pr-4 py-4 bg-white border border-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-4 focus:ring-red-500/5 focus:border-red-500/50 transition-all shadow-sm"
                                        placeholder="至少 6 位字元"
                                        minLength={6}
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
                                    立即註冊
                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </span>
                            )}
                        </button>

                        <div className="text-center pt-2">
                            <p className="text-sm text-gray-500">
                                已經有帳號了？ <Link to="/login" className="text-black font-bold hover:underline">立即登入</Link>
                            </p>
                        </div>
                    </form>
                </div>
            </div>

            <div className="absolute bottom-6 left-0 right-0 text-center text-gray-400 text-xs font-medium tracking-wide">
                &copy; {new Date().getFullYear()} PPBears Custom SaaS. All rights reserved.
            </div>
        </div>
    );
}
