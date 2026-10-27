# Credits / 素材來源

| 素材 | 來源 | 授權 |
|---|---|---|
| 撤離動畫天空 HDRI `public/cine/sky_1k.hdr`（Kloofendal 48d Partly Cloudy Pure Sky, 1k） | Poly Haven — https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | CC0 1.0 |
| 地圖資料 | © OpenStreetMap contributors | ODbL |
| 遊戲內生存者地圖（M 鍵）底圖 | 由同一份 OSM 資料即時繪製，© OpenStreetMap contributors | ODbL |

- 航艦（福特級外型參考的通用模型）、直升機、橡皮艇、護衛艦、艦載機、甲板人員、天際線與頂樓加蓋鐵皮屋：全部以程式碼手工建模（three.js），無第三方模型。
- 海洋（Gerstner）、天空、雲、煙火、浪花、調色、景深、bloom：程式產生 shader。
- 音效：除下方「槍聲錄音」外，皆以 WebAudio 即時合成（旋翼、海浪、腳步、環境等）。
- 頂樓加蓋參考（僅參考外觀，未使用影像）：PIXTA 132391252、自由時報 playing.ltn.com.tw/article/12528、東森新聞 488006（萬華西園路頂加）。

## 解放軍制式輕兵器（v10 敵兵掉落）參考來源
型號／口徑／彈匣容量皆依下列公開資料（Wikipedia 條目及其引用）；重量標「約值」者為推估。
- QBZ-191：5.8×42mm、30 發彈匣（另有 75 發彈鼓）；同族 QBU-191 射手型 — https://en.wikipedia.org/wiki/QBZ-191
- QBZ-95/95-1：5.8×42mm、30 發彈匣 — https://en.wikipedia.org/wiki/QBZ-95
- QBU-88：5.8×42mm、10 發彈匣 — https://en.wikipedia.org/wiki/QBU-88
- QSZ-92：9×19mm 15 發／5.8×21mm 20 發，重 760 g — https://en.wikipedia.org/wiki/QSZ-92
- QJY-88：5.8×42mm，100／200 發彈鏈箱 — https://en.wikipedia.org/wiki/QJY-88
- QCW-05：5.8×21mm（DAP92），50 發彈匣，一體消音 — https://en.wikipedia.org/wiki/QCW-05
- QBS-09：18.4mm（12 號），5 發管式彈倉，重 3.45 kg — https://en.wikipedia.org/wiki/QBS-09
- 手榴彈、頭盔、防彈背心、口糧以通稱表示，未對應特定型號。圖示均為原創示意剪影。

## 解放軍裝甲車輛（v11）參考來源
外型為原創低多邊形示意，迷彩為通用數位迷彩，車號為隨機數字，未複製任何真實徽章。
- ZBD-05 / ZTD-05（05 式兩棲裝甲車族）：車體長 9.5 m、26.5 t、ZPT-99 30mm 砲塔（ZBD）、105mm 砲（ZTD）、載員 8 — https://en.wikipedia.org/wiki/Type_05_amphibious_fighting_vehicle
- ZBL-08（08 式 8×8 輪式步兵戰車）：長約 8 m、21 t、30mm 砲塔、載員 7 — https://en.wikipedia.org/wiki/Type_08
- 東風猛士 4×4 輕型車 — https://en.wikipedia.org/wiki/Dongfeng_Mengshi

## v13 — 國軍武器與載具（公開資料查證，遊戲為虛構／戲仿）
Specs checked against English Wikipedia infoboxes (CC BY-SA 4.0), retrieved 2026-10-25:
- T91 assault rifle — 5.56×45mm NATO, 3.17 kg — https://en.wikipedia.org/wiki/T91_assault_rifle
- T65 (K2) assault rifle — 5.56×45mm NATO, 3.31 kg — https://en.wikipedia.org/wiki/T65_assault_rifle
- T75 light machine gun (SAW) — 5.56×45mm NATO, 7.5 kg, 800 m — https://en.wikipedia.org/wiki/T75_light_machine_gun
- T93 sniper rifle — 7.62×51mm NATO, >800 m — https://en.wikipedia.org/wiki/T93_sniper_rifle
- T75 pistol — 9×19mm Parabellum — https://en.wikipedia.org/wiki/T75_pistol
- Kestrel (紅隼) rocket launcher — 67 mm, 5 kg, 400 m HEAT — https://en.wikipedia.org/wiki/Kestrel_(rocket_launcher)
- AT4 — 84 mm, 6.7 kg, single-use — https://en.wikipedia.org/wiki/AT4
- FGM-148 Javelin — 127 mm, top-attack — https://en.wikipedia.org/wiki/FGM-148_Javelin
- M1 Abrams (M1A2T) — 120 mm M256 — https://en.wikipedia.org/wiki/M1_Abrams
- CM11 Brave Tiger — 105 mm M68A1, 50 t — https://en.wikipedia.org/wiki/CM11_Brave_Tiger
- Clouded Leopard (CM-32/CM-34) — 8×8, 30 mm Mk44 (CM-34) — https://en.wikipedia.org/wiki/Clouded_Leopard_Armored_Vehicle
Weights marked 約值 in-game (T93, T75 pistol) are approximations. Vehicle and weapon models are original low-poly / canvas drawings; no third-party assets.

