@echo off
title FuHa Cafe POS - Don dep tan du phien ban cu
echo Dang don dep cac tep tin va thu muc cu cua FuHa Cafe POS...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$paths = @(\"$env:APPDATA\fuha-cafe-pos\", \"$env:APPDATA\FuHa Cafe POS\", \"$env:APPDATA\fuha pos\", \"$env:LOCALAPPDATA\fuha-cafe-pos-updater\", \"$env:LOCALAPPDATA\FuHa Cafe POS-updater\", \"$env:LOCALAPPDATA\Programs\fuha-cafe-pos\", \"$env:LOCALAPPDATA\Programs\FuHa Cafe POS\", \"$env:LOCALAPPDATA\Programs\fuha pos\", \"$env:USERPROFILE\Desktop\FuHa Cafe POS.lnk\", \"$env:USERPROFILE\Desktop\fuha pos.lnk\", \"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\FuHa Cafe POS.lnk\", \"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\fuha pos.lnk\"); $cnt = 0; foreach ($p in $paths) { if (Test-Path $p) { Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue; Write-Host ('[+] Da xoa: ' + $p) -ForegroundColor Green; $cnt++ } }; if ($cnt -eq 0) { Write-Host '[OK] May tinh hoan toan sach se, khong co tan du cua FuHa Cafe POS.' -ForegroundColor Cyan } else { Write-Host ('[OK] Da don dep xong ' + $cnt + ' muc tan du tren may!') -ForegroundColor Cyan }"
echo.
pause
