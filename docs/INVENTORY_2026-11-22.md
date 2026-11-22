# 棚卸し：直下のJSとURLスイッチ（2026-11-22）

「その物があることで次の行動が広がるか」をコードにも当てる。決着がついた試作・使われていないコードは、マップの「乗り越えるだけの壁」と同じノイズ。
この文書は仕分けの記録。**同日（11/22）の続きで、C と D2・D3・D5・D6 を消した（下の「実施結果」）。** 仕分けの時点は `main` = `8230fdc`。

## 調べ方と限界

- 直下の `*.js` 159本について、`index.html`・`canyon.html` から script / import をたどって届くかを機械的に調べた（`届く`＝読み込まれる、であって「既定の遊びで働く」ではない。URLスイッチで止まっているものがある）。
- URLスイッチは、直下の `*.js` の `get('…')`・`has('…')` から拾った54種類（管理画面の入力欄の名前を含む。`index.html`・`canyon.html` 本体の中のスイッチは数えていない）。前回「65種類」と言ったのは、URL以外の `get()` も混ざった数で、正しくは54。
- 各ファイルの役割は先頭のコメントと参照元から判断した。**中身を全部読んだわけではない。**「消せる」は根拠つきの候補で、消す前に関連の検査を回すこと。
- 数えていないもの：`bench/`（255）、`docs/`（105）、`.github/workflows/`（43）、`*.css`、`tools/`、`server/`、`pool/`。

## 結果の要約

| 区分 | 直下のJS | 備考 |
|---|---|---|
| 公開の遊びで使う | 約135本 | 下の A |
| 開発・運営用に要る | 約12本 | 下の B（エディター・管理画面・診断・言語パック） |
| **消せる（決着済み）** | **2本＋スイッチ数個** | 下の C。判断不要 |
| **要判断（決着しているなら消せる）** | 約10本＋ページ4つ＋スイッチ約15個 | 下の D。本人が「採用／却下」を決める |
| 未決（触らない） | 3件 | 下の E |

159本のうち149本は公開の入口から読み込まれている。**まるごと使われていないファイルは少ない。ノイズの大半は、ファイルの中の「スイッチで切り替わる分岐」と、それに付いた検査・比較ページ**にある。

## 実施結果（2026-11-22、本人の「消せる・消せそうなものは消していい」に沿って）

| 項目 | 結果 |
|---|---|
| C：`zombie-search.js`・`zombie-search-motion.js`、`bench/zombie-search.test.cjs`、`running-browser.yml` の1行 | 消した。**訂正：`bench/zombie-search-browser.cjs` は残した**（`window.skyZombieSearch` は今の追跡 `zombie-pursuit.js` の名前で、これは生きた検査） |
| C：AMMO の画面端ピン（`?ammoPin`）、追従カメラの調整つまみ3つ（値は定数に）、`?hookArc=0` | 消した（`skyHookArc.enabled` は検査が直接切り替える） |
| D2：`camera-comparison.html`・`camera-trial.html`、`bench/fixed-launcher-browser.cjs` | 消した |
| D3：固定カメラの壁を透かす旧案（`?fixedOcclusion=fade|zoom`・`?wallView=classic`）と `bench/opaque-walls-review.html` | 消した（`wallView=classic` は `enhancements.js`・`surface-readability.js`・`world-batching.js` からも）。検査から旧案の比較を外した |
| D5：`swing-plan.html`・`swing-escape-evidence.json`、`hook-editor.html` のリンク | 消した。**`?oldtown_swing`（検査が使う）・`swingCourse`（入門の地形の印）・`?swing_route` は残した**。`OLD_TOWN_SWING_PLAN.md` は記録として残し注記した |
| D6：`escape-replay-viewer.html` | 消した。動画・JSON・`tools/escape-replay*` は記録・生成用として残した |
| **D1：カメラの比較試作 `follow`・`follow-legacy`・`follow-turn`** | **消さなかった（私の見立てが誤り）。** `follow-turn` は AGENTS.md §6「操作方式を変えるときは親指の模型で前後を比べる」の**「前」の基準線**で、`bench/screen-stick-browser.cjs`・`screen-stick.test.cjs`・`follow-camera.test.cjs` が使う。`follow-legacy` は `easy-controls-browser`・`auto-follow-browser`・`follow-camera.test` が、`follow` は `auto-follow-entry-browser` が使う。消すなら、比較の基準線を別の形で残す判断が先 |
| D7：練習モード（`practice.js`・`practice-world.js`） | **残す（本人と確認、11/22）。** 入門コース（`?learn=1`）が練習場の地形と仕組み（`window.skyPractice`）の上に作られている。入口のリンクは `#homeMore`（折りたたみ）の中にあり、普通は見えない |
| D8：旧い入門の入口 `?guidedEntry=0`・体力無限の入門ラン（`intro` 難易度） | **消した（11/22、3つ目のセッション）。** 人は11/14から入門コース（`?learn=1`）→イージー。一緒に、入門ランの中でしか出なかった案内（`context-tutorial`・`hook-tutorial`）、操作タイプのポップアップ（`#ctrlPick`）、スキップボタン（`intro-skip`）、結果からの勧め（`next-step`）も消した。詳細は README の先頭の節 |
| D4・D10（D9 は11/22に決着） | 触っていない（後回し・未調査のまま） |

