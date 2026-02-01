const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const fs = require('fs');
const path = require('path');

// 1. 確保 data 資料夾存在，避免報錯
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 2. 初始化 LowDB (資料儲存在 data/db.json)
const adapter = new FileSync(path.join(dataDir, 'db.json'));
const db = low(adapter);

// 3. 設定預設值 (確保重啟後結構還在)
db.defaults({
  templates: [], // 存放設計模板
  assets: [],    // 存放上傳圖片
  settings: { theme: '#e50038' }
}).write();

console.log('✅ Database connected: /data/db.json');

module.exports = db;
