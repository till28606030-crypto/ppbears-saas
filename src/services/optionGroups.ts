import { supabase } from '../lib/supabase';
import { OptionGroup, OptionItem } from '../types';
import { normalizeOptionGroup } from '../utils/normalizeOptionGroup';
import { fromDbGroup, fromDbItem } from '../utils/dbMappers';

export async function loadOptionGroups(): Promise<OptionGroup[]> {
    try {
        console.log("[optionGroups] Loading from Supabase...");
        
        // 1. Fetch from Supabase
        const { data: dbGroups, error: errG } = await supabase.from('option_groups').select('*');
        const { data: dbItems, error: errI } = await supabase.from('option_items').select('*');

        if (errG) throw errG;
        if (errI) throw errI;

        const rawGroups = dbGroups ? dbGroups.map(fromDbGroup) : [];
        const rawItems = dbItems ? dbItems.map(fromDbItem) : [];

        // If DB is empty, return empty (NO DEFAULTS)
        if (rawGroups.length === 0) {
            console.log('loadOptionGroups: DB is empty. Returning empty array.');
            return [];
        }

        let groups = rawGroups.map(normalizeOptionGroup);

        // Hydrate "self-items" for groups that have no child items but have a price modifier
        let hydratedCount = 0;
        
        // @ts-ignore
        groups = groups.map(group => {
            // Check if this group has any child items in the DB
            const childItems = rawItems.filter(item => item.parentId === group.id);
            
            // If no child items AND the group itself has a price/modifier
            // We inject a "virtual" item so the UI can render it as a selectable option
            if (childItems.length === 0 && (group.priceModifier !== undefined || group.priceModifier !== null)) {
                // We create a virtual item that represents the group itself
                const selfItem: OptionItem = {
                    id: `${group.id}__self`,
                    parentId: group.id,
                    name: group.name, // Use group name as item name
                    priceModifier: group.priceModifier || 0,
                    imageUrl: group.thumbnail, // Use group thumbnail if available
                    // Inherit tags from group so it passes the same filters
                    requiredTags: group.matchingTags || [] 
                };
                
                hydratedCount++;
                return {
                    ...group,
                    items: [selfItem], // Inject virtual item
                    options: [selfItem]
                };
            }
            
            // Also attach child items if they exist (for convenience)
            if (childItems.length > 0) {
                return {
                    ...group,
                    items: childItems,
                    options: childItems
                };
            }
            
            return group;
        });

        console.log("[optionGroups] loaded groups count:", groups.length);
        return groups;

    } catch (err) {
        console.error('loadOptionGroups failed:', err);
        // On error, return empty array. NO DEFAULTS.
        return [];
    }
}
