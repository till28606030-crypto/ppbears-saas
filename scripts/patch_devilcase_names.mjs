/**
 * patch_devilcase_names.mjs
 * 使用已知 Group IDs 和用戶 session token 修復名稱並補齊附加選項
 * 執行：node scripts/patch_devilcase_names.mjs <USER_SESSION_TOKEN>
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

// ── 用戶從瀏覽器 console 取得的 session token (傳入作為第一個參數) ──────────
const USER_TOKEN = process.argv[2];
if (!USER_TOKEN) {
    console.error('❌ 請傳入 session token 作為第一個參數：');
    console.error('   node scripts/patch_devilcase_names.mjs <TOKEN>');
    process.exit(1);
}

const AUTH_HEADER = `Bearer ${USER_TOKEN}`;
const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': AUTH_HEADER,
    'Prefer': 'return=minimal'
};

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

// ─── 共用顏色選項 ──────────────────────────────────────────────────────────────
const FRAME = ['透曜黑(永不發黃)', '迷霧黑', '冰川綠', '湖水綠', '玫瑰粉', '寶石藍', '金色', '透明'];

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
    { name: '宇宙橙/支架斜面款', priceModifier: 100 },
    { name: '鈦金/支架斜面款', priceModifier: 100 },
];

const LENS_STD = [
    { name: '黑色/斜面款', priceModifier: 0 },
    { name: '黑色/圓弧款', priceModifier: 0 },
    { name: '湖水綠/斜面款', priceModifier: 0 },
    { name: '宇宙橙/斜面款', priceModifier: 0 },
    { name: '宇宙橙/支架斜面款', priceModifier: 100 },
    { name: '鼠尾草綠/斜面款', priceModifier: 0 },
    { name: '玫瑰粉/斜面款', priceModifier: 0 },
    { name: '白色/斜面款', priceModifier: 0 },
    { name: '金色/斜面款', priceModifier: 0 },
    { name: '鈦金/支架斜面款', priceModifier: 100 },
];

const BTNS = ['黑色', '白色', '金色', '玫瑰粉', '冰川綠', '湖水綠', '宇宙橙', '鼠尾草綠', '湛海藍', '透明', '櫻花粉'];

const ACTION = [
    '黑色/平面款', '黑色/凸面款', '白色/平面款', '金色/平面款', '玫瑰粉/平面款',
    '冰川綠/平面款', '湖水綠/平面款', '宇宙橙/平面款', '鼠尾草綠/平面款',
    '湛海藍/平面款', '透明/平面款', '櫻花粉/平面款'
];

const CAM = ['黑色', '白色', '金色', '玫瑰粉', '冰川綠', '湖水綠', '宇宙橙', '鼠尾草綠', '湛海藍', '透明', '櫻花粉'];

function buildSubAttributes(lensOptions) {
    return [
        makeAttr('外框', FRAME),
        makeAttr('鏡頭造型', lensOptions),
        makeAttr('按鍵組', BTNS),
        makeAttr('動作按鍵', ACTION),
        makeAttr('相機按鍵', CAM),
    ];
}

// ─── 四款殼種（IDs 從瀏覽器 console 取得）────────────────────────────────────
const UPDATES = [
    {
        id: 'grp_1771856405129',
        name: '惡魔防摔殼 PRO3',
        code: 'devilcase_pro3',
        price: 1490,
        sortOrder: 1,
        aiKeywords: ['PRO3', 'PRO 3', 'Pro 3', '防摔殼 PRO', '惡魔防摔殼 PRO', '惡魔防摔殼 PRO 3'],
        lens: LENS_PRO3,
    },
    {
        id: 'grp_1772154287269',
        name: '惡魔防摔殼 PRO3 磁吸版',
        code: 'devilcase_pro3_mag',
        price: 1690,
        sortOrder: 2,
        aiKeywords: ['PRO3 磁吸', 'PRO 3 磁吸版', '惡魔防摔殼 PRO 3 磁吸版', '防摔殼 PRO3 磁吸'],
        lens: LENS_PRO3,
    },
    {
        id: 'grp_1772154397494',
        name: '惡魔防摔殼 標準版',
        code: 'devilcase_standard',
        price: 1190,
        sortOrder: 3,
        aiKeywords: ['標準版', 'Standard', '惡魔防摔殼 標準', '惡魔防摔殼標準版'],
        lens: LENS_STD,
    },
    {
        id: 'grp_1772154503135',
        name: '惡魔防摔殼 標準磁吸版',
        code: 'devilcase_standard_mag',
        price: 1190,
        sortOrder: 4,
        aiKeywords: ['標準磁吸版', '惡魔防摔殼 標準磁吸', '惡魔防摔殼標準磁吸版'],
        lens: LENS_STD,
    },
];

// ─── 同時刪除舊的 "Devil Pro3" 殼種 (ID: grp_1772152859147) ─────────────────
const OLD_DEVIL_PRO3_ID = 'grp_1772152859147';

async function patchGroup(update) {
    const body = {
        name: update.name,
        code: update.code,
        price_modifier: update.price,
        sub_attributes: buildSubAttributes(update.lens),
        ui_config: {
            step: 1,
            displayType: 'cards',
            category: '惡魔殼',
            sortOrder: update.sortOrder,
            categorySortOrder: 0,
            aiKeywords: update.aiKeywords,
        },
        is_active: true,
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/option_groups?id=eq.${update.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
    }
    return res.status;
}

async function deleteGroup(id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/option_groups?id=eq.${id}`, {
        method: 'DELETE',
        headers,
    });
    return res.status;
}

async function main() {
    console.log('🚀 開始更新惡魔殼殼種名稱與附加選項...\n');

    for (const update of UPDATES) {
        process.stdout.write(`  ✏️  更新：${update.name} (NT$${update.price})... `);
        try {
            const status = await patchGroup(update);
            console.log(`✅ (HTTP ${status})`);
        } catch (err) {
            console.log(`❌ 失敗：${err.message}`);
        }
        await sleep(400);
    }

    // 刪除舊的英文 "Devil Pro3"
    console.log('\n  🗑️  刪除舊的 "Devil Pro3" 殼種...');
    try {
        const status = await deleteGroup(OLD_DEVIL_PRO3_ID);
        console.log(`  ✅ 已刪除 (HTTP ${status})`);
    } catch (err) {
        console.log(`  ⚠️  刪除失敗（可能已不存在）：${err.message}`);
    }

    console.log('\n─────────────────────────────────────');
    console.log('🎉 完成！請重新整理後台確認：');
    console.log('   1. 四款殼種名稱都變成繁體中文');
    console.log('   2. 每款各有 5 個附加選項（含顏色）');
    console.log('   3. 含「支架」的鏡頭選項為 +$100');
}

main().catch(err => {
    console.error('❌ 執行失敗：', err.message);
    process.exit(1);
});
