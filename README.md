# slide-forge

**AIエージェントファーストのスライド作成基盤。**
「スライド作って」と頼むだけで、エージェント(Claude Code 等)がレイアウトを選び、はみ出しがないか検証までしてから仕上げる。人が直接手を入れたいときのための編集WebUIも同梱している。

- **エージェントに任せると**: `skill/SKILL.md` をスキルとして登録するだけで、「スライド作って」の一言から レイアウト選択 → 生成 → はみ出しチェック → PNG目視確認 が自動で回る
- **エージェントが書くのは内容とレイアウト選択だけ**。`<!-- _class: title -->` のように1行加えるだけで、余白・配色・タイポグラフィは全部テーマ側が決める。毎回バラバラなデザインになったり、生HTMLで無理な組み方をしたりしない
- **88種のレイアウトクラス**と**3つの配色スキン**(研究発表・ビジネス・輪講/勉強会)を最初から同梱。エージェントはその中から選ぶだけでいい
- **崩れたスライドのまま出さない**。要素のはみ出しを機械チェックし、PNG化して目視確認するところまでが標準のワークフロー
- **人が直接触りたいときは**、同じMarkdownをブラウザの編集WebUIでそのまま開ける。スライド上のテキストをクリックしてその場で書き換えられる

<p>
  <img src="examples/assets/screenshots/agent-first-glance.png" width="900" alt="slide-forgeの仕組みを表す図。左にAIエージェント(丸顔アイコン)と人間(人型アイコン)の会話が交互に並び、矢印の先に見出し・下線・箇条書きを持つ完成したスライドが重なって並ぶ">
</p>

## エージェントから使う

```bash
git clone https://github.com/taiseee/slide-forge.git
cd slide-forge
npm install
```

`skill/SKILL.md` を Claude Code 等のエージェントにスキルとして登録すると、「スライド作成」系の依頼で
自動的にこのワークフロー(レイアウト選択 → 生成 → はみ出しチェック → PNG目視確認)が適用される。
エージェントが書き出したMarkdownは、そのまま下記のCLIやWebUIでも検証・編集できる。

```bash
# ビルド
npx marp --theme-set theme/ --html --allow-local-files examples/demo-research.md -o build/demo.html

# はみ出しチェック
node scripts/check-overflow.mjs build/demo.html

# PNG化(目視確認用)
npx marp --theme-set theme/ --html --allow-local-files --images png examples/demo-research.md -o build/png/demo.png
```

## 人が直接編集する: WebUI

`npm run webui -- <file.md>` で立ち上がるローカルエディタは、パワポやCanvaのような感覚でMarpスライドを編集できる。エージェントが下書きしたデッキを人が仕上げる、という使い方にも向いている。

```bash
cd slide-forge
npm install
npm run webui -- examples/demo-research.md
# → http://127.0.0.1:5757 が開く
```

<p>
  <img src="examples/assets/screenshots/webui-editor.png" width="900" alt="slide-forge 編集WebUIのスクリーンショット。左にスライド一覧のサムネイル、中央に選択中のスライド(輪講スキンの「よくある誤解」レイアウト)、下に発表者ノート欄が並ぶ">
</p>

- **直接編集**: スライド上のテキストをクリックすればその場で書き換えられる。太字などの記法は保持される
- **箇条書きの追加・削除**: 編集中に Enter で項目を分割・追加、空の項目で Backspace で削除
- **レイアウトを選んで追加**: 「＋追加 ▾」からレイアウトをプレビューを見ながら選べる。書き方の例が入った状態で挿入される
- **画像の差し替え**: クリックでファイル選択、またはドラッグ&ドロップ
- **スキン切替・書き出し**: ツールバーからテーマを切り替え、PDF・発表用HTMLをワンクリックで書き出せる
- **崩れをその場で検知**: 要素がスライドからはみ出すと即座に一覧に表示される
- **Undo/Redo**、サムネイル並び替え、発表者ノート欄、サイドバー幅のリサイズも標準搭載

サンプルデッキは3本同梱しているので、どれで試してもOK。キーボードショートカット一覧は下記を参照。

| デッキ | 内容 |
|---|---|
| `examples/demo-research.md` | ゼミ・学会発表向け(研究スキン) |
| `examples/demo-business.md` | 提案・報告向け(ビジネススキン) |
| `examples/demo-lecture.md` | 輪講・社内勉強会向け(輪講スキン) |

## 3つのデザインスキン

