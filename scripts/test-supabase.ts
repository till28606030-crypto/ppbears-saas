import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase URL or Key in .env');
    process.exit(1);
}

console.log(`Connecting to ${supabaseUrl}...`);

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    try {
        console.log('1. Testing Connection (Select from option_groups)...');
        const { data, error } = await supabase.from('option_groups').select('count', { count: 'exact', head: true });
        
        if (error) {
            console.error('❌ Select failed:', error);
        } else {
            console.log('✅ Connection Successful!');
            console.log('   Data:', data);
        }

        console.log('2. Testing Storage (List buckets)...');
        const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
        
        if (bucketError) {
            console.error('❌ Storage failed:', bucketError);
        } else {
            console.log('✅ Storage Access Successful!');
            console.log('   Buckets:', buckets.map(b => b.name).join(', '));
        }

    } catch (err) {
        console.error('❌ Unexpected Error:', err);
    }
}

testConnection();
