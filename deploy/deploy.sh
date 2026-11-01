#!/bin/sh
# Deploy lại trên VPS: sh /opt/tap-hoa/app/deploy/deploy.sh
# Cần sẵn /opt/tap-hoa/config.env chứa CONFIG_PASS_HASH (bản băm mật khẩu trang cấu hình).
set -e
cd /opt/tap-hoa

if [ -d app/.git ]; then
  git -C app pull --ff-only
else
  git clone https://github.com/hieubachvan/mobile-app-tap-hoa.git app
fi

if [ ! -f config.env ]; then
  echo "Thiếu /opt/tap-hoa/config.env (CONFIG_PASS_HASH=...)" >&2
  exit 1
fi

cp app/deploy/docker-compose.yml app/deploy/nginx.conf .
mkdir -p data dist
docker compose up -d --build
docker compose ps
