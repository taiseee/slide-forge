---
name: slide-forge
description: |
  **slide-forge スライド作成スキル**: Marp Markdown からスタイリッシュな HTML スライドを生成する。厳選レイアウトクラス+品質検証ループ(overflow機械チェック+PNG目視)で一定品質を担保する。
  MANDATORY TRIGGERS: スライド作成, スライドを作って, 発表資料, プレゼン資料, Marp, marp, slide-forge, 研究発表スライド, ゼミ発表, 学会発表
  スライドの新規作成・編集・レイアウト調整・ビルド全般でこのスキルに従うこと。
---

# slide-forge スライド作成スキル

Marp Markdown を唯一のソースとし、HTML は常にビルド成果物として扱う。
リソース(テーマ・スクリプト・カタログ)は `~/projects/slide-forge/` にある。

## 原則

1. **内容と装飾の分離**: エージェントが書くのは「内容(Markdown)」と「レイアウト選択(`<!-- _class: ... -->`)」だけ。配置・余白・色は全てテーマCSSが決める
2. **生HTMLは書かない**: `<div>` やインラインstyleでのレイアウト組みは禁止。表現できないレイアウトが必要なら、テーマにクラスを追加する(`~/projects/slide-forge/theme/`)
3. **検証せずに完成としない**: 下記の品質検証ループを必ず回す

## ワークフロー

### 0. スキン(テーマ)を選ぶ

- `research` — 研究発表(ゼミ・学会・進捗報告)。ネイビー系
- `business` — ビジネス(提案・報告・事業説明)。インディゴ系

### 1. レイアウトを選ぶ

利用可能なクラス(詳細サンプルは `~/projects/slide-forge/skill/references/layouts.md` を読む):

| クラス | 用途 |
|---|---|
| `title` | 表紙(タイトル・サブタイトル・発表者・日付) |
| `agenda` | 目次(番号付きリスト) |
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
| `experiment` | 実験結果(表+条件注記は blockquote)※research |
| `math` | 数式中心(KaTeX ディスプレイ数式を拡大)※research |
| `references` | 参考文献(小さめフォント)※research |
| `kpi` | 数値ハイライト(大きく軽い数字、最大4つ)※business |
| `plans` | 料金プラン・パッケージ比較(2〜3列)※business |

選択の目安:
- 列の切れ目を制御したい対比 → `comparison`(`two-column` は自動流し込み)
- 図の説明 → 本文が主なら `image-right`/`image-left`、図が主なら `image-full`
- 数値比較 → `table`、実験結果+条件 → `experiment`、少数の数値を大きく見せる → `kpi`
- 聴衆に持ち帰らせたい一言 → `takeaway`
- 時系列 → 項目が多い/説明短い: `timeline`(縦)、項目2〜5で横に流す: `timeline-h`、期間の重なりを見せる: `gantt`
- 体制・組織の構造 → `org`(人の顔を見せるなら `team`)
- 手順・フロー(時期でなく順序) → 番号で見せる: `steps`、箱と矢印で見せる: `flow`
- 段階的な絞り込み(問い合わせ→受注 等) → `funnel`
- 章の間の問いかけ・メッセージ → 濃色面: `takeaway`、明るい面: `lead`
- 目次が7項目以上 → `agenda-grid`
- 並列の特徴・強み(3つ前後) → `columns`(テキスト)、数値なら `kpi`
- ラベルと値のペア(概要・仕様) → `spec`、想定問答 → `faq`
- 4象限の整理(SWOT等) → `matrix`、2集合の関係 → `venn`、階層 → `pyramid`
- 画像1枚 → `image-full`、複数枚並べる → `gallery`、ラベル付きで対比 → `before-after`
- 実績・パートナーのロゴ → `logos`、プラン・パッケージの比較 → `plans`
- 数字1つで驚かせたい → `stat`(複数の数値なら `kpi`)
- 発表者・担当者の紹介 → 1人: `profile`、複数人: `team`
- コードを見せる → `code`、要件・準備事項の確認 → `checklist`
- 他者の言葉(顧客の声・先行研究) → `quote`

補足: どのクラスでも Marp 標準の背景画像記法が使える。
`![bg right:40%](path)` で右40%に画像、`![bg fit](path)` で全面背景。

### 2. Markdown を書く

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

### 3. ビルドして検証する(必須ループ)

```bash
FORGE=~/projects/slide-forge
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

### 4. 人間の確認用

- ライブプレビュー: `npx --prefix "$FORGE" marp --theme-set "$FORGE/theme/" --html --server <ディレクトリ>`
- PDF が欲しい場合: `--pdf --allow-local-files`(ローカル画像には `--allow-local-files` 必須)

## トラブルシューティング

- ローカル画像が出ない → `--allow-local-files` を付ける
- レイアウトが足りない → `theme/core.css`(汎用)か `theme/research.css`(研究特有)にクラスを追加し、`examples/demo-research.md` にサンプルを1枚足して検証ループを回す。詳細は `~/projects/slide-forge/docs/ROADMAP.md` の運用ルール参照
- Marp 内部スタイルに負ける → セクション配置系は `!important` が必要(core.css の既存例を参照)
