# slide-forge

**AIエージェントファーストのスライド作成基盤。**
「スライド作って」と頼むだけで、エージェント(Claude Code 等)がレイアウトを選び、はみ出しがないか検証までしてから仕上げる。人が直接手を入れたいときのための編集WebUIも同梱している。

- **エージェントに任せると**: `skill/SKILL.md` をスキルとして登録するだけで、「スライド作って」の一言から レイアウト選択 → 生成 → はみ出しチェック → PNG目視確認 が自動で回る
- **エージェントが書くのは内容とレイアウト選択だけ**。`<!-- _class: title -->` のように1行加えるだけで、余白・配色・タイポグラフィは全部テーマ側が決める。毎回バラバラなデザインになったり、生HTMLで無理な組み方をしたりしない
- **117種のレイアウトクラス**と**4つの配色スキン**(研究発表・ビジネス・輪講/勉強会・ソフト)を最初から同梱。研究・ビジネス向けの39テンプレートと5つのデッキレシピをAgentが組み合わせられる
- **図表と素材も再現可能**。YAML/JSONからテーマ準拠SVGを生成し、ライセンス・出典・alt付きのLucideアイコン63点・写真12点・テーマ背景16点をオフライン同梱する
- **HTMLだけ一枚の中の表現を一段上げられる**。要素の段階表示やSVGのfade/wipe/draw/highlightを選べ、PDFでは最終状態へ戻る。スライド間の切り替え演出は使わない
- **崩れたスライドのまま出さない**。要素のはみ出しを機械チェックし、PNG化して目視確認するところまでが標準のワークフロー
- **人が直接触りたいときは**、同じMarkdownをブラウザの編集WebUIでそのまま開ける。スライド上のテキストをクリックしてその場で書き換えられる

<p>
  <img src="examples/assets/screenshots/agent-first-glance.png" width="900" alt="重なり合ったスライド風のカードと、チェックマークのアイコンが並ぶイラスト。生成したスライドの品質確認が完了したイメージを表す">
</p>

## エージェントから使う

