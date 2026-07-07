---
marp: true
theme: research
size: 16:9
paginate: true
math: katex
---

<!-- _class: title -->
<!-- _paginate: false -->

# slide-forge デモ: 研究発表テンプレート

全16レイアウトのカタログ兼検証デッキ

発表者名

2026年7月8日 · 研究室ゼミ

---

<!-- _class: title-visual -->
<!-- _paginate: false -->

![bg right:45% fit](assets/placeholder-figure.svg)

# 局所特徴を考慮した画像生成の自動評価

キービジュアル入り表紙の例

発表者名

2026年7月8日 · 研究室ゼミ

---

<!-- _class: agenda -->

# 本日の内容

1. 研究背景と課題
2. 提案手法
3. 実験と結果
4. まとめと今後の課題

---

<!-- _class: divider -->

# 1. 研究背景と課題

なぜこの問題に取り組むのか

---

<!-- _class: lead -->

# 生成画像の「良さ」を、人手に頼らず測れるか。

本研究が取り組む問い

---

<!-- _class: content -->

# 研究背景

- 画像生成モデルの評価には人手評価が広く使われている
  - 評価コストが高く、再現性に課題がある
- CLIPスコアによる自動評価が注目されている
  - テキストと画像の整合性を埋め込み空間で測定
- **課題**: 既存手法は細部の品質劣化を捉えられない

> 本研究では、局所特徴を考慮した自動評価指標を提案する

---

<!-- _class: two-column -->

# 関連研究の整理

## 自動評価指標

- CLIPスコア: テキスト整合性
- FID: 分布間距離
- LPIPS: 知覚的類似度

## 人手評価

- MOS: 平均オピニオン評価
- ペア比較: 相対品質評価

## 既存手法の限界

- 大域特徴のみで局所劣化を無視
- 評価対象ドメインへの依存
- 人手評価との相関が不十分

---

<!-- _class: image-right -->

# 提案手法の構成

- エンコーダで局所特徴を抽出
- デコーダ側でテキスト条件を融合
- 局所・大域スコアを統合して出力

**ポイント**: 既存のCLIP埋め込みを再利用し、追加学習を最小化

![](assets/placeholder-figure.svg)

---

<!-- _class: image-left -->

# 局所特徴抽出の詳細

- パッチ単位で特徴マップを分割
- 各パッチとテキストの類似度を計算
- 低スコアパッチを劣化候補として重み付け

これにより細部の品質劣化を明示的に評価できる

![](assets/placeholder-figure.svg)

---

<!-- _class: image-full -->

# 評価スコアの分布

![](assets/placeholder-chart.svg)

提案手法は人手評価との相関が単調に向上する

---

<!-- _class: venn -->

# 提案の位置づけ

- **既存の自動評価** 大域特徴・テキスト整合性・追加学習なし
- **人手評価** 細部の品質・高コスト・再現性に課題
- **提案手法** 両者の橋渡し

---

<!-- _class: before-after -->

# 評価の改善例

## ベースライン

![](assets/placeholder-figure.svg)

## 提案手法

![](assets/placeholder-chart.svg)

同一プロンプトに対するスコアの説明性が向上

---

<!-- _class: gallery -->

# 生成結果の比較

![](assets/placeholder-figure.svg) ![](assets/placeholder-chart.svg)

左: ベースライン、右: 提案手法(細部の破綻が減少)

---

<!-- _class: profile -->

# 発表者紹介

## 発表 太郎

- **所属** ◯◯大学大学院 △△研究室(M2)
- **研究テーマ** 画像生成の自動評価
- **経歴** ◯◯大学 工学部卒(2025)
- **連絡先** contact@example.com

![](assets/placeholder-portrait.svg)

---

<!-- _class: comparison -->

# 既存手法との比較

## 既存: CLIPスコア

- 大域特徴のみを使用
- 細部劣化に鈍感
- 追加学習不要

## 提案手法

- 局所+大域特徴を統合
- 細部劣化を明示的に評価
- 追加学習は軽量な統合層のみ

---

<!-- _class: table -->

# 評価データセット

| データセット | 画像数 | ドメイン | 人手評価 |
|---|---|---|---|
| COCO-Eval | 5,000 | 一般物体 | あり |
| DrawBench | 200 | プロンプト網羅 | あり |
| PartiPrompts | 1,600 | 構図・関係 | 一部 |

各データセットで人手評価スコアとの順位相関を測定

---

<!-- _class: experiment -->

# 実験結果: 人手評価との相関

