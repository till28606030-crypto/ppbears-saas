const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data, error } = await supabase.from('ai_usage_log').select('*').limit(1);
    console.log("Sample Data:", data, error);

    // Get column types from information_schema if possible (using RPC or direct query)
    // Actually we can just try inserting a full datetime string into usage_date in a test row
    const testRow = {
        ip: '0.0.0.0',
        usage_date: new Date().toISOString(),
        count: 0
    };
    const res = await supabase.from('ai_usage_log').upsert(testRow).select();
    console.log("Upsert with Time:", res.data, res.error);
}
check();
