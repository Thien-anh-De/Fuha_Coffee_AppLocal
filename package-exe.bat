@echo off
chcp 65001 > nul
title Đóng Gói Ứng Dụng FuHa Cafe POS (Windows .exe)
echo ==========================================================
echo       FUHA CAFE POS - ĐÓNG GÓI BẢN CÀI ĐẶT DESKTOP (.EXE)
echo ==========================================================
echo [*] Bắt đầu quá trình biên dịch và đóng gói...
echo.

call npm run package:exe

if %errorlevel% neq 0 (
    echo.
    echo [!] Có lỗi xảy ra trong quá trình đóng gói. Vui lòng kiểm tra lại.
) else (
    echo.
    echo ==========================================================
    echo [✓] ĐÓNG GÓI THÀNH CÔNG!
    echo [*] File cài đặt (.exe) được lưu tại thư mục: release\
    echo ==========================================================
)

echo.
pause