同じレイアウト構造のまま、配色だけを差し替えられる。用途に応じて `theme: research` / `business` / `lecture` を切り替えるだけ。

<table>
<tr>
<td width="33%"><img src="examples/assets/screenshots/gallery-research.png" width="100%" alt="研究スキンのサンプルスライド(実験結果の表)"><br><sub><b>research</b> — グレー/墨色系。ゼミ・学会発表向け</sub></td>
<td width="33%"><img src="examples/assets/screenshots/gallery-business.png" width="100%" alt="ビジネススキンのサンプルスライド(市場規模の同心円)"><br><sub><b>business</b> — グレージュ/ブラウン系。提案・報告向け</sub></td>
<td width="33%"><img src="examples/assets/screenshots/gallery-lecture.png" width="100%" alt="輪講スキンのサンプルスライド(演習問題)"><br><sub><b>lecture</b> — モスグリーン系。輪講・勉強会向け</sub></td>
</tr>
</table>

## レイアウトカタログ(88種)

| 系統 | クラス |
|---|---|
| コア | `title` `title-visual` `agenda` `agenda-grid` `objectives` `divider` `content` `content-lead` `two-column` `sidebar` `image-right` `image-left` `image-top` `image-bottom` `image-full` `annotated` `gallery` `photo-grid` `image-cards` `before-after` `logos` `profile` `team` `comparison` `comparison-3` `pros-cons` `transition` `table` `benchmark` `matrix` `matrix-3` `venn` `venn-3` `positioning` `ranking` `scorecard` `steps` `steps-v` `flow` `cycle` `timeline` `timeline-h` `gantt` `roadmap` `funnel` `pyramid` `layers` `org` `tree` `radial` `changelog` `stat` `status` `columns` `cards` `spec` `faq` `checklist` `quote` `callout` `code` `lead` `exec-summary` `takeaway` `summary` `contact` `definition` `references` `end` |
| research | `experiment` `math` `hypothesis` |
| business | `kpi` `plans` `persona` `tam-sam-som` `tam-sam-som-circle` `case-study` `journey` `forces` `bmc` `impact` `okr` |
| lecture | `quiz` `answer` `code-focus` `misconception` `cheatsheet` |

各レイアウトの詳しい使い方とMarkdownサンプルは [skill/references/layouts.md](skill/references/layouts.md)、
色・タイポグラフィ・グラフパレット等のデザイン基盤は [docs/DESIGN.md](docs/DESIGN.md) にまとまっている。

## 設計思想

- **エージェントファースト**: 人が毎回レイアウトや配色を判断しなくてもいいように、エージェントが選ぶのは内容とレイアウトクラスだけにする。判断の余地を減らすほど、エージェントの出力は安定する
- **Marp Markdown が唯一のソース**。HTML/PDF は常にビルド成果物であり、直接編集しない
- **内容と装飾の分離**: 書くのは内容とレイアウト選択だけ。配置・余白・色は全てテーマCSSが決める
- **レイアウトクラスのみ**: ユーティリティクラスや生HTMLでの組み立ては提供しない。表現が足りなければテーマにクラスを追加して育てる
- **検証してから完成**: overflow 機械チェック(Puppeteer)+全スライドPNGの目視確認をワークフローに組み込む

## 構成

```
theme/
  core.css        # 全レイアウトクラス(構造のみ、色はCSS変数)
  research.css    # 研究発表スキン(配色 + experiment/math/hypothesis)
  business.css    # ビジネススキン(配色 + kpi/plans/forces 等)
  lecture.css     # 輪講・勉強会スキン(配色 + quiz/answer/cheatsheet 等)
scripts/
  check-overflow.mjs  # スライドのはみ出しを機械検出
skill/
  SKILL.md            # エージェントスキル(ワークフロー+カタログ索引)
  references/layouts.md  # レイアウト別の完全サンプル
webui/
  server.mjs          # 編集WebUIのローカルサーバ(marp-coreレンダリング+保存API)
  src/                # Canva風エディタ(Vite + React)
examples/
  demo-research.md    # 研究スキンのカタログ兼検証デッキ
  demo-business.md    # ビジネススキンのカタログ兼検証デッキ
  demo-lecture.md     # 輪講・勉強会スキンのデモ(Git内部構造の勉強会デッキ)
docs/
  ROADMAP.md          # 目指す姿・現状・TODO
  DESIGN.md           # デザイン基盤(トークン・書式ルール)
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
