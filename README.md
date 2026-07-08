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
webui/
  server.mjs          # 編集WebUIのローカルサーバ(marp-coreレンダリング+保存API)
  src/                # Canva風エディタ(Vite + React)
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

## レイアウトカタログ(66種)

| 系統 | クラス |
|---|---|
| コア | `title` `title-visual` `agenda` `agenda-grid` `divider` `content` `content-lead` `two-column` `image-right` `image-left` `image-top` `image-bottom` `image-full` `annotated` `comparison` `comparison-3` `pros-cons` `table` `takeaway` `lead` `exec-summary` `summary` `end` `timeline` `timeline-h` `steps` `steps-v` `flow` `cycle` `funnel` `gantt` `roadmap` `columns` `spec` `faq` `matrix` `matrix-3` `venn` `pyramid` `layers` `ranking` `gallery` `before-after` `logos` `stat` `profile` `quote` `code` `checklist` `team` `org` `cards` `scorecard` `transition` `changelog` `contact` |
| research | `experiment` `math` `references` `definition` |
| business | `kpi` `plans` `persona` `tam-sam-som` `case-study` `journey` |

各レイアウトの使い方とサンプルは [skill/references/layouts.md](skill/references/layouts.md) を、
色・タイポグラフィ・グラフパレット等のデザイン基盤は [docs/DESIGN.md](docs/DESIGN.md) を参照。

## エージェントから使う

`skill/SKILL.md` を Claude Code 等のスキルとして登録すると、
「スライド作成」系の依頼で自動的にこのワークフロー(レイアウト選択→生成→検証ループ)が適用される。

## 編集WebUI(人間向け)

Canva 風のローカルエディタ。スライド上のテキストをクリックするとその場で書き換えられ、
入力はリアルタイムに Markdown へ逆変換されて自動保存される。

```bash
npm run webui -- examples/demo-research.md
# → http://127.0.0.1:5757
```

- 左: 実スライドの縮小サムネイル(クリック選択・ドラッグ並び替え・追加/複製/削除)
- 中央: スライド直接編集(1クリックでクリック位置にカーソル、テキストより後ろを
  クリックすると末尾へ。太字等の記法は保持)
- レイアウト切替: グループタブ+実レンダリングの縮小プレビュー付きピッカー
- 画像: クリックでファイル選択、またはドラッグ&ドロップで差し替え(`assets/` に保存)
- 下: 発表者ノート欄(PowerPoint風。Marp のプレゼンターノート=コメントとして保存)
- 右(トグル): Markdown パネル(コード・数式などインライン編集対象外の編集用)
- はみ出し検出は編集のたびにブラウザ内で即時実行される
- ネスト付きリストも編集可: 親項目クリックで親の行だけ、子項目クリックで子の行だけ

キーボードショートカット:

| キー | 動作 |
|---|---|
| `⌘Z` / `⇧⌘Z`(`Ctrl+Z` / `Ctrl+Y`) | 元に戻す / やり直す |
| `Delete` / `Backspace` | 選択中のスライドを削除(テキスト入力中を除く) |
| `⌘D` | スライドを複製 |
| `↑` `↓`(`←` `→`) | スライド選択の移動 |
| `⌘S` | 即時保存(通常は自動保存) |
| `Esc` | インライン編集をキャンセル |

## License

MIT
