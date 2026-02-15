// Simple query script to check product linked_option_groups
import { supabase } from './src/lib/supabase.ts';

async function main() {
    // Query products
    const { data, error } = await supabase
        .from('products')
        .select('id, name, specs')
        .limit(10);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('=== Products Configuration ===\n');
    const targetGroupId = 'grp_1771124073460'; // 保護圖層

    for (const product of data) {
        const linkedGroups = product.specs?.linked_option_groups || [];
        const hasStep3 = linkedGroups.includes(targetGroupId);

        console.log(`📦 ${product.name}`);
        console.log(`   ID: ${product.id}`);
        console.log(`   Linked Groups (${linkedGroups.length}): ${linkedGroups.slice(0, 3).join(', ')}${linkedGroups.length > 3 ? '...' : ''}`);
        console.log(`   Has Step 3 (保護圖層): ${hasStep3 ? '✅ YES' : '❌ NO'}`);
        console.log('');
    }
}

main();
