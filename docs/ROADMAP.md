# ROADMAP

## 目指す姿

AIエージェントが「内容を考えること」だけに集中すれば、オシャレで綺麗、スタイリッシュなスライドが
一定品質で出てくる基盤。人間は Markdown 直接編集かエージェントへの指示で介入でき、
表現の幅はテンプレート(レイアウトクラス)を実需ベースで追加して広げていく。

- 対象順序: 1. 研究発表(ゼミ・学会・進捗報告) → 2. ビジネス(提案・報告)
- 品質の定義: はみ出しゼロ(機械検証)+目視で崩れ・違和感なし+デザインの一貫性

## 現状(2026-07 v2)

- [x] テーマ基盤: `core.css`(構造)+ スキンの分離構成
- [x] コアレイアウト82種 + research 5種 + business 15種 + lecture 6種(全108種、4デモデッキで検証済み)
  - 2026-07 追加: venn-3 / sidebar / callout(info・success・warning・error)/ photo-grid /
    benchmark / tree / radial / positioning / objectives / image-cards / status(core)、
    forces / bmc / impact / okr(business)、
    hypothesis(research)、cheatsheet(lecture)
  - 2026-07 追加(第2弾): chain / glossary / kanban / io / quotes(core)、
    actions / swot(business)、confusion-matrix(research)、code-compare(lecture)
  - 2026-07 追加(第3弾): browser / zoom / causes / 透かし修飾クラス draft・confidential・deprecated(core)、
    rq(research)、pest / risks(business)。
    あわせて demo-lecture.md の frontmatter が `theme: research` になっていた既存バグを修正
    (lecture スキンのクラスが全て無効化され code-compare がはみ出していた)
  - 2026-07 追加(第4弾): timeline-photo(画像つき横タイムライン)/ collage(画像コラージュ)(core)
  - tree / radial / positioning は「模式図」クラス(構造の表現専用)。データ比例のグラフ・
    正確な座標が要る図は従来どおり作図画像を貼る
- [x] lecture スキン(輪講・勉強会向け、モスグリーン系。quiz/answer/code-focus/misconception/cheatsheet)
- [x] soft スキン(丸みのある柔らかいデザイン、グレージュ×コーラル。独自クラスは持たず、
  research/business/lecture を @import して全クラスを使えるようにした上で、
  配色トークン+角丸トークン(--sf-radius / --sf-radius-s / --sf-radius-pill)と適用リスト、
  blockquote 左罫線の除去だけを持つ。`examples/demo-soft.md` で検証済み。
  箱・チップ・画像を持つクラスを追加したら soft.css の適用リストにも追記すること)
- [x] ヘッダー・フッター(機密区分・所属・コピーライト)、kpi の前年差・目標差表示
- [x] デザイン基盤の文書化(`skill/references/design.md`: トークン・タイポグラフィ・グラフパレット・禁止事項)
- [x] グラフ・分岐フロー・複雑な構成図は「作図した画像を貼る」を標準手順としてスキルに明文化
- [x] 作図画像の実例を `examples/assets/charts/` に同梱(棒・折れ線=research、市場推移・承認フロー=business、
  シーケンス図=lecture。各スキンのグラフパレット準拠。デモデッキに実例スライドあり)
- [x] v2: business スキン(`kpi`、`examples/demo-business.md` で検証済み)
- [x] 品質検証ループ: `skill/scripts/check-overflow.mjs`(Puppeteer機械チェック)+ PNG目視
- [x] エージェントスキル(`skill/SKILL.md` + `references/layouts.md`)
- [x] デザイン方針: エディトリアル・ミニマル(Canva のモノトーン系ビジネステンプレートを参考)。
  ```
  フラット配色・ヘアライン罫線・細めウェイト+広い字間・軽い大きな数字。
  グラデーション/影/カードUIは使わない。research=グレー/墨色系、business=グレージュ/ブラウン系、
  lecture=モスグリーン/セージ系
  ```

- [x] v3: 人間向け編集WebUI(`npm run webui -- <file.md>`、Vite + React)
  - Canva風: サムネイル一覧・スライド上のテキストを直接編集(1クリックでカーソル、
    リアルタイム逆変換+自動保存)
  - 画像の差し替え(クリック→ファイル選択 / ドラッグ&ドロップ → assets/ に保存)
  - 発表者ノート欄(PowerPoint風の下段。Marp のプレゼンターノートとして保存)
  - レイアウト切替・追加/複製/削除/並び替え・ブラウザ内はみ出し即時検出・Markdownパネル
  - 対象外(コード・数式・ネスト付きリスト)は Markdown パネルで編集する

## TODO

### 編集WebUIの改善(実運用で必要になったら)

- [x] インライン編集の対象拡大(ネスト付きリスト: 親は自身の行のみ、子は個別に編集)
- [x] Undo/Redo(アプリ内履歴、連続入力は1エントリに合流)+ ショートカット
      (⌘Z/⇧⌘Z・Delete=スライド削除・⌘D=複製・矢印=選択移動)
- [x] 箇条書きの項目追加・削除(編集中に Enter で分割、空項目で Backspace で削除)
- [x] レイアウトを選んでスライド追加(ピッカーから選ぶと書き方例入りの雛形が挿入される。
      例は Marp がコメントを発表者ノート扱いするためコメントではなくプレースホルダ内容として入れる)
- [x] スキン切替ドロップダウン(frontmatter の theme を書き換え、Undo可)
- [x] 書き出しボタン(PDF / 発表用単一HTML。marp CLI を実行して新しいタブで開く)

### 継続的な運用

- [ ] 実発表で足りなかったレイアウトの追加(下記ルールに従う)
- [ ] スライド発表ごとのフィードバックをテーマに反映

### 出力・アクセシビリティ(必要になったら)

- [ ] 白黒印刷・プロジェクター向けのコントラスト検証(必要ならモノクロスキン)
- [ ] ダーク背景スキン・英語発表向けの英文タイポグラフィ調整
- [ ] 4:3 / A4(配布資料)サイズ対応
- [ ] 色覚多様性・最小文字サイズの点検(現状: 本文25px・muted系の濃度確認)

## レイアウト追加の運用ルール

1. まず既存クラスの組み合わせで表現できないか検討する(安易に増やさない)
2. 追加する場合: 汎用なら `core.css`、用途特有ならスキンにクラスを定義
   (箱・チップ・画像を持つクラスを core に足したら `soft.css` の角丸適用リストにも追記)
3. `examples/demo-*.md` にサンプルスライドを1枚追加
4. 検証ループ(ビルド → check-overflow → PNG目視)を回してから commit
5. `skill/SKILL.md` のカタログ表と `skill/references/layouts.md` にエントリを追加
6. スキルを再登録する(スキルはコピー方式のため)
7. WebUI のピッカーにも反映する: `skill/webui/lib/samples.mjs` にプレビュー用サンプル、
   `skill/webui/src/layout-groups.js` の当該グループにクラス名を追加(漏れると「その他」タブに出る)
