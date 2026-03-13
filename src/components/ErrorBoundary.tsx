/**
 * ErrorBoundary.tsx (#12)
 * Catches unhandled React rendering errors and shows a user-friendly fallback UI.
 * Wraps major route-level components to prevent the entire app from crashing.
 */
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    /** Optional custom fallback; defaults to the built-in error card. */
    fallback?: ReactNode;
    /** If true, shows a compact inline error instead of a full-page card. */
    inline?: boolean;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (!this.state.hasError) return this.props.children;
        if (this.props.fallback) return this.props.fallback;

        // Inline mode: compact banner for nested components
        if (this.props.inline) {
            return (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M4.93 4.93l14.14 14.14M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                    </svg>
                    <span>發生錯誤，請</span>
                    <button onClick={this.handleReset} className="underline font-medium hover:no-underline">
                        重試
                    </button>
                </div>
            );
        }

        // Full-page fallback
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-red-100 p-8 text-center">
                    {/* Icon */}
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
                        <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                    </div>

                    <h1 className="text-xl font-semibold text-gray-800 mb-2">哎呀，出了點問題</h1>
                    <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                        這個頁面發生了一個意外錯誤。您的設計資料不會遺失。
                    </p>

                    {/* Error detail (collapsed in production mood) */}
                    <details className="mb-6 text-left text-xs text-gray-400 bg-gray-50 rounded-lg p-3 cursor-pointer">
                        <summary className="font-medium text-gray-500 mb-1">技術細節</summary>
                        <code className="block mt-2 break-all whitespace-pre-wrap font-mono">
                            {this.state.error?.message ?? '未知錯誤'}
                        </code>
                    </details>

                    <div className="flex gap-3">
                        <button
                            onClick={this.handleReset}
                            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            重新嘗試
                        </button>
                        <button
                            onClick={() => window.location.reload()}
                            className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                        >
                            重新整理頁面
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
