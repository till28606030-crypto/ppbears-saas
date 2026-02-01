-- Function to duplicate an option group and its items
create or replace function duplicate_option_group(source_group_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
    source_group record;
    new_group_id text;
    new_group_code text;
    new_group_name text;
    new_group_record record;
    item_record record;
begin
    -- 1. Get the source group
    select * into source_group from public.option_groups where id = source_group_id;
    
    if not found then
        raise exception 'Source group not found';
    end if;

    -- 2. Generate new ID and Code
    -- Format: grp_{timestamp}_{random} to match frontend style but ensure uniqueness
    new_group_id := 'grp_' || floor(extract(epoch from now()) * 1000)::text || '_' || floor(random() * 1000)::text;
    new_group_code := source_group.code || '_copy_' || floor(extract(epoch from now()))::text;
    new_group_name := source_group.name || ' (Copy)';

    -- 3. Insert new group
    insert into public.option_groups (
        id,
        code,
        name,
        price_modifier,
        matching_tags,
        thumbnail,
        ui_config,
        is_active,
        created_at
    ) values (
        new_group_id,
        new_group_code,
        new_group_name,
        source_group.price_modifier,
        source_group.matching_tags,
        source_group.thumbnail,
        source_group.ui_config,
        source_group.is_active,
        now()
    ) returning * into new_group_record;

    -- 4. Duplicate items
    for item_record in select * from public.option_items where parent_id = source_group_id loop
        insert into public.option_items (
            id,
            parent_id,
            name,
            price_modifier,
            color_hex,
            image_url,
            required_tags,
            is_active,
            created_at
        ) values (
            'itm_' || floor(extract(epoch from now()) * 1000)::text || '_' || floor(random() * 10000)::text, -- Generate new ID
            new_group_id,
            item_record.name,
            item_record.price_modifier,
            item_record.color_hex,
            item_record.image_url,
            item_record.required_tags,
            item_record.is_active,
            now()
        );
    end loop;

    -- 5. Return the new group as JSON
    return row_to_json(new_group_record)::jsonb;
end;
$$;
