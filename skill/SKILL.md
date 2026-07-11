---
name: slide-forge
description: |
  **slide-forge スライド作成スキル**: Marp Markdown からスタイリッシュな HTML スライドを生成する。厳選レイアウトクラス+品質検証ループ(overflow機械チェック+PNG目視)で一定品質を担保する。
  MANDATORY TRIGGERS: スライド作成, スライドを作って, 発表資料, プレゼン資料, Marp, marp, slide-forge, 研究発表スライド, ゼミ発表, 学会発表
  スライドの新規作成・編集・レイアウト調整・ビルド全般でこのスキルに従うこと。
---

# slide-forge スライド作成スキル

Marp Markdown を唯一のソースとし、HTML は常にビルド成果物として扱う。
このSKILL.mdと同じディレクトリに `theme/` `scripts/` `webui/` `references/` を同梱しており、
**このスキル単体で動作する**(他リポジトリへの依存はない)。以下で `theme/` `scripts/` 等と
書いているパスは、すべて**このSKILL.mdが置かれているディレクトリ**からの相対パスを指す。

## 原則

1. **内容と装飾の分離**: エージェントが書くのは「内容(Markdown)」と「レイアウト選択(`<!-- _class: ... -->`)」だけ。配置・余白・色は全てテーマCSSが決める
2. **生HTMLは書かない**: `<div>` やインラインstyleでのレイアウト組みは禁止。表現できないレイアウトが必要なら、テーマにクラスを追加する(`theme/`)
3. **検証せずに完成としない**: 下記の品質検証ループを必ず回す

## セットアップ(初回のみ)

このSKILL.mdと同じディレクトリ(以下 `$FORGE`。エージェントが認識している自身の絶対パスを使う)に
`node_modules/` が無い場合は、最初に1回だけ依存パッケージをインストールする:

```bash
npm install --prefix "$FORGE"
```

Puppeteer の Chromium ダウンロードが走るため、初回のみ数分かかることがある。
2回目以降はスキップしてよい。

## ワークフロー

### 1. スキン(テーマ)を選ぶ

- `research` — 研究発表(ゼミ・学会・進捗報告)。グレー/墨色系
- `business` — ビジネス(提案・報告・事業説明)。グレージュ/ブラウン系
- `lecture` — エンジニアの輪講・社内勉強会・チュートリアル。モスグリーン系
- `soft` — 丸みのある柔らかいデザイン。グレージュ×コーラル系。パネル・箱・チップ・画像が角丸になり、
  引用の左罫線を持たない。research/business/lecture の専用クラスもすべて使える(全クラスの合併)。
  カジュアルな発表・社内共有・オンボーディング向け(上3つはエディトリアル・ミニマル=角丸なし)

### 2. レイアウトを選ぶ

利用可能なクラス(詳細サンプルは `references/layouts.md` を読む):

