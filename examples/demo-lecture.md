---
marp: true
theme: lecture
size: 16:9
paginate: true
---

<!-- _class: title -->
<!-- _paginate: false -->

# Git の内部構造を読む

.git の中身から理解するオブジェクトモデル

社内勉強会 #12

2026年7月8日

---

<!-- _class: objectives -->

# 本日のゴール

- **仕組みの理解** commit・tree・blob の関係を自分の言葉で説明できる
- **手を動かす** git cat-file でオブジェクトを直接読める
- **誤解の解消** ブランチと HEAD の実体を正しく言える

所要時間 40分 + 演習 10分

---

<!-- _class: agenda -->

# 進め方

1. なぜ内部構造を知るのか
2. オブジェクトモデル
3. cat-file で辿る
4. ブランチの実体
5. 演習

---

<!-- _class: content -->

# なぜ内部構造を知るのか

- rebase・reset・reflog が「何をしているか」を推測でなく理解できる
- 壊れたリポジトリを自力で調査・復旧できる
- **コマンドの暗記が不要になる**(モデルから導出できる)

---

<!-- _class: definition -->

# コンテンツアドレスストレージ

> 内容のハッシュ値(SHA-1/SHA-256)をそのままアドレス(ファイル名)として
> オブジェクトを保存する方式。同じ内容は必ず同じアドレスになるため、
> 重複は自動的に排除され、内容の改竄はアドレスの不一致として検出できる。

Git の .git/objects はこの方式のキーバリューストアである

---

<!-- _class: spec -->

# オブジェクトは4種類だけ

- **blob** ファイルの中身(ファイル名は持たない)
- **tree** ディレクトリ(名前 → blob/tree の対応表)
- **commit** tree への参照+親コミット+メッセージ
- **tag** 特定オブジェクトへの注釈付き参照

---

<!-- _class: code -->

# .git の中を覗く

```shell
$ ls .git
HEAD  config  index  objects/  refs/

$ find .git/objects -type f | head -3
.git/objects/5d/6e7f8a9b...
.git/objects/a1/b2c3d4e5...
.git/objects/9f/8e7d6c5b...
```

objects/ 配下がオブジェクト本体。先頭2文字がディレクトリ名になる

---

<!-- _class: code-focus -->

# cat-file でオブジェクトを辿る

```shell
$ git cat-file -p HEAD          # ①
tree a1b2c3d4
parent 9f8e7d6c
author dev <dev@example.com>

    fix: typo in README

$ git cat-file -p a1b2c3d4      # ②
100644 blob 5d6e7f8a  README.md
040000 tree 8a9b0c1d  src

$ git cat-file -p 5d6e7f8a      # ③
# Hello, slide-forge
```

1. **commit** tree と parent への参照+メタデータを持つ
2. **tree** ファイル名と blob/tree を対応づける表
3. **blob** ファイルの中身そのもの(名前は tree 側にある)

---

<!-- _class: tree -->

# .git ディレクトリの構造

- **objects/** すべての実体が入る
  - `aa/bcdef...` zlib圧縮されたオブジェクト
  - `pack/` パックファイル(圧縮済みの集合)
- **refs/** 動く参照
  - `heads/` ブランチ(SHAを1つ書いたファイル)
  - `tags/` タグ
- **HEAD** 現在チェックアウト中の参照を指す
- **index** ステージング領域のバイナリ

`git init` 直後でもこの骨格はすべて作られる

---

<!-- _class: misconception -->

# よくある誤解: ブランチ

- **誤解** ブランチはコードのコピーなので、たくさん作るとリポジトリが重くなる
- **事実** ブランチはコミットの SHA を1つ書いた41バイトのファイル(refs/heads/名前)。何百作ってもコストはほぼゼロ

---

<!-- _class: callout warning -->

# 注意: force push

`git push --force` は共有ブランチの履歴を書き換える。

> 共有ブランチでは `--force` を使わず、`--force-with-lease` を使う。
> リモートが想定外に進んでいる場合は push が拒否されるため、
> 他人のコミットを誤って消すことがない。

チーム開発では main / develop への force push をサーバ側で禁止しておくのが安全

---

<!-- _class: quiz -->

# 演習

> `git branch feature` を実行した直後、リポジトリに新しく作られるものは
> どれか。

1. コミットオブジェクトのコピー一式
2. 現在のコミットの SHA を書いたファイル refs/heads/feature
3. 作業ツリー全体のスナップショット
4. 何も作られない
---

<!-- _class: answer -->

# 解答

**B. refs/heads/feature という参照ファイルが1つ作られるだけ**

- ブランチ作成はファイル1つの書き込みなので一瞬で終わる
- コミットの実体(オブジェクト)は一切コピーされない
- `git switch` はこの参照を HEAD が指すよう切り替えているだけ

---

<!-- _class: cheatsheet -->

# コマンド早見表

- `git cat-file -p <sha>` オブジェクトの中身を表示
- `git cat-file -t <sha>` オブジェクトの型を確認
- `git rev-parse HEAD` HEAD の SHA を解決
- `git log --oneline` 履歴を1行ずつ表示
- `git branch <name>` 参照ファイルを作る
- `git switch <name>` HEAD の指す先を切替
- `git reflog` HEAD の移動履歴を表示
- `git push --force-with-lease` 安全な強制 push

すべて手元のリポジトリで試して安全なコマンドのみ

---

<!-- _class: takeaway -->

# Git は「イミュータブルなオブジェクトの木」と「動く参照」の2層でできている

コマンドはすべてこの2層への操作に還元できる

---

<!-- _class: summary -->

# まとめ

- .git/objects は内容アドレスのキーバリューストア
- オブジェクトは blob・tree・commit・tag の4種類だけ
- ブランチ・HEAD は「動く参照」であり、実体は小さなファイル
- 迷ったら `git cat-file -p` で実物を読む

---

<!-- _class: references -->

# 参考資料・次に学ぶ

1. Chacon, S. and Straub, B.: Pro Git, 2nd ed., Chapter 10 "Git Internals", Apress, 2014.
2. Git公式ドキュメント: gitcore-tutorial, gitrepository-layout.
3. 次回: packfile と delta 圧縮(なぜ clone は速いのか)

---

<!-- _class: end -->
<!-- _paginate: false -->

# お疲れさまでした

質問・訂正は #study-git まで
