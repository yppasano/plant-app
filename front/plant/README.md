# 植物サイクル管理アプリ

## 初回セットアップ（環境変数）

Supabase を使用するには、環境変数の設定が必要です。

```bash
cd front/plant
cp .env.example .env
# .env を編集し、VITE_SUPABASE_URL と VITE_SUPABASE_KEY を設定
```

Vercel にデプロイする場合は、Vercel のダッシュボードで環境変数 `VITE_SUPABASE_URL` と `VITE_SUPABASE_KEY` を設定してください。

### Vercel 環境変数でエラーが出る場合

1. **変数名を確認**: 必ず `VITE_SUPABASE_URL` と `VITE_SUPABASE_KEY`（大文字小文字含め完全一致）
2. **適用環境**: Production にチェックを入れる（Preview / Development も必要に応じて）
3. **値の形式**: 前後にスペースを入れない。URL は `https://` から始まること
4. **再デプロイ**: 環境変数を追加・変更したら、Deployments から「Redeploy」で再ビルドが必要です
5. **設定エラー画面が出る場合**: 上記を確認し、再デプロイ後にブラウザのキャッシュを削除して再読み込み

### メールレート制限（email rate limit exceeded）

Supabase の無料プランではメール送信に制限（約2通/時間）があります。この制限に達すると約1時間待つ必要があります。開発時は Supabase ダッシュボードの Authentication > Rate Limits で設定を変更できます。

### ログインが毎回聞かれる場合

- シークレット/プライベートモードではセッションが保持されません。通常モードで開いてください
- ブラウザの「サイトデータを削除」を行うとログアウトされます
- PWA（ホーム画面に追加）で開いている場合、OSがストレージをクリアすることがあります。ブラウザで直接開いてみてください

### RLS エラー（row-level security policy）が出る場合

1. **supabase-rls-policies.sql** を Supabase の SQL Editor で実行
2. **plants.user_id の型**を確認: Table Editor > plants > user_id が `uuid` 型であること（`text` の場合は `auth.uid()` と型が合わず失敗します）
3. **Anon Key を使用**: VITE_SUPABASE_KEY には「Anon public」キーを設定（Service role は使わない）

### Vercel デプロイ設定

- **リポジトリルートからデプロイする場合**: ルートの `vercel.json` が使用されます（Root Directory は未設定）
- **front/plant をルートにする場合**: Vercel の Root Directory を `front/plant` に設定し、`front/plant/vercel.json` が使用されます
- **401 Unauthorized が出る場合**: Vercel の Deployment Protection が有効な可能性があります。Settings > Deployment Protection でプレビューデプロイの保護を無効化するか、本番（main ブランチ）にデプロイしてください

## バックアップ・復元

### 携帯のデータをクラウドに移行する

1. クラウド版アプリにログイン
2. ⚙️ 設定 → **「バックアップから取り込み (Import)」**
3. 携帯に保存した JSON ファイルを選択
4. 確認ダイアログで OK を押す

**対応フォーマット:**
- `[{ id, logs: [{ type, ts }], image? }]` の配列
- `{ plants: [...] }` や `{ data: [...] }` でラップされた形式
- ログの `date`（例: "1/15"）形式にも対応
- 写真（Base64）付きの場合は自動で Supabase にアップロード

### クラウドのデータをバックアップする

設定 → **「バックアップを保存 (Export)」** で JSON ファイルをダウンロードできます。

## 開発サーバーの起動手順

### Dockerコンテナ内で起動する場合

```bash
# プロジェクトルートに移動
cd ~/sample

# Dockerコンテナに入る
docker compose exec front sh

# plantディレクトリに移動
cd /front/plant

# 開発サーバーを起動
npm run dev
```

開発サーバーが起動したら、ブラウザで `http://localhost:3001/plant/` にアクセスしてください。

## Gitへのアップロード手順

