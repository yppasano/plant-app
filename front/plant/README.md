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
