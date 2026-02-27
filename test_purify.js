const DOMPurify = require('dompurify');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const window = new JSDOM('').window;
const purify = DOMPurify(window);

const html = `
<section style="line-height:1.8; font-size:16px; max-width:800px; margin:0 auto;">

  <p>
    您好～為了更快幫您確認「喜歡的顏色」與「配件搭配」，請先到 Devilcase 的配色試衣間完成搭配後，再把截圖提供給我們 👇
  </p>

  <!-- 大紅框按鈕 -->
  <div style="text-align:center; margin:30px 0;">
    <a href="https://devilcase.com.tw/fitting-room"
       target="_blank"
       rel="noopener noreferrer"
       style="display:inline-block;
              padding:20px 40px;
              font-size:22px;
              font-weight:bold;
              color:#ffffff;
              background-color:#d60000;
              border:5px solid #ff0000;
              border-radius:14px;
              text-decoration:none;
              box-shadow:0 8px 18px rgba(0,0,0,0.2);">
       🔴 Devilcase 配色試衣間（點我開啟）
    </a>
  </div>

  <ol style="padding-left:20px; margin:20px 0;">
    <li>進入後請先選擇 <strong>【品牌／機型】</strong> 以及 <strong>【商品樣式】</strong></li>
    <li>自由搭配您喜歡的 <strong>殼身顏色</strong> 與 <strong>配件顏色</strong></li>
    <li>搭配完成後，請截圖頁面最下方的 <strong>【商品畫面】</strong></li>
    <li>將截圖上傳給 AI 辨識，我們即可依照規格為您完成訂單</li>
  </ol>

  <!-- 注意事項 -->
  <div style="border:1px solid #e5e5e5; border-radius:10px; padding:15px; background:#fafafa; margin:20px 0;">
    <p style="margin:0 0 8px 0;"><strong>⚠ 注意事項</strong></p>
    <ul style="margin:0; padding-left:20px;">
      <li>
        若在「進階選項」中選擇 <strong>非 Devilcase 官方原有顏色</strong>，
        我們無法額外客製該色，將以您提供的截圖規格為準。
      </li>
    </ul>
  </div>

  <!-- 請勿直接下單提醒 -->
  <div style="border:1px solid #ffcccc; border-radius:10px; padding:15px; background:#fff5f5; margin:20px 0;">
    <p style="margin:0;">
      <strong>❗ 請勿直接在 Devilcase 官網下單</strong><br>
      我們是向 Devilcase 調貨後再進行印刷制作，訂單需由我們這幫處理。
    </p>
  </div>

</section>
`;

console.log('--- DEFAULT ---');
console.log(purify.sanitize(html));
console.log('\n--- WITH ATTRS & TAGS ---');
console.log(purify.sanitize(html, { ADD_ATTR: ['target', 'style'] }));
