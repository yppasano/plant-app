FROM node:18-alpine

WORKDIR /front

# pythonをインストール (package.jsonのserveコマンドで必要なため)
RUN apk add --no-cache python3 && ln -sf python3 /usr/bin/python

# pnpm と sass をグローバルにインストール
RUN npm install -g pnpm sass

# package.jsonをコピー
COPY ./front/package.json ./

# 依存関係をインストール
RUN pnpm install

EXPOSE 3000

# コンテナ起動時に実行されるデフォルトコマンド
CMD ["pnpm", "dev"]