| 手法 | COCO-Eval | DrawBench | PartiPrompts |
|---|---|---|---|
| CLIPスコア | 0.542 | 0.481 | 0.463 |
| FID | 0.315 | — | — |
| LPIPS | 0.428 | 0.402 | 0.391 |
| **提案手法** | **0.687** | **0.634** | **0.612** |

> 条件: Spearman順位相関。生成モデルはSDXL、サンプル数は各データセット全量。太字は最良値。

---

<!-- _class: math -->

# スコアの定式化

局所スコアと大域スコアを重み付き和で統合する:

$$
S(x, t) = \lambda \cdot \frac{1}{N} \sum_{i=1}^{N} w_i \, \mathrm{sim}(f_i(x), g(t)) + (1 - \lambda) \cdot \mathrm{sim}(f(x), g(t))
$$

- $f_i(x)$: パッチ $i$ の局所特徴、$g(t)$: テキスト埋め込み
- $w_i$: 劣化候補パッチへの重み、$\lambda$: 統合係数

---

<!-- _class: code -->

# スコア計算の実装

```python
def slide_forge_score(image, text, patches, lam=0.6):
    local = sum(w * sim(f(p), g(text)) for p, w in patches) / len(patches)
    global_ = sim(f(image), g(text))
    return lam * local + (1 - lam) * global_
```

CLIP埋め込み f, g は既存モデルを再利用し、追加学習は統合係数のみ

---

<!-- _class: quote -->

# 先行研究の指摘

> 既存の自動評価指標は大域的な整合性に偏っており、局所的な品質劣化を捉えられていない。

Hessel et al., EMNLP 2021(意訳)

---

<!-- _class: takeaway -->

# 局所特徴の導入だけで、人手評価との相関は 0.54 → 0.69 に向上する

追加学習は統合層のみ、推論コストは1.2倍に収まる

---

<!-- _class: content-lead -->

# 考察

局所特徴の寄与は劣化タイプに依存し、特に構造破綻で顕著だった。

- 構造破綻(手指・文字)では相関が +0.21 と最も改善
- 色調・スタイルの劣化では既存手法と同等
- **限界**: パッチ粒度が固定のため、微細なテクスチャ劣化は捉えきれない

---

<!-- _class: steps-v -->

# 実験手順

1. **データ準備** 3データセットから生成画像と人手評価を収集
2. **スコア計算** 提案手法と既存4手法でスコアを算出
3. **相関評価** Spearman順位相関で人手評価との一致度を測定
4. **アブレーション** 局所・大域の寄与を分解して検証

---

<!-- _class: gantt -->

# 研究計画

| タスク | 7月 | 8月 | 9月 | 10月 | 11月 | 12月 |
|---|---|---|---|---|---|---|
| 劣化タイプ別の分析 | x | x |  |  |  |  |
| 動画生成への拡張実験 |  | x | x | x |  |  |
| 国内研究会発表 |  |  | x |  |  |  |
| 追加実験・アブレーション |  |  |  | x | x |  |
| 国際会議への投稿 |  |  |  |  | x | x |

バーの期間は暫定。査読結果により調整

---

<!-- _class: timeline -->

# 今後の予定

1. **7月** 劣化タイプ別の分析を追加
2. **8月** 動画生成への拡張実験
3. **9月** 国内研究会で発表
4. **12月** 国際会議へ投稿

---

<!-- _class: summary -->

# まとめ

- 局所特徴を考慮した画像生成の自動評価指標を提案した
  - CLIP埋め込みを再利用し追加学習を最小化
- 3つのデータセットで人手評価との相関が既存手法を上回った
- 今後の課題: 動画生成への拡張、劣化タイプ別の分析

---

<!-- _class: references -->

# 参考文献

1. Radford, A. et al.: Learning Transferable Visual Models From Natural Language Supervision, ICML, 2021.
2. Hessel, J. et al.: CLIPScore: A Reference-free Evaluation Metric for Image Captioning, EMNLP, 2021.
3. Heusel, M. et al.: GANs Trained by a Two Time-Scale Update Rule Converge to a Local Nash Equilibrium, NeurIPS, 2017.
4. Zhang, R. et al.: The Unreasonable Effectiveness of Deep Features as a Perceptual Metric, CVPR, 2018.
5. Saharia, C. et al.: Photorealistic Text-to-Image Diffusion Models with Deep Language Understanding, NeurIPS, 2022.

---

<!-- _class: end -->
<!-- _paginate: false -->

# ご清聴ありがとうございました

質疑応答へ

contact@example.com