```bash
# 1. プロジェクトルートに移動
cd ~/sample

# 2. 変更を全部入れる
git add .

# 3. 名前をつけて保存
git commit -m "修正メモ"

# 4. GitHubへ送信（→Vercelが自動更新）
# 初回プッシュ、または「no upstream branch」エラーが出る場合
git push --set-upstream origin main

# 2回目以降の場合（upstreamが設定済みの場合）
git push
```

**注意**: 「no upstream branch」エラーが出る場合は、`git push --set-upstream origin main` を実行してください。履歴を書き換えた場合など、upstream設定が失われることがあります。

---

## デザイン（sample02.html 参考）変更メモ

### リスト画面まわり（白・黒テキスト）— 対応済み

| 対象 | 内容 |
|------|------|
| `index.html` `body` / `.bg-overlay` | 背景を明るく（オーバーレイは実質オフ） |
| `#appScreen` | 白背景・黒系テキスト |
| `#appScreen .glass-card` 系 | 白／アラート・水やり用の淡い色＋枠線（CSS で上書き） |
| ヘッダー（タイトル・同期・ソート） | `text-gray-900`、ソートは白地＋黒枠（sample02 近い） |
| 下部ナビ `.bottom-nav` | 白系＋グレー枠・アイコンは黒寄り |
| 検索ボトムシート `#searchSheet` | 白背景・入力欄グレー枠・黒テキスト |
| `app.js` `render()` | カード内タイトル・水やり行・バッジ・矢印をライト向けクラスに変更 |
| `updateSyncStatus` | 同期ドット表記をライト画面向けに調整 |

### リスト行：sample02.html と Ageta（本番 UI）の比較

| 項目 | sample02.html | Ageta（`src/app.js` の `render()`） |
|------|----------------|--------------------------------------|
| **レイアウト** | 左 **`w-32` サムネ** ＋ 右 **`flex-1 -ml-[2.4rem]`** で **色付き影＋白カード**が重なる | **同型**（左 `w-32`・角 `rounded-l-[20px]`、右は `-ml-[2.4rem]`・影 `#B3D48E` / `#06B6D4` / `#E7445B`・白パネル `border-2 border-black`） |
| **画像** | 共通 **固定 URL**（`DEFAULT_IMAGE`） | **`p.image`（`image_url`）**。未設定は **グレー＋画像アイコン**（角は左だけ丸） |
| **状態バッジ** | 重なったカード **左上外**（`-left-3`）に **水滴／警告** の丸 | **同位置・同デザイン**（水やりマーカー＝青＋水滴、アラート＝赤＋警告三角 SVG） |
| **タイトル行** | `名前 \| サブタイトル`（1行） | **表示名** `|` **サブタイトル**（無いときは `\|` **ID** をモノスペース灰）＋乾燥系ソート時は **小さな AVG 日数バッジ** |
| **AVG 行** | `AVG` ＋ 数値 `日`、下線色は状態で変化 | **同様**。算出は `calculateAverageInterval`（足りないときは `--日`） |
| **水やり（最大2件）** | ラベル付き（直近・次直近） | **ラベルなし**・**日付＋アイコン**（色は sample02 と同じ `#06B6D4` / `#8CBA5A` / `#D8C243`） |
| **データ** | デモ | **Supabase** `plants` / `logs` |

**変更履歴（リスト行）**

- 「直近」「次直近」をやめ、**日付＋アイコンのみ**（最大2件）。
- **左サムネを `w-32` に拡大**し、**重ねカード**（色面＋白カード＋黒枠）を sample02 に合わせて再現。
- 一覧の **ガラスカード**（`glass-card`）ラッパーはやめ、**sample02 と同じ DOM 構造**に変更。

### 未着手（次のステップ例）

- ログイン画面 `#authScreen`（現状はダークガラスのまま）
- 詳細 `#detailScreen`（まだダーク UI）
- 各種モーダル（Manual / Rename / Settings / Condition / スキャンオーバーレイ）
- `statusPopover`、`manifest` の `theme-color` 以外のアイコン画像など