| クラス | 用途 |
|---|---|
| `title` | 表紙(タイトル・サブタイトル・発表者・日付) |
| `agenda` | 目次(番号付きリスト。項目を太字にすると「今ここ」として強調) |
| `divider` | セクション区切り(グラデーション背景) |
| `content` | 標準スライド(見出し+箇条書き/段落) |
| `two-column` | 本文を2段組(h1は全幅、内容は自動流し込み) |
| `image-right` | 本文左+画像右(画像は自動配置・contain) |
| `image-left` | 画像左+本文右 |
| `image-full` | 図が主役(h1+全面画像+注釈1行) |
| `comparison` | 対比2列(h2が各列の見出し、列の切れ目を制御可) |
| `table` | 表が主役 |
| `takeaway` | メッセージ強調(1枚1メッセージ、濃色フラット面) |
| `summary` | まとめ(ヘアライン区切りの要点) |
| `end` | 終了スライド |
| `timeline` | 縦タイムライン(時系列・マイルストーン) |
| `timeline-h` | 横タイムライン(2〜5項目のスケジュール) |
| `steps` | 横並びプロセス(手順・フロー、番号自動付与) |
| `columns` | 特徴の列並び(テキスト2〜4列) |
| `spec` | ラベル+値の一覧(会社概要・仕様・条件) |
| `faq` | Q&A(h2が質問、直後の段落が回答) |
| `matrix` | 2×2マトリクス(SWOT等。h2×4、順序: 左上→左下→右上→右下) |
| `gallery` | 画像の横並び比較(2〜3枚を1つの段落に) |
| `stat` | 数字1つを全面に(インパクト用) |
| `profile` | 人物紹介(円形写真+経歴リスト) |
| `quote` | 引用(顧客の声・先行研究の一文。大きな引用+出典) |
| `code` | コード中心(コードブロック+注釈1行) |
| `checklist` | チェックリスト(各項目に ✓、要件・達成項目) |
| `team` | 複数人の紹介(円形写真の列並び、2〜4人) |
| `lead` | 導入メッセージ(明るい面・左寄せ。takeawayの明るい版) |
| `funnel` | 絞り込みの段階(3〜5段、最終段が強調) |
| `flow` | 矢印つき横フロー(プロセス・構成、2〜4項目) |
| `agenda-grid` | 目次の2列版(項目7個以上。番号は左→右の順) |
| `pyramid` | 階層構造(3〜4段、頂点が強調。ビジョン→施策等) |
| `venn` | 2円ベン図(li 3つ: 左・右・共通。共通は短く) |
| `before-after` | ラベル付き画像比較(h2ラベル+画像 ×2) |
| `logos` | ロゴ・実績の並び(グレースケール表示) |
| `gantt` | 簡易ガントチャート(表の1列目=タスク、期間セルに x でバー) |
| `org` | 体制図・組織図(h2=トップ、ul=配下2〜4ボックス、接続線つき) |
| `title-visual` | 写真・キービジュアル入り表紙(`![bg right:45%]` と併用) |
| `exec-summary` | エグゼクティブサマリー(blockquote=結論+要点リスト) |
| `content-lead` | タイトル+リード文+本文(最初の段落が強調される) |
| `comparison-3` | 対比3列(h2×3が各列の見出し) |
| `pros-cons` | メリット・デメリット(1つ目のリストに○、2つ目に×) |
| `steps-v` | 縦方向ステップ(番号付き手順。実験手順にも) |
| `cycle` | 循環プロセス(3〜4項目の円環。PDCA等) |
| `image-top` | 上画像+下テキスト(h1直後に画像、本文が下) |
| `image-bottom` | 上テキスト+下画像(本文が上、画像が残り高さを使う) |
| `ranking` | ランキング(大きな順位数字、3〜5位。1位が強調) |
| `roadmap` | ロードマップ・フェーズ分割(h2×2〜4、PHASE番号自動付与+期間p) |
| `layers` | レイヤー構造(全幅の帯を積む、3〜5段。アーキテクチャ層・成熟度モデル) |
| `annotated` | 注釈付き画像(画像左+丸数字チップの注釈リスト右) |
| `matrix-3` | 3×3マトリクス(表ベース。1行目=列軸、1列目=行軸。リスク評価等) |
| `cards` | カード配置(アイコン一覧・機能一覧、4〜8項目。3列グリッド。li 先頭に画像を書くとアイコン表示: 「- ![](icon.svg) **機能名** 説明」) |
| `scorecard` | スコアカード(評価基準ごとの数値評価。「**基準** 説明 *スコア*」、スコアが左の大きな数字) |
| `transition` | Before・After / As-Is・To-Be の文章版(2列、After 側を帯で強調) |
| `changelog` | 変更履歴・更新履歴(縦レール+ノード。バージョン+日付+変更点、新しい版から) |
| `contact` | 連絡先(締めの1枚。濃色面にラベル+値) |
| `definition` | 定義・定理(用語+ヘアライン枠の定義文+任意の例) |
| `references` | 参考文献(小さめフォント) |
| `venn-3` | 3円ベン図(li 4つ: 左上・右上・下・共通。3C分析等。共通は省略可・短く) |
| `sidebar` | 本文+補足サイドバー(最後に置いた blockquote が右の縦パネルになる) |
| `callout` | 状態付きメッセージボックス(blockquote がラベル付きの箱。`callout success` / `callout warning` / `callout error` で状態を切替、無指定は NOTE) |
| `photo-grid` | 写真の2×2グリッド(3〜4枚を1つの段落に。gallery の格子版、cover で敷き詰め) |
| `image-cards` | 画像カード(「画像+タイトル+説明」を2〜4枚。タイトル1行・説明2行以内) |
| `benchmark` | 競合比較・ベンチマーク表(表の2列目=自社・提案の列が帯で強調される) |
| `tree` | ツリー(接続線つきの階層。ネスト2段まで可。分類・モジュール構成・ディレクトリ構造) |
| `radial` | 中心+放射(中心ノード=p、周囲に li 3〜6。マインドマップ・ステークホルダーマップ) |
| `positioning` | 2軸ポジショニングマップ(li 4つ: 左上→右上→左下→右下、p=軸の説明。模式図) |
| `objectives` | 発表目的・本日のゴール(番号付きの帯、2〜4項目) |
| `status` | 項目+状態チップの一覧(「**項目** 説明 *状態*」。通常3〜5項目) |
| `chain` | 矢羽根チェーン(4〜7工程の連結、最終工程が強調。バリューチェーン・パイプライン) |
| `glossary` | 用語定義の一覧(「**用語** 定義文」、3〜6語。前提知識・用語集) |
| `kanban` | 状態別のボード(h2=列名×2〜4、ul がカード。未着手・対応中・完了) |
| `io` | 入力・処理・出力(h2×3+各 ul。中央の処理が濃色で強調) |
| `quotes` | 複数の引用カード(blockquote×2〜3。顧客の声・フィードバック) |
| `browser` | スクリーンショット・UIモックアップ(画像がブラウザ風の窓枠に入る。h1+画像1枚+任意の注釈1行) |
| `zoom` | 拡大部分付き画像(画像2枚を1つの段落に: 1枚目=全体、2枚目=右下の拡大インセット) |
| `draft` | 透かしスタンプ「DRAFT」(修飾クラス。`content draft` のように既存レイアウトに重ねる。斜めの薄い大文字が入る) |
| `confidential` | 透かしスタンプ「CONFIDENTIAL」(修飾クラス。`content confidential` のように既存レイアウトに重ねる) |
| `deprecated` | 透かしスタンプ「DEPRECATED」(修飾クラス。`content deprecated` のように既存レイアウトに重ねる) |
| `causes` | 因果関係・原因分析(ul=原因2〜4個の箱 → 矢印 → p=濃色の結果箱に収束。模式図) |
| `timeline-photo` | 画像つき横タイムライン(各 li が「![](画像) **時期** 説明」、2〜4項目。沿革・プロジェクトの歩み) |
| `collage` | 画像コラージュ(画像3〜6枚を1つの段落に。定義済みスロットに散らして配置、少し傾く) |
| `steps-photo` | 画像つき横ステップ(各 li が「![](画像) **手順名** 説明」、2〜4項目。番号ラベルが画像に重なる) |
| `quote-photo` | 顔写真つき引用(円形写真+引用+名前・肩書き。顧客の声・推薦コメント) |
| `phone` | スマホ画面のモックアップ(縦長スクリーンショット1枚がスマホ枠に入る。browser のスマホ版) |
| `app-intro` | アプリ・サービス紹介(左: キャッチコピー+h2=サービス名+説明+特徴 ul、右: スマホ枠のスクリーンショット。`app-intro pc` でPC枠) |
| `stat-ring` | 円形リング付きの数値(h1=数値+p=リング内ラベル+任意p=右下注記。進捗は `stat-ring p67` のように p0〜p100 で指定) |
| `logic-tree` | ロジックツリー(p=ルート命題 → ul=第1階層2〜4個、ネスト ul=第2階層。KPI・課題の分解) |
| `pyramid-tri` | 三角形のピラミッド図(ol 3〜4個、上=頂点から。左に三角形の断面、右にラベルと説明) |
| `experiment` | 実験結果(表+条件注記は blockquote)※research |
| `math` | 数式中心(KaTeX ディスプレイ数式を拡大)※research |
| `hypothesis` | 仮説の列挙(H1・H2…チップ付きの帯、2〜4個)※research |
| `rq` | Research Question(blockquote=メインの問い(RQラベル付き)または ol=複数の問い RQ1・RQ2…)※research |
| `confusion-matrix` | 混同行列(表ベース、2×2〜4×4。対角セルが強調)※research |
| `kpi` | 数値ハイライト(大きく軽い数字、最大4つ)※business |
| `plans` | 料金プラン・パッケージ比較(2〜3列)※business |
| `persona` | ペルソナ(角版写真+ゴール・課題等の小ラベル2列)※business |
| `tam-sam-som` | 市場規模(TAM・SAM・SOMの入れ子バー3段)※business |
| `tam-sam-som-circle` | 市場規模(下端揃えの同心円3層。構造は tam-sam-som と同一)※business |
| `case-study` | 導入事例(顧客の声を主役に、課題→効果は下段)※business |
| `journey` | カスタマージャーニー(連続レール+ノード+感情タグ、3〜5段)※business |
| `forces` | 5 Forces・業界構造(li 5つ、順序: 中央→上→左→右→下。中央が濃色で強調)※business |
| `bmc` | ビジネスモデルキャンバス(li 9つ、順序固定。価値提案が強調。内容は1〜2行)※business |
| `impact` | 導入効果(「**ラベル** *前の値* *後の値*」の Before→After 数値ペア、2〜4行)※business |
| `okr` | OKR(blockquote=Objective の帯 + ol=Key Results。末尾の em が進捗・実績値)※business |
| `actions` | アクションプラン(「**タスク** 説明 *担当* *期限*」、3〜6行。番号自動付与)※business |
| `swot` | SWOT分析(li 4つ、順序: 強み→弱み→機会→脅威。S/W/O/T自動付与)※business |
| `pest` | PEST分析(li 4つ、順序: 政治→経済→社会→技術。P/E/S/T自動付与)※business |
| `risks` | リスク分析(「**リスク名** 説明・対策 *高* *大*」。em 1つ目=発生確率、2つ目=影響度のチップ)※business |
| `quiz` | 演習・クイズ(Qラベル+問題文+選択肢A〜D)※lecture |
| `answer` | 解答・解説(Aラベル+答え+解説。quiz とペアで使う)※lecture |
| `code-focus` | コードの注目点(コード左+丸数字注釈右。annotated のコード版)※lecture |
| `misconception` | よくある誤解(✗誤解 → ○事実のペア)※lecture |
| `cheatsheet` | チートシート(「`コマンド` 説明」の密な2列、6〜12個)※lecture |
| `code-compare` | 良い例・悪い例のコード対比(h2×2+pre×2。✗/○自動付与)※lecture |

