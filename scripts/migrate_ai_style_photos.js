import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';

// Setup environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '../.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Running migration to add max_photos to ai_style_presets...');

  // Supabase JS doesn't have a direct raw SQL query string method on the client for DDL
  // We can use RPC if one exists, or alternatively simply do a direct patch/insert to see if it exists.
  // The easiest way is to use the supabase client to call a quick SQL function, or we can just send the command to create an SQL wrapper or use postgres directly if pg is installed.
  console.log('Instructions: we should run this in Supabase SQL editor directly if RPC fails.');
}

run();
