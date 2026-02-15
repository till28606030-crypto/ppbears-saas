import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://ilboytxdlydyrrdnwlon.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsYm95dHhkbHlkeXJyZG53bG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0NzQ4NjYsImV4cCI6MjA4NDA1MDg2Nn0.bPajkoWDXvYMEsHQ-8BVi_sAv6HHxSzVbAj_3cT_SOw'
);

async function findGroup() {
    console.log('Searching for group with description containing "創意pp熊"...');

    const { data: groups, error } = await supabase
        .from('option_groups')
        .select('*');

    if (error) {
        console.error(error);
        return;
    }

    const target = groups.find(g => {
        const desc = g.ui_config?.description || '';
        return desc.includes('創意pp熊');
    });

    if (target) {
        console.log('Found Group:', target.name, target.id);
        console.log('Display Type:', target.ui_config?.displayType);
        console.log('Ref Desc:', target.ui_config?.description.substring(0, 100));
    } else {
        console.log('Group not found.');
    }
}

findGroup();