[skills](https://skills.sh/) 経由でスキルとして登録するのが最も簡単。`skill/` 配下に
テーマCSS・検証スクリプト・編集WebUIを全部同梱しているので、**このコマンド1つだけで**
CLIやWebUIも含めて動く(リポジトリ本体を別途 clone する必要はない)。

```bash
npx skills add taiseee/slide-forge
```

これで `skill/SKILL.md` が Claude Code 等のエージェントに登録され、「スライド作って」の一言から
レイアウト選択 → 生成 → はみ出しチェック → PNG目視確認が自動で回るようになる。エージェントは
初回だけ `npm install --prefix <スキルの絶対パス>` を実行してから使う(SKILL.md にその手順も書いてある)。

リポジトリ本体を clone して開発・検証したい場合:

```bash
git clone https://github.com/taiseee/slide-forge.git
cd slide-forge/skill
npm install
```

エージェントが書き出したMarkdownは、そのまま下記のCLIやWebUIでも検証・編集できる(`skill/` の中で実行する)。

```bash
cd skill

# 新規デッキの雛形(タイムスタンプ付きディレクトリ)
node scripts/init.mjs --topic midterm_report --title "中間発表" --theme research
# → docs/slides/YYYY-MM-DD_HHmmss_midterm_report/

# 研究発表の構成も生成
node scripts/init.mjs --topic paper_talk --title "論文紹介" --recipe paper-talk

# ビジネス提案・経営報告の構成もAgent向けレシピから生成
node scripts/init.mjs --topic customer_proposal --title "顧客向け提案" --recipe business-proposal
node scripts/init.mjs --topic monthly_review --title "月次事業レビュー" --recipe executive-review

# データからテーマ準拠SVGを生成
node scripts/render-visual.mjs assets/examples/bar.yaml --theme research --output ../build/result.svg

# オフライン単一HTMLをビルド
node scripts/export.mjs ../examples/demo-research.md --format html --output ../build/demo.html

# はみ出しチェック
node scripts/check-overflow.mjs ../build/demo.html

# 画像・alt・情報密度・文字サイズ・コントラスト等も検査
node scripts/check-quality.mjs ../examples/demo-research.md ../build/demo.html

# ノートと素材出典も必須にする場合
node scripts/check-quality.mjs slides.md --require-notes --require-provenance

# 5レシピのHTML回帰。--visual版は5レシピ+4スキンを全ページPNG化
npm run regress:recipes
npm run regress:visual -- --output ../build/regression

# 発表用のオフライン単一HTML / 配布用PDF
node scripts/export.mjs ../examples/demo-research.md --format html --output ../build/demo.export.html
node scripts/export.mjs ../examples/demo-research.md --format pdf --output ../build/demo.export.pdf

# PNG化(目視確認用)
npx marp --theme-set theme/ --html --allow-local-files --images png ../examples/demo-research.md -o ../build/png/demo.png
```

## 人が直接編集する: WebUI

`npm run webui -- <file.md>` で立ち上がるローカルエディタは、パワーポイントやCanvaのような感覚でMarpスライドを編集できる。エージェントが下書きしたデッキを人が仕上げる、という使い方にも向いている(エージェント自身が起動してURLを提示することもできる)。

```bash
cd slide-forge/skill
npm install
npm run webui -- ../examples/demo-research.md
# → http://127.0.0.1:5757 が開く
```

<p>
  <img src="examples/assets/screenshots/webui-editor.png" width="900" alt="slide-forge編集WebUI。左にスライド一覧、中央に選択中のスライド、上部にスキン・要素モーション・発表・PDF、中央ツールバーにレイアウトと素材、下部に発表者ノートと修正必須エラーが並ぶ">
</p>

- **直接編集**: スライド上のテキストをクリックすればその場で書き換えられる。太字などの記法は保持される
- **箇条書きの追加・削除**: 編集中に Enter で項目を分割・追加、空の項目で Backspace で削除
- **レイアウトを選んで追加**: 「＋追加 ▾」からレイアウトをプレビューを見ながら選べる。書き方の例が入った状態で挿入される
- **Agent向けテンプレート/レシピ**: 研究発表とビジネス提案・経営報告の使用例をカタログ化し、Agentが目的に応じて組み立てる。編集UIにはテンプレート一覧を出さない
- **素材を選んで挿入**: 選択中スライドのレイアウトと同じツールバーから、ライセンス確認済みの写真・アイコン・背景を検索してデッキ内へコピーできる
- **画像の差し替え**: クリックでファイル選択、またはドラッグ&ドロップ
- **スキン/要素モーション/書き出し**: 一枚の中のrich motion、発表用オフラインHTML、PDFに絞って操作できる
- **修正必須エラーをその場で検知**: はみ出し・壊れた画像・外部画像など、出力前に直すべき問題だけをUIに表示する。詳細なwarningと図表メタデータ・素材出典はAgentのCLI検査で扱う
- **発表時間の概算**: 本文または発表者ノートから所要時間を常時表示する
- **Undo/Redo**、サムネイル並び替え、発表者ノート欄、サイドバー幅のリサイズも標準搭載

サンプルデッキは4本同梱しているので、どれで試してもOK。キーボードショートカット一覧は下記を参照。

| デッキ | 内容 |
|---|---|
| `examples/demo-research.md` | ゼミ・学会発表向け(研究スキン) |
| `examples/demo-business.md` | 提案・報告向け(ビジネススキン) |
| `examples/demo-lecture.md` | 輪講・社内勉強会向け(輪講スキン) |
| `examples/demo-soft.md` | カジュアルな発表・社内共有向け(ソフトスキン) |

## 4つのデザインスキン

同じレイアウト構造のまま、配色だけを差し替えられる。用途に応じて `theme: research` / `business` / `lecture` を切り替えるだけ。

<table>
<tr>
<td width="33%"><img src="examples/assets/screenshots/gallery-research.png" width="100%" alt="研究スキンのサンプルスライド(実験結果の表)"><br><sub><b>research</b> — グレー/墨色系。ゼミ・学会発表向け</sub></td>
<td width="33%"><img src="examples/assets/screenshots/gallery-business.png" width="100%" alt="ビジネススキンのサンプルスライド(市場規模の同心円)"><br><sub><b>business</b> — グレージュ/ブラウン系。提案・報告向け</sub></td>
<td width="33%"><img src="examples/assets/screenshots/gallery-lecture.png" width="100%" alt="輪講スキンのサンプルスライド(演習問題)"><br><sub><b>lecture</b> — モスグリーン系。輪講・勉強会向け</sub></td>
</tr>
<tr>
<td width="33%"><img src="examples/assets/screenshots/gallery-soft.png" width="100%" alt="ソフトスキンのサンプルスライド(角丸の原因分析図)"><br><sub><b>soft</b> — グレージュ×コーラル・角丸。カジュアルな発表・社内共有向け</sub></td>
<td width="33%"></td>
<td width="33%"></td>
</tr>
</table>

## レイアウトカタログ(117種)

| 系統 | クラス |
|---|---|
| コア | `title` `title-visual` `agenda` `agenda-grid` `objectives` `divider` `content` `content-lead` `two-column` `sidebar` `image-right` `image-left` `image-top` `image-bottom` `image-full` `annotated` `gallery` `photo-grid` `image-cards` `before-after` `logos` `profile` `team` `comparison` `comparison-3` `pros-cons` `transition` `table` `benchmark` `matrix` `matrix-3` `venn` `venn-3` `positioning` `ranking` `scorecard` `steps` `steps-v` `flow` `chain` `io` `cycle` `timeline` `timeline-h` `gantt` `roadmap` `kanban` `funnel` `pyramid` `layers` `org` `tree` `radial` `changelog` `stat` `status` `columns` `cards` `spec` `faq` `checklist` `quote` `quotes` `callout` `code` `lead` `exec-summary` `takeaway` `summary` `contact` `definition` `glossary` `references` `end` `browser` `zoom` `phone` `app-intro` `causes` `timeline-photo` `collage` `steps-photo` `quote-photo` `stat-ring` `logic-tree` `pyramid-tri` `draft` `confidential` `deprecated` |
| research | `experiment` `math` `hypothesis` `confusion-matrix` `rq` `chart-insight` `qualitative-grid` |
| business | `kpi` `plans` `persona` `tam-sam-som` `tam-sam-som-circle` `case-study` `journey` `forces` `bmc` `impact` `okr` `actions` `swot` `pest` `risks` |
| lecture | `quiz` `answer` `code-focus` `misconception` `cheatsheet` `code-compare` |

各レイアウトの詳しい使い方とMarkdownサンプルは [skill/references/layouts.md](skill/references/layouts.md)、
色・タイポグラフィ・グラフパレット等のデザイン基盤は [skill/references/design.md](skill/references/design.md)、
ノート・図表・素材出典の検査方針は [skill/references/quality.md](skill/references/quality.md) にまとまっている。

## 設計思想

- **エージェントファースト**: 人が毎回レイアウトや配色を判断しなくてもいいように、エージェントが選ぶのは内容とレイアウトクラスだけにする。判断の余地を減らすほど、エージェントの出力は安定する
- **Marp Markdown が唯一のソース**。HTML/PDF は常にビルド成果物であり、直接編集しない
- **内容と装飾の分離**: 書くのは内容とレイアウト選択だけ。配置・余白・色は全てテーマCSSが決める
- **レイアウトクラスのみ**: ユーティリティクラスや生HTMLでの組み立ては提供しない。表現が足りなければテーマにクラスを追加して育てる
- **検証してから完成**: overflow 機械チェック(Puppeteer)+全スライドPNGの目視確認をワークフローに組み込む

## 構成

`skill/` 一本だけで自己完結している(`npx skills add` ではこの中だけがエージェントにコピーされる)。
リポジトリルートの `examples/` `docs/ROADMAP.md` は slide-forge 自体を開発・拡張するときのもの(スキル単体には含まれない)。

```
skill/
  SKILL.md            # エージェントスキル(ワークフロー+カタログ索引)
  package.json        # このスキル単体で npm install できる npm パッケージ
  catalog/            # レイアウト・意味的テンプレート・デッキレシピの機械可読カタログ
  templates/          # 研究・ビジネスのストーリーを組み立てる再利用可能なMarkdown断片
  assets/             # ライセンス付き写真/アイコン/背景、図表仕様例、provenance
  runtime/            # rich HTMLモーション(CSS/JS。書き出し時にインライン化)
  references/
    layouts.md        # レイアウト別の完全サンプル
    design.md         # デザイン基盤(トークン・書式ルール)
    quality.md        # ノート・図表メタデータ・素材出典の検査ポリシー
  theme/
    core.css          # 全レイアウトクラス(構造のみ、色はCSS変数)
    research.css      # 研究発表スキン(配色 + experiment/math/hypothesis)
    business.css      # ビジネススキン(配色 + kpi/plans/forces 等)
    lecture.css       # 輪講・勉強会スキン(配色 + quiz/answer/cheatsheet 等)
    soft.css          # ソフトスキン(グレージュ×コーラルの配色 + 角丸トークン。全クラスの合併)
  scripts/
    check-overflow.mjs  # スライドのはみ出しを機械検出
    check-quality.mjs   # Markdown・画像・アクセシビリティ品質を検査
    regress-recipes.mjs # 5レシピ/4スキンの書き出し回帰ゲート
    render-visual.mjs   # YAML/JSONからグラフ・構成図SVGを生成
    export.mjs          # 発表用HTML/PDFの共通書き出し
  webui/
    server.mjs        # 編集WebUIのローカルサーバ(marp-coreレンダリング+保存API)
    src/              # Canva風エディタ(Vite + React)
examples/
  demo-research.md    # 研究スキンのカタログ兼検証デッキ
  demo-business.md    # ビジネススキンのカタログ兼検証デッキ
  demo-lecture.md     # 輪講・勉強会スキンのデモ(Git内部構造の勉強会デッキ)
  demo-soft.md        # ソフトスキンのデモ(角丸デザインの紹介デッキ)
docs/
  ROADMAP.md          # 目指す姿・現状・TODO(リポジトリを担う人向け)
```

## キーボードショートカット(編集WebUI)

| キー | 動作 |
|---|---|
| `⌘Z` / `⇧⌘Z`(`Ctrl+Z` / `Ctrl+Y`) | 元に戻す / やり直す |
| `Delete` / `Backspace` | 選択中のスライドを削除(テキスト入力中を除く) |
| `⌘D` | スライドを複製 |
| `↑` `↓`(`←` `→`) | スライド選択の移動 |
| `⌘S` | 即時保存(通常は自動保存) |
| `Esc` | インライン編集をキャンセル |
| `Enter`(箇条書き編集中) | カーソル位置で項目を分割して次の項目を追加 |
| `Backspace`(空の項目で) | その項目を削除して前の項目末尾へ |

## License

[MIT](LICENSE)
