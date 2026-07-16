---
name: verify
summary: slide-forge のWebUIと書き出しを実ブラウザで確認する
---

# slide-forge runtime verification

1. `npm exec --prefix "$PWD/skill" -- vite build --config "$PWD/skill/webui/vite.config.mjs"` でWebUIをビルドする。
2. `/tmp` に検証専用Markdownを作り、空いているポートで次をバックグラウンド起動する。
   `node "$PWD/skill/webui/server.mjs" /tmp/<deck>.md --port <port>`
3. `skill/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js` を使う一時スクリプトから実ブラウザを起動し、以下を操作する。
   - トップバー、stage toolbar、素材パネルをクリックしてDOMとスクリーンショットを取得
   - 「発表」をクリックし、popupが `<deck>.export.html` へ遷移してスライドが表示されるまで待つ
   - 必要に応じて素材を選び、Markdownパネルに反映され自動保存されるまで待つ
4. エラー経路はブラウザ上の `fetch` または実際のボタン操作で確認する。内部関数の直接呼び出しは検証に使わない。
5. サーバを停止し、検証用Markdown、export、コピー素材、provenance、一時スクリプトを削除する。証拠用スクリーンショットだけを報告まで保持する。

ポップアップはクリック直後に作られるため、Puppeteerではクリック前に `page.once('popup')` を登録する。スライド間transitionの無効化を確認するときは、`transition: fade` を含む検証デッキを使い、popupの次回navigation前に `document.startViewTransition` を計測用に差し替えて矢印キー操作後の呼び出し回数を確認する。