選択の目安:
- 列の切れ目を制御したい対比 → `comparison`(`two-column` は自動流し込み)
- 図の説明 → 本文が主なら `image-right`/`image-left`、図が主なら `image-full`、
  横長の図なら上下分割の `image-top`/`image-bottom`
- 数値比較 → `table`、実験結果+条件 → `experiment`、少数の数値を大きく見せる → `kpi`
- 聴衆に持ち帰らせたい一言 → `takeaway`
- 時系列 → 項目が多い/説明短い: `timeline`(縦)、項目2〜5で横に流す: `timeline-h`、期間の重なりを見せる: `gantt`、フェーズごとに項目を並べる: `roadmap`
- 順位・大小の序列 → `ranking`、システムの層・成熟度の段階 → `layers`(横帯)か `pyramid`(三角)
- 体制・組織の構造 → `org`(人の顔を見せるなら `team`)
- 手順・フロー(時期でなく順序) → 横に番号: `steps`、縦に番号: `steps-v`、箱と矢印: `flow`、循環: `cycle`
- 2案比較 → `comparison`、3案比較 → `comparison-3`、賛否 → `pros-cons`
- 結論を最初に言う1枚 → `exec-summary`
- グラフ(棒・折れ線・散布図等) → 作図した画像(SVG/PNG)を `image-full`(1枚)/
  `gallery`(複数)/ `image-left`+解釈リスト(グラフ+解釈)に貼るのが標準手順。
  CSSでグラフは描かない。分岐フロー・シーケンス図など複雑な構成図も同様に画像を貼る。
  ただし「模式図」はクラスで描ける: ツリー `tree`、放射 `radial`、2軸マップ `positioning`
  (いずれもデータ比例ではなく構造の表現。正確な座標・比率が必要なら画像)
