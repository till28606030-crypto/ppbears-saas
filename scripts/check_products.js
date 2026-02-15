const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://ilboytxdlydyrrdnwlon.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsYm95dHhkbHlkeXJyZG53bG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0NzQ4NjYsImV4cCI6MjA4NDA1MDg2Nn0.bPajkoWDXvYMEsHQ-8BVi_sAv6HHxSzVbAj_3cT_SOw'
);

async function checkProducts() {
    // Get all products
    const { data: products, error } = await supabase
        .from('products')
        .select('id, name, specs')
        .limit(20);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('=== Products and their linked_option_groups ===\n');

    products.forEach(p => {
        const linkedGroups = p.specs?.linked_option_groups || [];
        console.log(`Product: ${p.name}`);
        console.log(`  ID: ${p.id}`);
        console.log(`  Linked Groups: ${JSON.stringify(linkedGroups)}`);
        console.log(`  Has Step 3 group: ${linkedGroups.includes('grp_1771124073460') ? 'YES ✅' : 'NO ❌'}`);
        console.log('');
    });
}

checkProducts();
