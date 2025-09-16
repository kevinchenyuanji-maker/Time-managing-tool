# 穩定日常（MVD）— 簡易 PWA

一個可安裝到 **Windows 11** 或 **iOS** 的網頁 App，提供：
- 按鈕式決策流程（起步5′／番茄25′／深度50′／救援25）
- 中斷一鍵復位（Fallback／Recovery 建議）
- If–Then 建議面板（起步卡關／被打斷／休閒票）
- 本地儲存的每日紀錄、JSON/CSV 匯出
- 通知與蜂鳴提示（需授權）

## 使用方法
1. 下載 `mvd_pwa.zip` 並解壓，雙擊 `index.html` 即可在瀏覽器執行；或上傳到任何靜態空間（GitHub Pages / Netlify）。
2. iOS Safari：共享鈕 → 加到主畫面；Windows 11 Edge/Chrome：網址列的「安裝」圖示。
3. 進入 App 後：先設定錨點時間與今日目標，接著用按鈕啟動計時。

## 進一步交給 Claude 的擴充提示
**System Prompt**（貼給 Claude）  
你是專精前端與 PWA 的資深工程師。請在零後端前提下，將此 App 擴充：
- 新增「每日最低標 3 件事」表單與完成勾選
- 「週回顧」頁：統計 7 天完成率/深度段數/中斷次數
- If–Then Library 可 CRUD（本地資料庫）
- 休閒票倒數＋22:30 後自動切換白名單（禁螢幕娛樂）
- 改用 IndexedDB（含 localStorage → IndexedDB 遷移）
- 產出完整修改檔與簡要測試

**User Prompt**（貼給 Claude）  
這是我的專案檔案：`index.html`, `style.css`, `main.js`, `manifest.json`, `sw.js`。請：
1. 在 `index.html` 插入「每日最低標」表單區塊（深度1/2＋兩個小任務）。
2. 在 `main.js` 新增 `weeklyView()`，以最近 7 天 sessions 產生統計。
3. 建立 `ifthenDb` 可新增/編輯/刪除規則，預設以 12 條規則填種。
4. 寫 22:30 後自動切換休閒白名單的邏輯。
5. 將儲存層改為 IndexedDB，並提供遷移程式。
6. 回覆差異（diff），最後提供完整檔案。

