# Máy chủ trang cấu hình trên VPS: build sẵn trang config, lúc chạy thì build lại bản web khi lưu thông số
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:config
CMD ["node", "server/config-server.mjs"]
