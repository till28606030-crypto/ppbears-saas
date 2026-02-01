import { OptionGroup, OptionItem } from '../types';

export const toDbGroup = (group: OptionGroup) => ({
    id: group.id,
    code: group.code,
    name: group.name,
    price_modifier: group.priceModifier,
    matching_tags: group.matchingTags,
    thumbnail: group.thumbnail,
    sub_attributes: group.subAttributes || [], // Will need DB column
    ui_config: group.uiConfig,
    is_active: true
});

export const fromDbGroup = (record: any): OptionGroup => ({
    id: record.id,
    code: record.code,
    name: record.name,
    priceModifier: record.price_modifier,
    matchingTags: record.matching_tags || [],
    thumbnail: record.thumbnail,
    subAttributes: record.sub_attributes || [],
    uiConfig: record.ui_config || {}
});

export const toDbItem = (item: OptionItem) => ({
    id: item.id,
    parent_id: item.parentId,
    name: item.name,
    price_modifier: item.priceModifier,
    color_hex: item.colorHex,
    image_url: item.imageUrl,
    required_tags: item.requiredTags || [],
    is_active: true
});

export const fromDbItem = (record: any): OptionItem => ({
    id: record.id,
    parentId: record.parent_id,
    name: record.name,
    priceModifier: record.price_modifier,
    colorHex: record.color_hex,
    imageUrl: record.image_url,
    requiredTags: record.required_tags || []
});
