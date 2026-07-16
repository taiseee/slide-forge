# 品質チェックのポリシー

`scripts/check-quality.mjs` は、機械的に判断できる問題だけを報告する。内容上の正しさや
図の読みやすさは、PNGの目視確認で補う。

## 実行

```bash
node scripts/check-quality.mjs slides.md build/slides.html
node scripts/check-quality.mjs slides.md build/slides.html --strict
node scripts/check-quality.mjs slides.md --require-notes --require-provenance
```

`error` は通常実行でも終了コード1、`warning` は `--strict` のときだけ終了コード1になる。

## 発表者ノート

ノート必須チェックは、誤検知を避けるため明示的に有効化する。CLIの `--require-notes`、または
frontmatter の `sf_notes: required` を使う。

```yaml
sf_notes: required
```

`title`、`title-visual`、`agenda`、`agenda-grid`、`divider`、`references`、`end` はノートなしを
許容する。それ以外の内容スライドには `<!-- ... -->` の発表者ノートを置く。Marpディレクティブ
（`<!-- _class: ... -->` や `<!-- sf_visual_spec: ... -->`）はノートとして数えない。
`TODO`、`TBD`、`{{speaker_note}}`、`[話す内容]` のように明らかな入力待ちは、必須設定に関係なく
placeholderとして警告する。普通の短いメモを「台本として不十分」と推測して警告はしない。

## グラフの軸・単位・凡例

画像と同名の `*.yaml` / `*.yml` / `*.json` があれば、`render-visual.mjs` の仕様として検査する。
別名の仕様はスライドに対応関係を記録する。

```markdown
<!-- sf_visual_spec: data/main-result.yaml -->
![主要結果](assets/main-result.svg)
```

- bar / line / scatter / area は `x_label` と `y_label`、heatmap は加えて `value_label` が必要
- Accuracy、Latency、Cost、Scoreなど単位が曖昧になりやすいラベルには、`value_format: ".0%"`、
  `Latency (ms)`、`Cost (JPY/run)` のように表示形式または単位を書く
- 同じx値に複数のbar / line / area系列がある場合は、各データ行に `series` を書く。値が凡例になる
- `series` を一部の行だけに書かない。`Series 1` のような仮名も残さない

外部ツールで作ったグラフには、Markdown側に最小メタデータを置ける。`series` が2以上なら
`legend` も必須になる。

```markdown
<!-- sf_chart: x=Method; y=Latency; unit=ms; series=2; legend=System -->
![推論時間の比較](assets/latency.svg)
```

仕様や `sf_chart` がない一般画像を、ファイル名やaltだけからグラフだと推測して警告はしない。

## 素材のprovenance

`init.mjs` で作ったデッキ（`manifest.json` がある）と `sources/assets.json` があるデッキでは、
provenanceチェックが自動で有効になる。単一Markdownでも `--require-provenance` または
`sf_asset_provenance: required` で有効化できる。

ローカル画像は次のいずれかで追跡できるようにする。

1. WebUI素材ピッカーが作る `sources/assets.json` のレコード
2. 画像と同名の図表仕様（`chart.svg` に対する `chart.yaml` など）
3. ImageGen画像と同名の `*.prompt.md`（生成日と `alt:` を含む）
4. レシピ初期化時に `manifest.json.files` へ記録された同梱素材
5. 同梱素材カタログとSHA-256が一致するファイル

`sources/assets.json` の利用中レコードには作者、配布元URL、ライセンス名・URL、取得日、SHA-256が
必要で、現在のファイルとのhash一致も検査する。デッキ内のsymlinkから外部ファイルを読むことはなく、
画像・仕様・source recordのいずれでもデッキ外参照をerrorにする。

## 5レシピの回帰ゲート

常時のunit testを重くしないため、レシピの実書き出しは専用integration gateに分離する。

```bash
# 研究3レシピとbusiness-proposal / executive-reviewをHTMLへ出力し、
# overflow・品質・ノートを検査する
npm run regress:recipes

# 上記にPDFの実出力とsignature検査も追加する
npm run regress:recipes:full

# 5レシピとresearch/business/lecture/softの4デモを全ページPNG化する。
# PNG枚数・signature・HTML overflowを検査し、目視用成果物を保持する
npm run regress:visual
```

失敗時の成果物は表示された一時ディレクトリに残る。`--output <parent>` を付けた場合は成功時も
成果物を保持する。`--visual` は成功時も目視用PNGを保持する。`--strict` を直接スクリプトへ
渡すとwarningも回帰失敗になる。PNGは自動のpixel diffではなく、レイアウト変更時の全ページ
目視確認用である。
