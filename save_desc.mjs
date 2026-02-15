import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase = createClient(
    'https://ilboytxdlydyrrdnwlon.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsYm95dHhkbHlkeXJyZG53bG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0NzQ4NjYsImV4cCI6MjA4NDA1MDg2Nn0.bPajkoWDXvYMEsHQ-8BVi_sAv6HHxSzVbAj_3cT_SOw'
);

async function checkDescription() {
    console.log('Fetching Step 3 Group Description...\n');

    const { data: group } = await supabase
        .from('option_groups')
        .select('*')
        .eq('id', 'grp_1771124073460')
        .single();

    if (group) {
        const desc = group.ui_config?.description;
        console.log('Ref: ', desc);
        fs.writeFileSync('raw_desc.txt', desc || '');
        console.log('Saved to raw_desc.txt');
    }
}

checkDescription();
