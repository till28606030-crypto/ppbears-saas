// Add Step 3 group to all products
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://ilboytxdlydyrrdnwlon.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsYm95dHhkbHlkeXJyZG53bG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0NzQ4NjYsImV4cCI6MjA4NDA1MDg2Nn0.bPajkoWDXvYMEsHQ-8BVi_sAv6HHxSzVbAj_3cT_SOw'
);

async function addStep3ToProducts() {
    console.log('Adding Step 3 group to products...\n');

    const step3GroupId = 'grp_1771124073460';

    // Get all active products
    const { data: products } = await supabase
        .from('products')
        .select('id, name, specs')
        .eq('is_active', true);

    for (const product of products || []) {
        const currentLinked = product.specs?.linked_option_groups || [];

        // Check if already has Step 3
        if (currentLinked.includes(step3GroupId)) {
            console.log(`✅ ${product.name} - Already has Step 3`);
            continue;
        }

        // Add Step 3 to the array
        const newLinked = [...currentLinked, step3GroupId];

        const { error } = await supabase
            .from('products')
            .update({
                specs: {
                    ...product.specs,
                    linked_option_groups: newLinked
                }
            })
            .eq('id', product.id);

        if (error) {
            console.error(`❌ ${product.name} - Error:`, error.message);
        } else {
            console.log(`✅ ${product.name} - Added Step 3 (${currentLinked.length} → ${newLinked.length} groups)`);
        }
    }

    console.log('\n✅ Done! Please refresh the frontend to see Step 3.');
}

addStep3ToProducts();
