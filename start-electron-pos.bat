@echo off
chcp 65001 > nul
title FuHa Cafe POS - Desktop App (Electron)
echo ==========================================================
echo        FUHA CAFE POS - DESKTOP APP (ELECTRON)
echo ==========================================================
echo [*] Đang khởi động ứng dụng Desktop...

if not exist dist (
  echo [*] Đang biên dịch giao diện...
  call npm run build
)

npx electron electron/main.js
