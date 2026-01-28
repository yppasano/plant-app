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