教訓：**「URLに付けたときだけ動く」＝「使われていない」ではない。** 検査と AGENTS.md の手順が基準線として使っていることがある。消す前に `bench/` と AGENTS.md を引くこと。

## C. 消せる（決着済み・判断不要）

| 物 | 根拠 | 一緒に消すもの |
|---|---|---|
| `zombie-search.js`（17 KB）・`zombie-search-motion.js`（4 KB） | どこからも読み込まれていない。先頭に「Retired module kept for historical checks」。AGENTS.md §3「ゾンビの見失い・徘徊（継続追跡にした）」 | `bench/zombie-search.test.cjs`・`bench/zombie-search-browser.cjs`、`running-browser.yml` の2行。`zombie-search.js` 内の localStorage キー移行は読み込まれていないので動いていない |
| AMMO の画面端ピン（`edge-pins.js` の `?ammoPin=1`） | 11/21に「画面端で見切れて紛らわしいので既定で出さない」と決めた。スイッチでしか出ない | ピンの生成・更新のコード、`bench` の該当項目（1か所） |
| 追従カメラの調整つまみ `?followRate`・`?followSoft`・`?followSqueeze`（`follow-camera.js`） | 検査では使われていない（文書1本に記載があるだけ）。数値を決めるときの一時的なつまみ。今の値（1.7／.28／1.5）を定数にする | なし |
| `?hookArc=0`（`hook-arc.js`） | フックの弧は採用済み。切るスイッチは検査でも文書でも使われていない | なし |

消すときの確認：単体テスト全部、`running-browser.yml` の残りの手順、`edge-pins` に関わる検査（`grep -l ammoPin bench/*`）。

## D. 要判断（「もう使わない」なら消せる）

本人が1行ずつ「残す／消す」を決めれば、消す分は次のセッションでまとめて外せる。

