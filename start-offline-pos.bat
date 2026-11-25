@echo off
chcp 65001 > nul
title FuHa Cafe POS - Hệ Thống Bán Hàng (Offline)
echo ==========================================================
echo        FUHA CAFE POS - HỆ THỐNG BÁN HÀNG OFFLINE
echo ==========================================================
echo [*] Đang khởi động hệ thống và nạp cơ sở dữ liệu SQLite...
echo [*] Không yêu cầu kết nối mạng Internet.

if not exist dist (
  echo [*] Đang biên dịch giao diện lần đầu...
  call npm run build
)

start "" node server.js
exit
