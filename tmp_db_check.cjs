const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

(async () => {
    try {
        const { data: groups, error: gError } = await supabase.from('option_groups').select('*').ilike('name', '%數位修復%');
        if (gError) throw gError;
        console.log('Groups Found:', groups.length);
        console.log(JSON.stringify(groups, null, 2));

        if (groups && groups.length > 0) {
            const groupIds = groups.map(g => g.id);
            const { data: items, error: iError } = await supabase.from('option_items').select('*').in('parent_id', groupIds);
            if (iError) throw iError;
            console.log('Items Found:', items.length);
            console.log(JSON.stringify(items, null, 2));
        }
    } catch (err) {
        console.error('Error querying database:', err);
    }
})();
