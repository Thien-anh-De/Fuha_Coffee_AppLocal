@echo off
title FuHa Cafe POS - Don dep tan du Molliee
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$paths = @(\"$env:APPDATA\pos-molliee\", \"$env:APPDATA\Molliee POS\", \"$env:LOCALAPPDATA\pos-molliee-updater\", \"$env:LOCALAPPDATA\Programs\Molliee POS\", \"$env:USERPROFILE\Desktop\Molliee POS.lnk\", \"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Molliee POS.lnk\"); $cnt = 0; foreach ($p in $paths) { if (Test-Path $p) { Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue; Write-Host ('[+] Da xoa: ' + $p) -ForegroundColor Green; $cnt++ } }; if ($cnt -eq 0) { Write-Host '[OK] May tinh hoan toan sach se, khong co tan du cua Molliee.' -ForegroundColor Cyan } else { Write-Host ('[OK] Da don dep xong ' + $cnt + ' muc tan du Molliee tren may!') -ForegroundColor Cyan }"
echo.
pause
