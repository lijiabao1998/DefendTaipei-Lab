# src/map/tiles — 分塊串流基礎（預設關閉）

- `grid.ts`：256 m × 256 m 格網、座標換算。
- `lod.ts`：三層 LOD（近 0–500 m 完整、中 500 m–2 km 擠出方塊＋合併道路、遠 >2 km 低精度地形＋天際線），含遲滯避免閃爍。
- `manager.ts`：`TileManager`，依玩家位置載入／卸載，由近到遠、每次更新有載入上限，支援非同步載入。旗標 `?maptiles=1`（`MAP_TILES_ON`）。
- `mid.ts`：中／遠層幾何產生器。

目前遊戲沒有呼叫這些檔案，預設畫面與行為不變。之後的 PR：Taipei 裁切與烘焙工具（資料不進 repo）、接上渲染器、透過 `core/bus.ts` 發事件。

地圖資料 © OpenStreetMap contributors（ODbL）；出處需列在設定／關於頁（`src/ui/`）。
