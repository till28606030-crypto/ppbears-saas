// Debug script - Check what's actually being loaded in SaveDesignModal
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://ilboytxdlydyrrdnwlon.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsYm95dHhkbHlkeXJyZG53bG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0NzQ4NjYsImV4cCI6MjA4NDA1MDg2Nn0.bPajkoWDXvYMEsHQ-8BVi_sAv6HHxSzVbAj_3cT_SOw'
);

async function debugCheckout() {
    console.log('=== Step 3 Debug Investigation ===\n');

    // 1. Check the Step 3 group configuration
    console.log('1. Checking Step 3 Group Configuration...');
    const { data: step3Group } = await supabase
        .from('option_groups')
        .select('*')
        .eq('id', 'grp_1771124073460')
        .single();

    console.log('Step 3 Group:');
    console.log('  Name:', step3Group?.name);
    console.log('  Step:', step3Group?.ui_config?.step);
    console.log('  Display Type:', step3Group?.ui_config?.displayType);
    console.log('');

    // 2. Check if this group has any items
    console.log('2. Checking Items for Step 3 Group...');
    const { data: items } = await supabase
        .from('option_items')
        .select('*')
        .eq('parent_id', 'grp_1771124073460');

    console.log(`  Items Count: ${items?.length || 0}`);
    if (items && items.length > 0) {
        items.forEach(item => {
            console.log(`    - ${item.name} (${item.id})`);
        });
    } else {
        console.log('  ⚠️ WARNING: No items found for Step 3 group!');
    }
    console.log('');

    // 3. Check all products and their linked groups
    console.log('3. Checking All Products...');
    const { data: products } = await supabase
        .from('products')
        .select('id, name, specs')
        .eq('is_active', true);

    const targetGroupId = 'grp_1771124073460';

    for (const product of products || []) {
        const linkedGroups = product.specs?.linked_option_groups || [];
        const hasStep3 = linkedGroups.includes(targetGroupId);

        console.log(`\n📦 ${product.name}`);
        console.log(`   ID: ${product.id}`);
        console.log(`   Linked Groups Count: ${linkedGroups.length}`);
        console.log(`   Linked Groups: ${JSON.stringify(linkedGroups, null, 2)}`);
        console.log(`   Has Step 3: ${hasStep3 ? '✅ YES' : '❌ NO'}`);

        if (hasStep3) {
            console.log('   🎯 This product should show Step 3!');
        }
    }

    console.log('\n=== Investigation Complete ===');
}

debugCheckout().catch(console.error);
