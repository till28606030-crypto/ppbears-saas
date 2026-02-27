/**
 * seed_devilcase_groups.mjs
 * 將惡魔殼四款殼種與所有附加選項寫入 Supabase option_groups 資料表
 * 執行：node scripts/seed_devilcase_groups.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ 缺少 Supabase 環境變數，請確認 .env 設定');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── 顏色選項集合（從截圖中收集到的所有顏色）───────────────────────────────

// 外框顏色（四款共用大部分）
const FRAME_COLORS = [
    '透曜黑(永不發黃)',
    '迷霧黑',
    '冰川綠',
    '湖水綠',
    '玫瑰粉',
    '寶石藍',
    '金色',
    '透明',
];

// 鏡頭造型（斜面款/圓弧款 + 各種顏色）
// ⭐ 注意：含「支架」的選項 priceModifier = 100（多收一百）
const LENS_OPTIONS_PRO3 = [
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
    { name: '宇宙橙/支架斜面款', priceModifier: 100 }, // ⭐ 含支架 +100
    { name: '鈦金/支架斜面款', priceModifier: 100 },  // ⭐ 含支架 +100
];

const LENS_OPTIONS_STANDARD = [
    { name: '黑色/斜面款', priceModifier: 0 },
    { name: '黑色/圓弧款', priceModifier: 0 },
    { name: '湖水綠/斜面款', priceModifier: 0 },
    { name: '湖水綠/圓弧款', priceModifier: 0 },
    { name: '宇宙橙/斜面款', priceModifier: 0 },
    { name: '宇宙橙/支架斜面款', priceModifier: 100 }, // ⭐ 含支架 +100
    { name: '鼠尾草綠/斜面款', priceModifier: 0 },
    { name: '玫瑰粉/斜面款', priceModifier: 0 },
    { name: '白色/斜面款', priceModifier: 0 },
    { name: '金色/斜面款', priceModifier: 0 },
    { name: '鈦金/支架斜面款', priceModifier: 100 },  // ⭐ 含支架 +100
];

// 按鍵組顏色
const BUTTON_COLORS = [
    '黑色', '白色', '金色', '玫瑰粉', '冰川綠',
    '湖水綠', '宇宙橙', '鼠尾草綠', '湛海藍', '透明', '櫻花粉',
];

// 動作按鍵（含款式）
const ACTION_BUTTON_OPTIONS = [
    '黑色/平面款', '黑色/凸面款',
    '白色/平面款',
    '金色/平面款',
    '玫瑰粉/平面款',
    '冰川綠/平面款',
    '湖水綠/平面款',
    '宇宙橙/平面款',
    '鼠尾草綠/平面款',
    '湛海藍/平面款',
    '透明/平面款',
    '櫻花粉/平面款',
    '白色',
];

// 相機按鍵
const CAMERA_BUTTON_COLORS = [
    '黑色', '白色', '金色', '玫瑰粉', '冰川綠',
    '湖水綠', '宇宙橙', '鼠尾草綠', '湛海藍', '透明', '櫻花粉',
];

// ─── Helper：生成 ID ───────────────────────────────────────────────────────────
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

// ─── 四款殼種資料定義 ──────────────────────────────────────────────────────────

const GROUPS = [
    // ① 惡魔防摔殼 PRO3
    {
        id: makeId('grp'),
        code: 'devilcase_pro3',
        name: '惡魔防摔殼 PRO3',
        price_modifier: 1490,
        thumbnail: null,
        ui_config: {
            step: 1,
            displayType: 'cards',
            category: '惡魔殼',
            sortOrder: 1,
            categorySortOrder: 0,
            aiKeywords: ['PRO3', 'PRO 3', 'Pro 3', '防摔殼 PRO', '惡魔防摔殼 PRO', '惡魔殼摔殼PRO3', '惡魔摔殼 PRO'],
        },
        sub_attributes: [
            makeAttr('外框', FRAME_COLORS),
            makeAttr('鏡頭造型', LENS_OPTIONS_PRO3),
            makeAttr('按鍵組', BUTTON_COLORS),
            makeAttr('動作按鍵', ACTION_BUTTON_OPTIONS),
            makeAttr('相機按鍵', CAMERA_BUTTON_COLORS),
        ],
        is_active: true,
    },

    // ② 惡魔防摔殼 PRO3 磁吸版
    {
        id: makeId('grp'),
        code: 'devilcase_pro3_mag',
        name: '惡魔防摔殼 PRO3 磁吸版',
        price_modifier: 1690,
        thumbnail: null,
        ui_config: {
            step: 1,
            displayType: 'cards',
            category: '惡魔殼',
            sortOrder: 2,
            categorySortOrder: 0,
            aiKeywords: ['PRO3 磁吸', 'PRO 3 磁吸', 'PRO3磁吸版', '惡魔防摔殼 PRO 3 磁吸版', '防摔殼 PRO3 磁吸'],
        },
        sub_attributes: [
            makeAttr('外框', FRAME_COLORS),
            makeAttr('鏡頭造型', LENS_OPTIONS_PRO3),
            makeAttr('按鍵組', BUTTON_COLORS),
            makeAttr('動作按鍵', ACTION_BUTTON_OPTIONS),
            makeAttr('相機按鍵', CAMERA_BUTTON_COLORS),
        ],
        is_active: true,
    },

    // ③ 惡魔防摔殼 標準版
    {
        id: makeId('grp'),
        code: 'devilcase_standard',
        name: '惡魔防摔殼 標準版',
        price_modifier: 1190,
        thumbnail: null,
        ui_config: {
            step: 1,
            displayType: 'cards',
            category: '惡魔殼',
            sortOrder: 3,
            categorySortOrder: 0,
            aiKeywords: ['標準版', 'Standard', '惡魔防摔殼 標準', '惡魔防摔殼標準版'],
        },
        sub_attributes: [
            makeAttr('外框', FRAME_COLORS),
            makeAttr('鏡頭造型', LENS_OPTIONS_STANDARD),
            makeAttr('按鍵組', BUTTON_COLORS),
            makeAttr('動作按鍵', ACTION_BUTTON_OPTIONS),
            makeAttr('相機按鍵', CAMERA_BUTTON_COLORS),
        ],
        is_active: true,
    },

    // ④ 惡魔防摔殼 標準磁吸版
    {
        id: makeId('grp'),
        code: 'devilcase_standard_mag',
        name: '惡魔防摔殼 標準磁吸版',
        price_modifier: 1190,
        thumbnail: null,
        ui_config: {
            step: 1,
            displayType: 'cards',
            category: '惡魔殼',
            sortOrder: 4,
            categorySortOrder: 0,
            aiKeywords: ['標準磁吸', '標準磁吸版', '惡魔防摔殼 標準磁吸', '惡魔防摔殼標準磁吸版'],
        },
        sub_attributes: [
            makeAttr('外框', FRAME_COLORS),
            makeAttr('鏡頭造型', LENS_OPTIONS_STANDARD),
            makeAttr('按鍵組', BUTTON_COLORS),
            makeAttr('動作按鍵', ACTION_BUTTON_OPTIONS),
            makeAttr('相機按鍵', CAMERA_BUTTON_COLORS),
        ],
        is_active: true,
    },
];

// ─── 寫入 Supabase ─────────────────────────────────────────────────────────────

async function seed() {
    console.log('🚀 開始寫入惡魔殼殼種資料到 Supabase...\n');

    let successCount = 0;
    let errorCount = 0;

    for (const group of GROUPS) {
        process.stdout.write(`  ▶ 插入：${group.name} (NT$${group.price_modifier})... `);

        // 先刪除同 code 的舊資料（避免重複）
        await supabase.from('option_groups').delete().eq('code', group.code);

        const { error } = await supabase
            .from('option_groups')
            .insert(group);

        if (error) {
            console.log(`❌ 失敗`);
            console.error(`    錯誤：${error.message}`);
            errorCount++;
        } else {
            const subAttrCount = group.sub_attributes.length;
            const totalOptions = group.sub_attributes.reduce((sum, a) => sum + a.options.length, 0);
            console.log(`✅ 成功（${subAttrCount} 個附加選項，共 ${totalOptions} 個顏色值）`);
            successCount++;
        }

        // 避免請求過快
        await new Promise(r => setTimeout(r, 300));
    }

    console.log('\n─────────────────────────────────────');
    console.log(`✅ 成功：${successCount} 筆`);
    if (errorCount > 0) console.log(`❌ 失敗：${errorCount} 筆`);
    console.log('─────────────────────────────────────');

    if (successCount > 0) {
        console.log('\n🎉 完成！請到後台「購物車商品」確認是否正確顯示。');
        console.log('   之後可以在後台自行新增、刪除、修改顏色選項。');
    }
}

seed().catch(err => {
    console.error('❌ 執行失敗：', err);
    process.exit(1);
});
