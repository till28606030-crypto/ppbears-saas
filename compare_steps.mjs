// Re-investigate: Compare Step 1, 2, 3 configurations
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://ilboytxdlydyrrdnwlon.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsYm95dHhkbHlkeXJyZG53bG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0NzQ4NjYsImV4cCI6MjA4NDA1MDg2Nn0.bPajkoWDXvYMEsHQ-8BVi_sAv6HHxSzVbAj_3cT_SOw'
);

async function compareSteps() {
    console.log('=== Comparing Step 1, 2, 3 Configurations ===\n');

    // Get all groups
    const { data: groups } = await supabase
        .from('option_groups')
        .select('*')
        .order('ui_config->step');

    console.log('All Groups by Step:\n');

    const groupsByStep = {};
    groups?.forEach(g => {
        const step = g.ui_config?.step || 1;
        if (!groupsByStep[step]) groupsByStep[step] = [];
        groupsByStep[step].push(g);
    });

    for (const [step, stepGroups] of Object.entries(groupsByStep)) {
        console.log(`\n📌 Step ${step}:`);
        for (const group of stepGroups) {
            console.log(`  - ${group.name}`);
            console.log(`    ID: ${group.id}`);
            console.log(`    Code: ${group.code}`);
            console.log(`    ui_config: ${JSON.stringify(group.ui_config)}`);
        }
    }

    // Get products and their linked groups
    console.log('\n\n=== Product Linked Groups ===\n');
    const { data: products } = await supabase
        .from('products')
        .select('id, name, specs')
        .eq('is_active', true);

    for (const product of products || []) {
        const linkedGroups = product.specs?.linked_option_groups || [];
        console.log(`\n📦 ${product.name}`);
        console.log(`   Linked Groups (${linkedGroups.length}):`);

        for (const groupId of linkedGroups) {
            const group = groups?.find(g => g.id === groupId);
            if (group) {
                const step = group.ui_config?.step || '?';
                console.log(`     ✅ [Step ${step}] ${group.name}`);
            } else {
                console.log(`     ❌ ${groupId} (not found)`);
            }
        }

        // Check if Step 3 group is linked
        const step3GroupId = 'grp_1771124073460';
        const hasStep3 = linkedGroups.includes(step3GroupId);
        console.log(`   Has Step 3 linked: ${hasStep3 ? '✅ YES' : '❌ NO'}`);
    }
}

compareSteps();