## v14 FPV flight model
- Concepts (not code) from lijiabao1998/Physical-Fpv-Simulator — https://github.com/lijiabao1998/Physical-Fpv-Simulator — fixed 240 Hz step, per-motor thrust/torque ∝ ω², 4-motor mixer, rate P-control, OCV-vs-SOC + internal-resistance battery sag, body-frame quadratic drag, stick deadzone/expo. That repo has no LICENSE file, so no code was copied; everything here is a reimplementation.
- Betaflight rate formula (RC rate / super rate / expo) — https://github.com/betaflight/betaflight (GPL-3.0; formula reimplemented, no code copied).
- Ground effect approximation T/T∞ = 1/(1 − (R/4z)²) (Cheeseman & Bennett, 1955).
- 5.8 GHz free-space path loss — https://en.wikipedia.org/wiki/Free-space_path_loss

## v14b rooftop references (layout study only; no images used in-game)
- Wikimedia Commons, "Taipei-rooftop-additions.jpg" (aerial; per-lot full-roof gable canopies in mixed teal/red/blue/grey) — https://commons.wikimedia.org/wiki/File:Taipei-rooftop-additions.jpg
- Wikimedia Commons, "Taipei-apartments-with-rooftop-additions.jpg" (stacked/set-back additions on 公寓) — https://commons.wikimedia.org/wiki/File:Taipei-apartments-with-rooftop-additions.jpg
- Wikimedia Commons, Category:Rooftop expansions in Taiwan — https://commons.wikimedia.org/wiki/Category:Rooftop_expansions_in_Taiwan
- EBC news, 萬華西園路 old building rooftop addition (aerial) — https://news.ebc.net.tw/news/society/488006
- Google Earth view of Taipei 鐵皮屋/頂加 (巴哈姆特) — https://home.gamer.com.tw/artwork.php?sn=2897677
- Taipei City Construction Management Office on illegal rooftop construction — https://english.cmo.gov.taipei/News_Content.aspx?n=861D2DD384505EB9&s=E57FD5AACB11B25B&sms=EFA85B94A44F5A29
- 應用高解像力遙測影像於台北市建物屋頂加蓋物之監測 (Airiti) — https://www.airitilibrary.com/Article/Detail/18145388-200510-x-3-15-26-a

## 槍聲錄音（v22.8）`public/sfx/gun/`
來源：**The Free Firearm Sound Library**（Ben Jaszczak、Brian Nelson、Kevin Heras、Matthew Nanney 錄製），OpenGameArt「Prepared SFX Library.7z」— https://opengameart.org/content/the-free-firearm-sound-library
授權：**CC0 1.0**（公眾領域，可商用、不需署名；仍在此致謝）。處理：每檔剪出單發、混成單聲道、尾段淡出、響度正規化（-12 LUFS／-1 dBTP），輸出 MP3 80 kbps 44.1 kHz。室內殘響／街道回音為遊戲內以合成脈衝響應的 ConvolverNode 產生，非錄音。反裝甲武器仍為程序合成。

| 檔案 | 內容 | 原始檔（Prepared SFX Library/） | 大小 | 授權 |
|---|---|---|---|---|
| `pistol1.mp3` | Walther PPQ 9mm 手槍，近距離 | Walther PPQ/X_39P.wav（第 1 發） | 8.7 KB | CC0 1.0 — https://opengameart.org/content/the-free-firearm-sound-library |
| `pistol2.mp3` | Walther PPQ 9mm 手槍，近距離 | Walther PPQ/X_39P.wav（第 2 發） | 8.7 KB | CC0 1.0 — https://opengameart.org/content/the-free-firearm-sound-library |
| `rifle1.mp3` | AR-15 5.56mm 步槍，近距離 | AR-15/D_32P.wav（第 1 發） | 9.7 KB | CC0 1.0 — https://opengameart.org/content/the-free-firearm-sound-library |
| `rifle2.mp3` | AR-15 5.56mm 步槍，近距離 | AR-15/D_32P.wav（第 2 發） | 9.7 KB | CC0 1.0 — https://opengameart.org/content/the-free-firearm-sound-library |
| `rifle3.mp3` | AK-47 7.62×39mm 步槍，近距離 | AK-47/C_28P.wav（第 1 發） | 9.7 KB | CC0 1.0 — https://opengameart.org/content/the-free-firearm-sound-library |
| `sniper1.mp3` | Tikka T3 .30-06 栓式步槍，近距離 | Tikka/W_29P.wav（第 1 發） | 16.5 KB | CC0 1.0 — https://opengameart.org/content/the-free-firearm-sound-library |
| `sniper2.mp3` | Tikka T3 .30-06 栓式步槍，近距離 | Tikka/W_29P.wav（第 2 發） | 16.5 KB | CC0 1.0 — https://opengameart.org/content/the-free-firearm-sound-library |
| `mg1.mp3` | Mosin Nagant 7.62×54mmR（機槍用同口徑），近距離 | Mosin Nagant/M_21P.wav（第 1 發） | 8.1 KB | CC0 1.0 — https://opengameart.org/content/the-free-firearm-sound-library |
| `mg2.mp3` | Mosin Nagant 7.62×54mmR，近距離 | Mosin Nagant/M_21P.wav（第 2 發） | 8.1 KB | CC0 1.0 — https://opengameart.org/content/the-free-firearm-sound-library |
| `shotgun1.mp3` | Benelli Nova 12 號霰彈槍，近距離 | Nova/O_21P.wav（第 1 發） | 11.7 KB | CC0 1.0 — https://opengameart.org/content/the-free-firearm-sound-library |
| `shotgun2.mp3` | Benelli Nova 12 號霰彈槍，近距離 | Nova/O_21P.wav（第 2 發） | 11.7 KB | CC0 1.0 — https://opengameart.org/content/the-free-firearm-sound-library |
| `far1.mp3` | AR-15，中距離（遠處槍聲） | AR-15/D_24P.wav（第 1 發） | 14.5 KB | CC0 1.0 — https://opengameart.org/content/the-free-firearm-sound-library |
| 合計 | 12 檔 | | 133.7 KB | |