| # | 物 | 今の状態 | 消す場合の範囲 |
|---|---|---|---|
| D1 | カメラの比較試作 `?cameraTrial=follow`・`follow-legacy`・`follow-turn` | 11/9〜11/10の操作の比較用。今の既定（画面の向きへ倒す）は決まっている。記録は送らない | `follow-camera.js` の分岐（`allowManualLook`・`turnCommit`）、`fixed-trial-bootstrap.js`・`home-focus.js`・`guided-intro.js`・`guided-preferences.js` の一覧、`bench/auto-follow-review.html`、`send-default-browser`・`auto-follow-routing.test` の該当項目 |
| D2 | 比較ページ `camera-comparison.html`・`camera-trial.html`（直下＝公開される） | README からしか参照されていない（`camera-trial.html` は検査1本） | ページ2つと `bench/fixed-launcher-browser.cjs` |
| D3 | 固定カメラの壁の見せ方の旧案 `?fixedOcclusion=fade|zoom`・`?wallView=classic` | 今の既定は「壁は実体を残し、カメラの距離と角度で補う」。旧案（壁を透かす）は比較用 | `fixed-camera-trial.js` の `fadeWalls` まわり（約50行）、`world-batching.js`・`surface-readability.js`・`enhancements.js` の分岐 |
| D4 | 旧い見た目 `?look=classic`・`?wallReadability=classic` | 11/11以降の町の見た目の前。検査6本と文書4本が使っている | `look-pass.js`・`mood.js`・`contact-shadow.js`・`town-dress.js`・`wall-readability.js` の分岐と検査の項目。**範囲が広いので、急がない** |
| D5 | 鉄棒の計画ページ `swing-plan.html`（14 KB、直下＝公開される）と `OLD_TOWN_SWING_PLAN.md`、`?oldtown_swing=1`・`?swing_route`・`?swingCourse` | 旧市街の鉄棒は公開済み。計画・下見用 | ページ、`hook-editor.html` からのリンク、`challenge-difficulty.js`・`foundation-runtime.js`・`old-town-swing.js` の分岐 |
| D6 | `escape-replay-viewer.html`（直下＝公開される） | 10/30の脱出テストのリプレイを見るページ。`docs/escape-replays/` とセット | ページと `docs/escape-replays/` |
| D7 | 練習モード（`practice.js`・`practice-world.js`・`practice.css`・`PRACTICE.md`、`?practice`） | ホームからの入口は見つからなかった（URLで直接開く）。`canyon.html` だけが読み込む。入門コース（`?learn=1`）は練習モードの地形の一部を使っている | 入門コースと絡むので、消すなら切り分けが要る。**使っているかどうかを先に教えてほしい** |
| D8 | 旧い入門の入口 `?guidedEntry=0`（`legacyIntro`） | **消した（11/22）。** 自動操作のブラウザも人と同じ道（初回カード・コツ → 入門コース）を通る。`?guidedEntry=1`（ホームを開くと入門コースへ移る、検査用の入口。`guided-preferences.js`）は別物で残している | — |
| D9 | 一人称の表示（`first-person-weapons.js` 12 KB、`human-view.js` の `existing`） | **残す・活かすことに決まった（本人の判断、11/22）。** 操作設定の末尾に任意で選べる「一人称視点（おまけ・試作）」として出した（`first-person-option.js`）。人物の読み込み失敗時の代替表示としても使う | — |
| D10 | `auto-resolution-monitor.js`（2 KB） | 先頭に「NIGHTLINE's rendered-frame policy」。AGENTS.md §3「NIGHTLINE の画質調整の仕様の取り込み」はやらない、と食い違って見える。`foundation-runtime.js` が読み込んでいる（測るだけで画質は変えていない可能性がある） | 未調査。測るだけなら残してよい |

## E. 未決（触らない）

| 物 | 理由 |
|---|---|
| ギャップ自動ジャンプ（`flow-feel.js` の `?autoJump=1`、`bench/flow-feel-browser.cjs` が落ちる） | マップが決まるまで保留（本人の判断、11/22） |
| 街の形を足す試作（`town-dress.js` 12 KB、`?dress=1`） | AGENTS.md §5「ジオメトリを足す装飾は PlaytestCloud の結果を見てから」 |
| 超ベリーハード（`challenge-difficulty.js` の `extreme`、`zombie-types.js`） | AGENTS.md §6「試作でランキング対象外」として残すと決めてある |

## B. 開発・運営用に要る（残す）

- **エディター**：`hook-editor.js`・`wall-jump-candidates.js`（`hook-editor.html`。公開版には含めない、AGENTS.md §8）。
- **管理画面**：`owner.js`（`owner.html`・`owner-token.html`）。スイッチ `days`・`from`・`to`・`token`・`endpoint` は入力欄の名前。
- **言語パック**：`i18n-es/pt/th/tr/vi.js`（`i18n.js` が選んだ言語だけ後から読み込む。生成物）。
- **診断**（プレイ記録に入る・既定で動く）：`perf-trace.js`・`nav-watch.js`・`threat-trace.js`・`telemetry-probe.js`・`foundation-metrics.js`・`environment-profile.js`。
- **前後を比べるスイッチ**（本人の実機確認・検査で使う。AGENTS.md に載っているもの）：`?mood`・`?walls=plain`・`?prune=0`・`?links=0`・`?scenery=0`・`?outline`・`?contact`・`?motes`・`?windFx=0`・`?flowFeel=0`・`?landAssist=0`。
- **入口・状態のスイッチ**（遊びの流れで使う）：`?lang`・`?camera`・`?dev`・`?learn`・`?learned`・`?return`・`?onboarding`・`?ownerReplay`・`?replay`。
- **検査のためのスイッチ**：`?controlpick=0`・`?hookGuide=0`・`?guides=0`・`?controlsGuide=0`・`?firstGuide=1`・`?challengeDebug=1`・`?start`・`?start_spot`・`?random_start`・`?perf`・`?threatHud`・`?boss`・`?section`。

