import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const isAbortError = (error: any) => {
    return (
        error?.name === 'AbortError' || 
        error?.message?.includes('AbortError') ||
        error?.toString().includes('AbortError')
    );
};

const isAuthSessionError = (err: any) => {
    return (
        err?.message?.includes('Invalid Refresh Token') ||
        err?.message?.includes('Refresh Token Not Found') ||
        err?.message?.includes('JWT expired')
    );
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // 1. Initial Session Check
        const initSession = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();
                if (error) throw error;
                
                setSession(session);
                setUser(session?.user ?? null);
                setIsAuthenticated(!!session);
            } catch (err: any) {
                // Ignore AbortError which is expected during HMR/Unmount
                if (isAbortError(err)) {
                    // console.log('Auth request aborted (expected)');
                } else if (isAuthSessionError(err)) {
                    // Handle invalid refresh token specifically
                    console.warn("Session expired or invalid refresh token. Clearing session.");
                    // Force clear local storage to prevent infinite loops
                    await supabase.auth.signOut().catch(() => {}); 
                    setSession(null);
                    setUser(null);
                    setIsAuthenticated(false);
                } else {
                    console.error("Auth initialization error:", err);
                }
                // Even on error, we must stop loading to show the UI (likely redirect to login)
            } finally {
                setIsLoading(false);
            }
        };

        initSession();

        // 2. Listen for Auth Changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            setIsAuthenticated(!!session);
            setIsLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const login = async (email: string, password: string) => {
        setIsLoading(true);
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                throw error;
            }
        } catch (error: any) {
            setIsLoading(false);
            if (isAbortError(error)) {
                // Ignore AbortError
                return;
            }
            throw error;
        }
    };

    const register = async (email: string, password: string) => {
        setIsLoading(true);
        try {
            const { error } = await supabase.auth.signUp({
                email,
                password,
            });

            if (error) {
                throw error;
            }
        } catch (error: any) {
            setIsLoading(false);
            if (isAbortError(error)) {
                // Ignore AbortError
                return;
            }
            throw error;
        }
        setIsLoading(false);
    };

    const logout = async () => {
        setIsLoading(true);
        try {
            await supabase.auth.signOut();
        } catch (error: any) {
            if (!isAbortError(error)) {
                console.error('Logout error:', error);
            }
        } finally {
            // Force cleanup local state even if server request fails
            setSession(null);
            setUser(null);
            setIsAuthenticated(false);
            setIsLoading(false);
        }
    };

    return (
        <AuthContext.Provider value={{ user, session, isAuthenticated, isLoading, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
