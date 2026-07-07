# レイアウトカタログ(完全サンプル)

各レイアウトの「そのまま使える」Markdownサンプル。実レンダリング例は
`~/projects/slide-forge/examples/demo-research.md` をビルドすると確認できる。

## title — 表紙

構造: h1(タイトル) → p(サブタイトル) → p(発表者) → p(日付・場所)

```markdown
<!-- _class: title -->
<!-- _paginate: false -->

# 発表タイトル

サブタイトルや一言説明

発表者名

2026年7月8日 · 発表の場
```

## agenda — 目次

構造: h1 + 番号付きリスト(番号は自動で 01, 02, ... と装飾される)

```markdown
<!-- _class: agenda -->

# 本日の内容

1. 研究背景と課題
2. 提案手法
3. 実験と結果
4. まとめ
```

## divider — セクション区切り

構造: h1(セクション名) + 任意の p(補足)。番号は h1 に含めて書く

```markdown
<!-- _class: divider -->

# 1. 研究背景と課題

なぜこの問題に取り組むのか
```

## content — 標準スライド

構造: h1 + 箇条書き(ネスト1段まで)/段落/blockquote(強調ボックス)

```markdown
<!-- _class: content -->

# 研究背景

- 主張のポイント1
  - 補足説明
- 主張のポイント2
- **課題**: 強調したいこと

> 結論やメッセージはblockquoteで強調ボックスにできる
```

## two-column — 2段組

構造: h1(全幅) + 本文(左→右へ自動流し込み)。h2 で小見出しを立てられる。
列の切れ目は自動なので、切れ目を制御したいときは comparison を使う。

```markdown
<!-- _class: two-column -->

# 関連研究の整理

## 自動評価指標

- 項目1
- 項目2

## 人手評価

- 項目1
- 項目2
```

## image-right / image-left — 本文+画像

構造: h1 + 本文(箇条書き・段落) + 画像1枚(単独の段落)。
画像は右(左)側の固定領域に自動配置・contain される。

```markdown
<!-- _class: image-right -->

# 提案手法の構成

- ポイント1
- ポイント2

**補足**: 強調したい一言

![](figs/architecture.png)
```

## image-full — 図が主役

構造: h1 + 画像1枚 + 任意の注釈1行(中央寄せ・小さめ表示になる)

```markdown
<!-- _class: image-full -->

# 評価スコアの分布

![](figs/result-chart.png)

図から言えることを1行で
```

## comparison — 対比2列

構造: h1 + (h2 + 内容) × 2。h2 がカード風の列見出しになり、2つ目の h2 から右列に切り替わる。

```markdown
<!-- _class: comparison -->

# 既存手法との比較

## 既存手法

- 特徴1
- 特徴2

## 提案手法

- 特徴1
- 特徴2
```

## table — 表が主役

構造: h1 + テーブル + 任意の p(注記、中央寄せになる)

```markdown
<!-- _class: table -->

# 評価データセット

| データセット | 画像数 | ドメイン |
|---|---|---|
| COCO-Eval | 5,000 | 一般物体 |
| DrawBench | 200 | プロンプト網羅 |

表の読み方や補足を1行で
```

## takeaway — メッセージ強調

構造: h1(伝えたい一言) + 任意の p(補足)。1枚1メッセージ。グラデーション背景・白文字。

```markdown
<!-- _class: takeaway -->

# 局所特徴の導入だけで、相関は 0.54 → 0.69 に向上する

補足の一言(根拠や条件)
```

## summary — まとめ

構造: h1 + 箇条書き(トップレベルがカードになる。ネストはカード内の通常リスト)

```markdown
<!-- _class: summary -->

# まとめ

- 提案内容の要約
  - 補足
- 結果の要約
- 今後の課題: 一言
```

## end — 終了スライド

```markdown
<!-- _class: end -->
<!-- _paginate: false -->

# ご清聴ありがとうございました

質疑応答へ

contact@example.com
```

## experiment — 実験結果(research スキン)

構造: h1 + テーブル(数値は右寄せされる) + blockquote(実験条件・注記)。
最良値は `**太字**` で示す。

```markdown
<!-- _class: experiment -->

# 実験結果: 人手評価との相関

| 手法 | データセットA | データセットB |
|---|---|---|
| ベースライン | 0.542 | 0.481 |
| **提案手法** | **0.687** | **0.634** |

> 条件: 評価指標・モデル・サンプル数などをここに書く。
```

## math — 数式中心(research スキン)

構造: h1 + 導入1行 + `$$...$$`(拡大表示される) + 記号説明の箇条書き

```markdown
<!-- _class: math -->

# スコアの定式化

局所スコアと大域スコアを重み付き和で統合する:

$$
S(x, t) = \lambda \cdot s_{\mathrm{local}}(x, t) + (1 - \lambda) \cdot s_{\mathrm{global}}(x, t)
$$

- $s_{\mathrm{local}}$: 局所スコア、$s_{\mathrm{global}}$: 大域スコア
- $\lambda$: 統合係数
```

## references — 参考文献(research スキン)

構造: h1 + 番号付きリスト(小さめフォント・詰めて表示される)

```markdown
<!-- _class: references -->

# 参考文献

1. Author, A. et al.: Paper Title, Conference, Year.
2. Author, B. et al.: Paper Title, Journal, Year.
```
