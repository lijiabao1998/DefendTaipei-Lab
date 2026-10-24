# DefendTaipei-Lab 保衛台北

以真實台北街道為戰場的生存遊戲原型：玩法參考《Project Zomboid》（俯視生存沙盒），但敵人是已經佔領台北的解放軍佔領部隊。你是萬華巷弄裡的倖存者，搜刮物資、避開巡邏、一區一區解放街區。

**線上遊玩：** https://lijiabao1998.github.io/DefendTaipei-Lab/

## 操作
| 按鍵 | 功能 |
|---|---|
| WASD | 移動 |
| Shift | 奔跑（噪音大、耗體力） |
| C | 切換潛行（慢、無腳步聲、較難被看見） |
| 滑鼠 / 左鍵 | 瞄準 / 攻擊（近戰從背後偷襲傷害×3） |
| E | 搜刮附近容器 |
| Tab / I | 背包（點物品使用或裝備） |
| B | 用鐵鎚+木板封門／拆除 |
| Z | 室內睡覺（時間快轉） |
| F | 手電筒 |
| 滾輪 | 縮放 |

## v0.1 內容
- 萬華／西門町約 1 km² 真實街道與 497 棟建築（OpenStreetMap），可進入建築、屋頂與前景牆面自動透明化
- 騎樓柱廊、鐵窗、頂樓加蓋鐵皮屋、水塔、機車、諧仿招牌（7-12、康是福藥局…）
- 飽足／水分／疲勞／生命、流血與止血、死亡即永久結束（刪除存檔）
- 解放軍巡邏：視野錐（白天遠、夜間近）、聽覺（槍聲約 40–55m）、搜索與交火；夜間宵禁有額外巡邏隊
- 9 個街區，消滅區內全部佔領軍即解放
- 日夜循環（1 秒 = 遊戲 1 分鐘）、localStorage 自動存檔

## 開發
```
npm install
npm run dev
npm run fetch-osm   # 重新從 Overpass API 抓取地圖
npm run build && npm run smoke
```

## 授權與聲明
地圖資料 © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)，以 ODbL 授權。本作為虛構作品，人物、部隊番號皆為虛構；店名皆為諧仿，與真實品牌無關。
