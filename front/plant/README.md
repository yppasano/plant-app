# 植物サイクル管理アプリ

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