- 段階的な絞り込み(問い合わせ→受注 等) → `funnel`
- 章の間の問いかけ・メッセージ → 濃色面: `takeaway`、明るい面: `lead`
- 目次が7項目以上 → `agenda-grid`。章の途中で再掲するときは現在位置の項目を **太字** にする
- 並列の特徴・強み(3つ前後) → `columns`(テキスト)、数値なら `kpi`
- ラベルと値のペア(概要・仕様) → `spec`、想定問答 → `faq`
- 4象限の整理(SWOT等) → `matrix`、3×3(リスク評価・優先度) → `matrix-3`、2集合の関係 → `venn`、3集合・3C分析 → `venn-3`、階層 → `pyramid`
- 画像の特定箇所を説明したい → `annotated`(画像内には作図時に①②を入れる)
- 画像1枚 → `image-full`、複数枚を見比べる → `gallery`、画像+タイトル+説明 → `image-cards`、ラベル付きで対比 → `before-after`
- 実績・パートナーのロゴ → `logos`、プラン・パッケージの比較 → `plans`
- 数字1つで驚かせたい → `stat`(複数の数値なら `kpi`)
- 発表者・担当者の紹介 → 1人: `profile`、複数人: `team`
- コードを見せる → `code`、要件・準備事項の確認 → `checklist`
- 他者の言葉(顧客の声・先行研究) → `quote`
- 機能・アイコン一覧(5項目以上、複数行に折り返したい) → `cards`(3列前後で収まるなら `columns`)
- 選定基準・評価軸ごとの数値評価 → `scorecard`
- 施策前後・現状と理想の文章比較(画像でなく文章で) → `transition`(画像比較は `before-after`)
- バージョン・更新履歴 → `changelog`
- 連絡先の一覧(終了スライドの発展形) → `contact`
- 用語・定理の定義 → `definition`
- 発表目的・学習目標・本日のゴール → `objectives`
- 演習・クイズ → `quiz` と `answer` のペアで(lecture)
- コードを箇所ごとに解説 → `code-focus`(画像なら `annotated`)(lecture)
- ありがちな誤解の訂正 → `misconception`(lecture)
- 想定ユーザー像の整理 → `persona`(business)
- 市場規模(TAM/SAM/SOM) → バーで簡潔に: `tam-sam-som`、円の重なりで包含関係を見せる: `tam-sam-som-circle`(business)
- 導入事例・顧客事例 → `case-study`(business)
- 顧客の導入プロセスと心理変化 → `journey`(business)
- 本文に補足・注記・脚注を添える → `sidebar`(補足は最後の blockquote に書く)
- 注意点・Tip・警告・成功/失敗の報告 → `callout`(状態は `callout warning` 等の修飾で)
- 写真を格子に敷き詰める(3〜4枚) → `photo-grid`(横1列で見比べるなら `gallery`)
- プロジェクト進捗・対応状況を状態チップ付きで一覧化 → `status`(完了項目だけなら `checklist`)
- 業界構造・競争環境の分析(5 Forces) → `forces`(business)
- ビジネスモデル全体を1枚に → `bmc`(business)
- 競合・製品・機能の比較表(自社列を目立たせる) → `benchmark`(数値中心の素の表は `table`)
- 導入効果・改善の前後を数値で → `impact`(business。文章の前後比較は `transition`)
- 目標と進捗(OKR・KPIの達成状況) → `okr`(business。数値の羅列だけなら `kpi`)
- 研究の仮説を列挙 → `hypothesis`(research)
- コマンド・構文の早見表 → `cheatsheet`(lecture)
- 階層の分類・モジュール構成・ディレクトリ構造 → `tree`(組織・体制は `org`)
- 中心テーマと周辺要素(マインドマップ・ステークホルダーマップ・エコシステム) → `radial`
- 2軸での位置づけ(ポジショニングマップ・象限分析) → `positioning`(4象限の整理は `matrix`、実データの散布図は画像)
- バリューチェーン・サプライチェーン・多工程のパイプライン(4〜7工程) → `chain`(2〜4項目なら `flow`)
- 前提知識・用語集(複数の用語を定義) → `glossary`(1語を主役に据えるなら `definition`)
- タスクを未着手・対応中・完了の列で見せる → `kanban`(状態チップ付きの一覧なら `status`)
- タスク・担当・期限のアクションプラン → `actions`(business。担当・期限が不要なら `status`)
- 分類結果の混同行列 → `confusion-matrix`(research。一般の数値表は `table`)
- SWOT分析 → `swot`(business。任意ラベルの4象限は `matrix`)
- 入力・処理・出力の3段構成 → `io`(順に流すだけなら `flow`)
- 複数の引用・顧客の声を並べる → `quotes`(1つを全面に据えるなら `quote`、事例1件の深掘りは `case-study`)
- コードの良い例・悪い例の対比 → `code-compare`(lecture。文章の対比は `misconception`)
- スクリーンショット・UIモックアップ・デバイスモックアップ → `browser`(枠なしで大きく見せるなら `image-full`)
- 画像の一部を拡大して見せる → `zoom`(箇所の説明を並べるなら `annotated`)
- 仮置き・ドラフト・社外秘・廃止済みの明示 → `draft` / `confidential` / `deprecated` を既存レイアウトに重ねる(右上の小さな表示で足りるなら `_header: DRAFT`)
- 研究の問い(Research Question) → `rq`、その検証仮説 → `hypothesis`(research)
- 外部環境の整理(PEST) → `pest`(business。内外両面を見るなら `swot`)
- リスクの一覧と対策 → `risks`(business。確率×影響のマトリクスは `matrix-3`)
- 原因分析・因果関係(複数原因→1つの結果) → `causes`(直列の流れは `flow`、中心放射は `radial`。複雑な因果グラフは作図画像)
- 写真つきの沿革・歩み → `timeline-photo`(画像なしの時系列は `timeline` / `timeline-h`)
- 複数の写真を散らして雰囲気で見せる → `collage`(整然と並べるなら `gallery` / `photo-grid`)
- 画像つきの手順・チュートリアル → `steps-photo`(画像なしは `steps` / `steps-v`)
- 発言者の顔を見せる引用・推薦コメント → `quote-photo`(写真なしは `quote`、複数の声は `quotes`)
- アプリ・サービスの紹介(スクリーンショット+説明) → `app-intro`(モバイルは素のまま、PC画面は `app-intro pc`)
- スマホ画面だけを大きく見せる → `phone`(PC画面は `browser`)
- 割合1つを円形リングで見せる → `stat-ring`(リングなしは `stat`、複数の数値は `kpi`)
- KPI・課題・工数の分解(ロジックツリー・イシューツリー) → `logic-tree`(分類・ディレクトリ構造は `tree`、原因の収束は `causes`)
- 階層を三角形で見せる → `pyramid-tri`(横帯で見せるなら `pyramid`)

