Hostinger 部署指南 (Subdirectory: /design/)
========================================

1. 上傳與解壓縮
   - 將 design-dist.zip 上傳到 Hostinger 的 File Manager: public_html/design/ 資料夾中。
   - 如果 public_html 下沒有 design 資料夾，請先建立。
   - 在 File Manager 中對 design-dist.zip 按右鍵選擇 Extract (解壓縮)。
   - 解壓縮後，請確認 public_html/design/ 目錄下直接看到 index.html 與 assets 資料夾。
     (如果解壓出來多了一層 dist，請把內容物移動到 design/ 根目錄)

2. 設定 .htaccess
   - 在 public_html/design/ 資料夾中，建立一個新檔案名為 ".htaccess" (注意前面有點)。
   - 將 deploy/hostinger-design-htaccess.txt 的內容複製貼上到該 .htaccess 檔案中。
   - 存檔。

3. 驗證
   - 瀏覽 https://ppbears.com/design/ 應該能看到設計器首頁。
   - 測試直接連結: https://ppbears.com/design/def/123 (應能正常載入或顯示錯誤，不會 404)。
   - 測試模板分享: https://ppbears.com/t/test-slug (若伺服器有設定轉址) 或 https://ppbears.com/design/?template_slug=test-slug
