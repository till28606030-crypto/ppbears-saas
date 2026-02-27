/**
 * fix_and_complete_devilcase_groups.mjs
 * 修復 Devil Pro3 名稱並補齊其他3款殼種的完整中文資料
 * 策略：用 Supabase REST API (anon key) 先查詢，再用 PATCH 修改
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Prefer': 'return=representation'
};

// ─── Helper ──────────────────────────────────────────────────────────────────
function makeId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function makeAttr(name, options) {
    return {
        id: makeId('attr'),
        name,
        type: 'select',
        options: options.map(opt => {
            if (typeof opt === 'string') {
                return { id: makeId('optv'), name: opt, priceModifier: 0 };
            }
            return { id: makeId('optv'), name: opt.name, priceModifier: opt.priceModifier || 0 };
        }),
    };
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function query(table, params = '') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, { headers: { ...headers, 'Prefer': 'return=representation' } });
    return res.json();
}

async function patch(table, filter, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`PATCH ${table} failed: ${err}`);
    }
    return await res.json();
}

async function insert(table, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`INSERT ${table} failed: ${err}`);
    }
    return await res.json();
}

// ─── 共用顏色選項集合 ──────────────────────────────────────────────────────────
const FRAME_COLORS = [
    '透曜黑(永不發黃)', '迷霧黑', '冰川綠', '湖水綠', '玫瑰粉', '寶石藍', '金色', '透明'
];

const LENS_PRO3 = [
    { name: '黑色/斜面款', priceModifier: 0 },
    { name: '黑色/圓弧款', priceModifier: 0 },
    { name: '冰川綠/斜面款', priceModifier: 0 },
    { name: '冰川綠/圓弧款', priceModifier: 0 },
    { name: '鼠尾草綠/斜面款', priceModifier: 0 },
    { name: '鼠尾草綠/圓弧款', priceModifier: 0 },
    { name: '湖水綠/斜面款', priceModifier: 0 },
    { name: '玫瑰粉/斜面款', priceModifier: 0 },
    { name: '白色/斜面款', priceModifier: 0 },
    { name: '白色/圓弧款', priceModifier: 0 },
    { name: '金色/斜面款', priceModifier: 0 },
    { name: '宇宙橙/支架斜面款', priceModifier: 100 }, // +100 含支架
    { name: '鈦金/支架斜面款', priceModifier: 100 },  // +100 含支架
];

const LENS_STANDARD = [
    { name: '黑色/斜面款', priceModifier: 0 },
    { name: '黑色/圓弧款', priceModifier: 0 },
    { name: '湖水綠/斜面款', priceModifier: 0 },
    { name: '宇宙橙/斜面款', priceModifier: 0 },
    { name: '宇宙橙/支架斜面款', priceModifier: 100 }, // +100
    { name: '鼠尾草綠/斜面款', priceModifier: 0 },
    { name: '玫瑰粉/斜面款', priceModifier: 0 },
    { name: '白色/斜面款', priceModifier: 0 },
    { name: '金色/斜面款', priceModifier: 0 },
    { name: '鈦金/支架斜面款', priceModifier: 100 }, // +100
];

const BUTTON_COLORS = ['黑色', '白色', '金色', '玫瑰粉', '冰川綠', '湖水綠', '宇宙橙', '鼠尾草綠', '湛海藍', '透明', '櫻花粉'];

const ACTION_BUTTONS = [
    '黑色/平面款', '黑色/凸面款', '白色/平面款', '金色/平面款', '玫瑰粉/平面款',
    '冰川綠/平面款', '湖水綠/平面款', '宇宙橙/平面款', '鼠尾草綠/平面款',
    '湛海藍/平面款', '透明/平面款', '櫻花粉/平面款'
];

const CAMERA_BUTTONS = ['黑色', '白色', '金色', '玫瑰粉', '冰川綠', '湖水綠', '宇宙橙', '鼠尾草綠', '湛海藍', '透明', '櫻花粉'];

// ─── 四款殼種完整設定 ──────────────────────────────────────────────────────────
function buildSubAttributes(lensOptions) {
    return [
        makeAttr('外框', FRAME_COLORS),
        makeAttr('鏡頭造型', lensOptions),
        makeAttr('按鍵組', BUTTON_COLORS),
        makeAttr('動作按鍵', ACTION_BUTTONS),
        makeAttr('相機按鍵', CAMERA_BUTTONS),
    ];
}

const DEVILCASE_GROUPS_DATA = {
    pro3: {
        name: '惡魔防摔殼 PRO3',
        code: 'devilcase_pro3',
        price: 1490,
        aiKeywords: ['PRO3', 'PRO 3', 'Pro 3', '防摔殼 PRO', '惡魔防摔殼 PRO', '惡魔防摔殼 PRO 3'],
        subAttributes: buildSubAttributes(LENS_PRO3),
    },
    pro3_mag: {
        name: '惡魔防摔殼 PRO3 磁吸版',
        code: 'devilcase_pro3_mag',
        price: 1690,
        aiKeywords: ['PRO3 磁吸', 'PRO 3 磁吸版', '惡魔防摔殼 PRO 3 磁吸版', '防摔殼 PRO3 磁吸'],
        subAttributes: buildSubAttributes(LENS_PRO3),
    },
    standard: {
        name: '惡魔防摔殼 標準版',
        code: 'devilcase_standard',
        price: 1190,
        aiKeywords: ['標準版', 'Standard', '惡魔防摔殼 標準', '惡魔防摔殼標準版'],
        subAttributes: buildSubAttributes(LENS_STANDARD),
    },
    standard_mag: {
        name: '惡魔防摔殼 標準磁吸版',
        code: 'devilcase_standard_mag',
        price: 1190,
        aiKeywords: ['標準磁吸版', '惡魔防摔殼 標準磁吸', '惡魔防摔殼標準磁吸版'],
        subAttributes: buildSubAttributes(LENS_STANDARD),
    },
};

async function main() {
    console.log('🔍 查詢現有的 option_groups...\n');

    // 1. 查詢現有資料
    const existing = await query('option_groups', '?select=id,code,name&order=created_at.asc');
    console.log('現有大類：', existing.map(g => `${g.name} (${g.code})`).join(', '), '\n');

    // 2. 找到已建立的 Devil Pro3（英文名 or 找 code）
    const devPro3Existing = existing.find(g => g.name === 'Devil Pro3' || g.code === 'devilcase_pro3');

    // 3. 修復 Devil Pro3（如果存在）
    if (devPro3Existing) {
        console.log(`✏️ 修復 "${devPro3Existing.name}" → 惡魔防摔殼 PRO3`);
        const data = DEVILCASE_GROUPS_DATA.pro3;
        await patch('option_groups', `id=eq.${devPro3Existing.id}`, {
            name: data.name,
            code: data.code,
            price_modifier: data.price,
            sub_attributes: data.subAttributes,
            ui_config: {
                step: 1,
                displayType: 'cards',
                category: '惡魔殼',
                sortOrder: 1,
                categorySortOrder: 0,
                aiKeywords: data.aiKeywords,
            },
        });
        console.log('  ✅ 已修復 PRO3\n');
        await sleep(300);
    }

    // 4. 補齊其他 3 款
    const toCreate = [];
    for (const [key, data] of Object.entries(DEVILCASE_GROUPS_DATA)) {
        if (key === 'pro3' && devPro3Existing) continue; // 已修復
        const alreadyExists = existing.find(g => g.code === data.code || g.name === data.name);
        if (alreadyExists) {
            console.log(`⏭️ ${data.name} 已存在，跳過`);
            continue;
        }
        toCreate.push({ key, data });
    }

    for (const { key, data } of toCreate) {
        process.stdout.write(`➕ 新增：${data.name} (NT$${data.price})... `);
        await insert('option_groups', {
            id: makeId('grp'),
            code: data.code,
            name: data.name,
            price_modifier: data.price,
            thumbnail: null,
            sub_attributes: data.subAttributes,
            ui_config: {
                step: 1,
                displayType: 'cards',
                category: '惡魔殼',
                sortOrder: { pro3: 1, pro3_mag: 2, standard: 3, standard_mag: 4 }[key] || 5,
                categorySortOrder: 0,
                aiKeywords: data.aiKeywords,
            },
            is_active: true,
        });
        console.log('✅');
        await sleep(400);
    }

    console.log('\n─────────────────────────────────────');
    console.log('🎉 完成！請到後台確認：');
    console.log('   惡魔殼 分類下應有 4 款殼種');
    console.log('   每款各有 5 個附加選項（外框/鏡頭造型/按鍵組/動作按鍵/相機按鍵）');
    console.log('   鏡頭造型中含「支架」的選項: +NT$100');
}

main().catch(err => {
    console.error('❌ 執行失敗：', err.message);
    process.exit(1);
});
