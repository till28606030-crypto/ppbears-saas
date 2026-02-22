import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let client: SupabaseClient;

// Check if credentials are valid
const isValid = supabaseUrl && supabaseAnonKey;

if (!isValid) {
    console.warn('⚠️ Supabase credentials missing or invalid. Using Offline Mock Client to prevent errors.');

    // Mock Implementation for Offline Mode
    // Simple state container for the mock session
    let currentSession: any = null;
    const authListeners: Set<(event: string, session: any) => void> = new Set();

    const mockAuth = {
        getSession: async () => ({ data: { session: currentSession }, error: null }),

        onAuthStateChange: (callback: (event: string, session: any) => void) => {
            authListeners.add(callback);
            // Immediately fire with current state
            callback(currentSession ? 'SIGNED_IN' : 'SIGNED_OUT', currentSession);
            return { data: { subscription: { unsubscribe: () => authListeners.delete(callback) } } };
        },

        signInWithPassword: async ({ email }: { email: string }) => {
            // Create fake session
            const fakeUser = {
                id: 'mock-user-id-' + Math.random().toString(36).substr(2, 9),
                email: email || 'test@example.com',
                role: 'authenticated',
                aud: 'authenticated',
                created_at: new Date().toISOString()
            };

            currentSession = {
                access_token: 'mock-access-token',
                refresh_token: 'mock-refresh-token',
                expires_in: 3600,
                token_type: 'bearer',
                user: fakeUser
            };

            // Notify listeners
            authListeners.forEach(cb => cb('SIGNED_IN', currentSession));

            return { data: { session: currentSession, user: fakeUser }, error: null };
        },

        signUp: async ({ email }: { email: string }) => {
            // Auto-login on signup
            return mockAuth.signInWithPassword({ email });
        },

        signOut: async () => {
            currentSession = null;
            authListeners.forEach(cb => cb('SIGNED_OUT', null));
            return { error: null };
        },

        getUser: async () => ({ data: { user: currentSession?.user || null }, error: null }),
    };

    // @ts-ignore - Minimal mock to satisfy usage
    client = {
        auth: mockAuth,
        from: (table: string) => ({
            select: () => Promise.resolve({ data: [], error: null }),
            insert: () => Promise.resolve({ data: null, error: null }),
            update: () => Promise.resolve({ data: null, error: null }),
            delete: () => Promise.resolve({ data: null, error: null }),
            upload: () => Promise.resolve({ data: null, error: null }),
            getPublicUrl: () => ({ data: { publicUrl: '' } }),
        }),
        storage: {
            from: () => ({
                upload: () => Promise.resolve({ data: null, error: null }),
                getPublicUrl: () => ({ data: { publicUrl: '' } }),
            })
        },
        // Mock Realtime Channels to prevent crash
        channel: (name: string) => ({
            on: () => ({ subscribe: () => { } }),
            subscribe: () => { },
            unsubscribe: () => { },
        }),
        removeChannel: () => { },
        removeAllChannels: () => { },
    } as unknown as SupabaseClient;

} else {
    // [Fix] Trae Internal Browser AbortError Patch (Robust Version)

    // 1. Reliable Env Detection: Use Vite's standard DEV flag
    // This ensures the patch runs in ANY dev environment, including Trae's preview.
    const isDevEnv = import.meta.env.DEV;

    const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

    const stripSignal = async (input: any, init?: any) => {
        // Normalize input/init, and remove signal from BOTH init and Request input
        let url: any = input;
        let options: any = init ? { ...init } : {};

        // If input is a Request, reconstruct a fetch call WITHOUT reusing the Request (because it carries signal)
        if (typeof Request !== 'undefined' && input instanceof Request) {
            url = input.url;

            // Merge fields from Request into options only when not explicitly provided
            options.method = options.method ?? input.method;

            // Headers: combine request headers + init headers
            const mergedHeaders = new Headers(input.headers);
            if (options.headers) {
                const h = new Headers(options.headers);
                h.forEach((v, k) => mergedHeaders.set(k, v));
            }
            options.headers = mergedHeaders;

            // Body: only for non-GET/HEAD
            const method = (options.method || 'GET').toUpperCase();
            if (method !== 'GET' && method !== 'HEAD') {
                try {
                    // Safety: clone() might fail if body is already used
                    const ab = await input.clone().arrayBuffer();
                    // If init already has body, keep it; else use request body
                    options.body = options.body ?? ab;
                } catch (err) {
                    console.warn('[patchedFetch] Failed to clone request body:', err);
                    // Fallback: don't set body if clone fails (better than crashing)
                }
            }
        }

        // Remove signal if present
        if (options && 'signal' in options) {
            delete options.signal;
        }

        return { url, options };
    };

    const isAbortLike = (e: any) => {
        // Handle various error shapes
        const msg = e?.message ? String(e.message) : String(e);
        const name = e?.name ? String(e.name) : '';

        // Extensive checks for abort-like errors
        return name === 'AbortError' ||
            msg.includes('AbortError') ||
            msg.includes('ERR_ABORTED') ||
            msg.includes('signal is aborted') ||
            msg.includes('The user aborted a request');
    };

    const patchedFetch: typeof fetch = async (input: any, init?: any) => {
        // ALWAYS patch in this environment to prevent "signal is aborted without reason"

        // 1. Prepare request ONCE (extract body to buffer if needed) to allow safe retries
        // This avoids "body used already" errors if we need to retry
        let safeUrl, safeOptions;
        try {
            const result = await stripSignal(input, init);
            safeUrl = result.url;
            safeOptions = result.options;
        } catch (err) {
            console.warn('[patchedFetch] Failed to prepare request:', err);
            // If preparation fails, try raw fetch (likely to fail but better than swallowing)
            return fetch(input, init);
        }

        // 2. Attempt Fetch with Retry Logic
        try {
            return await fetch(safeUrl, safeOptions);
        } catch (e: any) {
            if (isAbortLike(e)) {
                // Retry once
                try {
                    // Use the SAME safeUrl/safeOptions which contains the buffered body
                    return await fetch(safeUrl, safeOptions);
                } catch (retryErr: any) {
                    // If it fails again, suppress it to prevent app crash
                    if (isAbortLike(retryErr)) {
                        console.warn('[patchedFetch] Request aborted or timed out after retry', retryErr);
                        throw new Error('網路連線不穩或請求超時，請檢查網路狀態後再試。');
                    }
                    throw retryErr;
                }
            }
            throw e;
        }
    };

    client = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
            storage: window.localStorage, // Force explicit localStorage
        },
        global: { fetch: patchedFetch },
    });

    // Debug Log for Dev
    // console.log(`[Supabase] Connected to ${supabaseUrl.substring(0, 20)}...`);
}

export const supabase = client;