補足:
- どのクラスでも Marp 標準の背景画像記法が使える。
  `![bg right:40%](path)` で右40%に画像、`![bg fit](path)` で全面背景(写真=cover、図=fit)
- 機密区分・所属・コピーライトはヘッダー・フッターで表示する。
  フロントマターの `header: CONFIDENTIAL` / `footer: © 2026 ...`、
  1枚だけなら `<!-- _header: ... -->` / `<!-- _footer: ... -->`(ヘッダー=右上、フッター=左下)
- `kpi` は「**数値** ラベル *前年比 +12%*」のように em を足すと前年差・目標差の行になる
- 進捗バー(上端にページ進行のバー)はデッキ単位でON:
  frontmatter に `style: |` + `  section { --sf-progress: block; }` を書く
- 変更前後のコードは言語を `diff` にすると +/− が色分けされる
- 色・フォント・作図時のグラフパレットの正は `references/design.md` を参照

### 3. Markdown を書く

フロントマターのテンプレート:

```yaml
---
marp: true
theme: research   # または business
size: 16:9
paginate: true
math: katex       # 数式を使う場合のみ
---
```

各スライドは `---` 区切り+先頭に `<!-- _class: クラス名 -->`。
`title` と `end` には `<!-- _paginate: false -->` も付ける。

