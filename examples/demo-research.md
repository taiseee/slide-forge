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

<!-- _class: takeaway -->

# 局所特徴の導入だけで、人手評価との相関は 0.54 → 0.69 に向上する

追加学習は統合層のみ、推論コストは1.2倍に収まる

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