## A. 公開の遊びで使う（残す）

読み込まれていて、先頭のコメントと参照元から「既定の遊びで働く」と判断したもの。まとまりごとに：

- **地形（旧市街）**：`town-heights`・`roof-trenches`・`return-links`・`window-dive`・`tower-tunnel`・`rope-swing`・`rope-stations`・`old-town-swing`・`jump-pads`・`map-prune`・`map-links`・`start-spots`・`indoor-access`・`indoor-feedback`。渓谷：`canyon-world`・`parkour-course`。入門：`guided-world`・`guided-art`。
- **動き**：`edge-assist`・`stair-walk`・`slope-slide`・`landing-roll`・`parkour-swing`・`swing-fatigue`・`swing-flip`・`hook-arc`・`hook-landing`・`hook-targeting`・`free-hook`・`wall-jump-spots`・`wallrun-guides`・`dash-boost`・`jump-pickups`・`jump-gun`・`blast-barrels`・`flashbang`・`skill-decoy`・`bite-shove`・`player-skills`・`context-click`・`touch-rescue`・`escape-routes`。
- **追手**：`zombie-pursuit`・`zombie-routing`・`zombie-climb`・`zombie-descent`・`zombie-ladders`・`zombie-fall`・`zombie-near`・`zombie-types`・`boss-zombie`・`opening-wave`・`spawn-profile`・`spawn-reach`・`challenge-difficulty`。
- **カメラ・操作**：`follow-camera`・`fixed-camera-trial`（公開の固定カメラ）・`fixed-trial-bootstrap`・`control-style`・`controls-guide`・`desktop-look-fallback`・`auto-fire-controls`・`gun-recoil`・`viewport-runtime`。
- **見た目**：`look-pass`・`far-scenery`・`ink-outline`・`mood`・`contact-shadow`・`wall-readability`・`surface-readability`・`world-batching`・`render-quality`・`wind-fx`・`flow-feel`・`unity-explosion-fx`・`human-view`・`human-actions`・`human-running`・`human-aim`・`human-wallrun`・`human-occlusion`・`first-person-weapons`・`easy-weapon-port`・`weapon-drops`。
- **画面・案内**：`home-focus`・`onboarding`・`first-run-guide`・`game-menu`・`pause-focus`・`player-clarity`・`hud-declutter`・`weapon-hud`・`minimap`・`minimap-model`・`edge-pins`・`threat-edge`・`threat-math`・`combat-feedback`・`tip-cards`・`tip-usage`・`tips-demos`・`credits`・`dev-mode`・`i18n`・`i18n-en`・`i18n-en-extra`。
- **入門**：`guided-intro`・`guided-choice`・`guided-coach`・`guided-defense`・`guided-lessons`・`guided-prompts`・`guided-preferences`。（`next-step`・`intro-skip`・`context-tutorial`・`hook-tutorial` は入門ランと一緒に11/22に消した）
- **スコア・記録・ランキング**：`challenge-score`・`survival-score`・`ranked-rules`・`ranking`・`run-records`・`player-name`・`random-uuid`・`ghost-replay`・`replay-data`・`replay-detail`・`replay-scene`・`replay-audio`・`replay-time`・`foundation-runtime`・`start-readiness`。
- **音**：`audio-recovery`・`decoy-audio`・`gear-audio`・`tension-music`・`voice-sfx`。
- `enhancements.js`（111 KB）は多くの機能の束ね役。中に古い分岐が残っている可能性は高いが、今回は開けていない。

## 次にやる順（提案）

1. **C を消す**（判断不要。半日もかからない）。
2. **D を本人が仕分ける**（表の # ごとに「残す／消す」）。おすすめの初手は D1・D2・D3・D5・D6（比較用・計画用で、遊びに出ない。直下のページ4つは公開もされている）。
3. D4（旧い見た目）は、検査の書き換えが多いので後回し。D8（旧い入門の入口と入門ラン）は11/22に消した。
4. その後に、数えていない `bench/`（255）と `docs/`（105）、PR のときしか動かないワークフロー（約40本）の棚卸し。消した機能の検査・文書が残っていないかを見る。
