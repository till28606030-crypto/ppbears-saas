// Simple query to check what tables exist and create items
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://ilboytxdlydyrrdnwlon.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsYm95dHhkbHlkeXJyZG53bG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0NzQ4NjYsImV4cCI6MjA4NDA1MDg2Nn0.bPajkoWDXvYMEsHQ-8BVi_sAv6HHxSzVbAj_3cT_SOw'
);

async function checkAndCreateItems() {
    console.log('Checking existing items for Step 3...\n');

    const step3GroupId = 'grp_1771124073460';

    // First, check if table exists by trying to query
    try {
        const { data: existingItems, error: queryError } = await supabase
            .from('option_items')
            .select('*')
            .eq('parent_id', step3GroupId);

        if (queryError) {
            console.error('Table query error:', queryError);
            console.log('\n⚠️ Table might not exist or RLS is blocking access');
            console.log('Please create items manually through the admin UI');
            return;
        }

        console.log(`Current items count: ${existingItems?.length || 0}`);

        if (existingItems && existingItems.length > 0) {
            console.log('\nExisting items:');
            existingItems.forEach(item => {
                console.log(`  - ${item.name} (+$${item.price_modifier || 0})`);
            });
            return;
        }

        // Create items
        console.log('\n Creating new items...');
        const timestamp = Date.now();
        const items = [
            {
                id: `item_${timestamp}_1`,
                parent_id: step3GroupId,
                name: '不需要保護層',
                price_modifier: 0,
                is_active: true
            },
            {
                id: `item_${timestamp}_2`,
                parent_id: step3GroupId,
                name: '標準保護層',
                price_modifier: 200,
                is_active: true
            },
            {
                id: `item_${timestamp}_3`,
                parent_id: step3GroupId,
                name: '頂級保護層（強烈推薦）',
                price_modifier: 500,
                is_active: true
            }
        ];

        const { data, error } = await supabase
            .from('option_items')
            .insert(items)
            .select();

        if (error) {
            console.error('❌ Insert error:', error);
            console.log('\n📝 Manual creation required. Please add these items through admin UI:');
            items.forEach(item => {
                console.log(`  - ${item.name} (+$${item.price_modifier})`);
            });
            return;
        }

        console.log('✅ Successfully created:');
        data.forEach(item => {
            console.log(`  - ${item.name} (+$${item.price_modifier})`);
        });

    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

checkAndCreateItems();
