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
| `takeaway` | メッセージ強調(1枚1メッセージ、グラデーション背景) |
| `summary` | まとめ(要点カード) |
| `end` | 終了スライド |
| `experiment` | 実験結果(表+条件注記は blockquote)※research |
| `math` | 数式中心(KaTeX ディスプレイ数式を拡大)※research |
| `references` | 参考文献(小さめフォント)※research |

選択の目安:
- 列の切れ目を制御したい対比 → `comparison`(`two-column` は自動流し込み)
- 図の説明 → 本文が主なら `image-right`/`image-left`、図が主なら `image-full`
- 数値比較 → `table`、実験結果+条件 → `experiment`
- 聴衆に持ち帰らせたい一言 → `takeaway`

### 2. Markdown を書く

フロントマターのテンプレート:

```yaml
---
marp: true
theme: research
size: 16:9
paginate: true
math: katex
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