制約(品質担保のため厳守):

- スライドタイトル(h1)は1行に収める(改行するとimage系レイアウトが崩れる)
- 1スライドの箇条書きは5項目程度まで、ネストは1段まで
- `image-right`/`image-left`/`image-full` では画像は1枚だけ、単独の段落に置く
- `comparison` の h2 は2つまで

### 4. ビルドして検証する(必須ループ)

`$FORGE` は**このSKILL.mdが置かれているディレクトリ**の絶対パス(セットアップの項と同じ)。

```bash
# 1. ビルド
npx --prefix "$FORGE" marp --theme-set "$FORGE/theme/" --html --allow-local-files slides.md -o build/slides.html
# 2. 機械チェック(はみ出し検出)
node "$FORGE/scripts/check-overflow.mjs" build/slides.html
# 3. PNG化して目視確認
npx --prefix "$FORGE" marp --theme-set "$FORGE/theme/" --html --allow-local-files --images png slides.md -o build/png/slides.png
```

- check-overflow が NG を出したら、該当スライドの内容を削る・分割する(フォントを縮めるのは最終手段)
- **全PNGを Read で読み、崩れ・違和感・はみ出しを目視確認する**(機械チェックはデザイン的違和感を拾えない)
- 修正したら 1 に戻る。両方パスするまで繰り返す

