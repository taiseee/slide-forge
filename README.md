# slide-forge

AIエージェントファーストの Marp → HTML スライド作成基盤。

エージェント(Claude Code 等)が高品質なスライドを安定して生成できるように、
「厳選されたレイアウトクラス」「用途別スキン」「機械+目視の品質検証ループ」を1つのリポジトリにまとめたもの。

## 設計思想

- **Marp Markdown が唯一のソース**。HTML/PDF は常にビルド成果物であり、直接編集しない
- **内容と装飾の分離**: 書くのは内容とレイアウト選択(`<!-- _class: ... -->`)だけ。配置・余白・色は全てテーマCSSが決める
- **レイアウトクラスのみ**: ユーティリティクラスや生HTMLでの組み立ては提供しない。表現が足りなければテーマにクラスを追加して育てる
- **検証してから完成**: overflow 機械チェック(Puppeteer)+全スライドPNGの目視確認をワークフローに組み込む

## 構成

```
theme/
  core.css        # 全レイアウトクラス(構造のみ、色はCSS変数)
  research.css    # 研究発表スキン(配色 + experiment/math/references)
  business.css    # ビジネススキン(配色 + kpi/plans)
scripts/
  check-overflow.mjs  # スライドのはみ出しを機械検出
skill/
  SKILL.md            # エージェントスキル(ワークフロー+カタログ索引)
  references/layouts.md  # レイアウト別の完全サンプル
examples/
  demo-research.md    # 研究スキンのカタログ兼検証デッキ(16レイアウト)
  demo-business.md    # ビジネススキンのカタログ兼検証デッキ
docs/
  ROADMAP.md          # 目指す姿・現状・TODO
  DESIGN.md           # デザイン基盤(トークン・書式ルール)
```

## クイックスタート

```bash
npm install

# ビルド
npx marp --theme-set theme/ --html --allow-local-files examples/demo-research.md -o build/demo.html

# はみ出しチェック
node scripts/check-overflow.mjs build/demo.html

# PNG化(目視確認用)
npx marp --theme-set theme/ --html --allow-local-files --images png examples/demo-research.md -o build/png/demo.png

# ライブプレビュー
npx marp --theme-set theme/ --html --server examples/
```

## レイアウトカタログ(56種)

| 系統 | クラス |
|---|---|
| コア | `title` `title-visual` `agenda` `agenda-grid` `divider` `content` `content-lead` `two-column` `image-right` `image-left` `image-top` `image-bottom` `image-full` `annotated` `comparison` `comparison-3` `pros-cons` `table` `takeaway` `lead` `exec-summary` `summary` `end` `timeline` `timeline-h` `steps` `steps-v` `flow` `cycle` `funnel` `gantt` `roadmap` `columns` `spec` `faq` `matrix` `matrix-3` `venn` `pyramid` `layers` `ranking` `gallery` `before-after` `logos` `stat` `profile` `quote` `code` `checklist` `team` `org` |
| research | `experiment` `math` `references` |
| business | `kpi` `plans` |

各レイアウトの使い方とサンプルは [skill/references/layouts.md](skill/references/layouts.md) を、
色・タイポグラフィ・グラフパレット等のデザイン基盤は [docs/DESIGN.md](docs/DESIGN.md) を参照。

## エージェントから使う

`skill/SKILL.md` を Claude Code 等のスキルとして登録すると、
「スライド作成」系の依頼で自動的にこのワークフロー(レイアウト選択→生成→検証ループ)が適用される。

## License

MIT