### 5. 人が直接編集したいとき: 編集WebUIを起動する

検証ループを通したデッキを人に見せて仕上げてもらいたいときは、エージェント自身でWebUIを起動してよい。
サーバは自動で終了しないプロセスなので、**フォアグラウンドで絶対に実行しない**(エージェントの実行をブロックする)。
バックグラウンドで起動してURLを人に伝える:

```bash
nohup npm --prefix "$FORGE" run webui -- <file.md> > /tmp/slide-forge-webui.log 2>&1 &
```

起動したら http://127.0.0.1:5757 をユーザーに伝える(Canva風エディタ。スライド上のテキストを直接編集できる)。
別のファイルを開き直すなどでポートが衝突する場合は `-- --port <番号>` を付与する。

- ライブプレビュー: `npx --prefix "$FORGE" marp --theme-set "$FORGE/theme/" --html --server <ディレクトリ>`
- PDF が欲しい場合: `--pdf --allow-local-files`(ローカル画像には `--allow-local-files` 必須)

## トラブルシューティング

- ローカル画像が出ない → `--allow-local-files` を付ける
- レイアウトが足りない → まずは既存クラスの組み合わせで表現できないかを検討。足す場合は `theme/core.css`(汎用)か `theme/research.css`(研究特有)にクラスを追加し、検証ループ(ビルド→check-overflow→PNG目視)を回す。
  slide-forgeリポジトリ本体(単体インストールではなく `git clone` した場合)で作業しているなら、`examples/demo-research.md` にサンプルを足しておくと回帰検証しやすい。運用ルールの詳細はリポジトリルートの `docs/ROADMAP.md`(スキル単体配布には含まれないリポジトリ管理者向け文書)を参照
- Marp 内部スタイルに負ける → セクション配置系は `!important` が必要(core.css の既存例を参照)
