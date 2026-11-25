$paths = @(
  "$env:APPDATA\pos-molliee",
  "$env:APPDATA\Molliee POS",
  "$env:LOCALAPPDATA\pos-molliee-updater",
  "$env:LOCALAPPDATA\Programs\Molliee POS",
  "$env:USERPROFILE\Desktop\Molliee POS.lnk",
  "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Molliee POS.lnk"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "     FUHA CAFE POS - DON DEP TAN DU MOLLIEE TREN MAY      " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$count = 0
foreach ($p in $paths) {
  if (Test-Path $p) {
    try {
      Remove-Item -Recurse -Force $p -ErrorAction Stop
      Write-Host "[+] Da xoa thanh cong: $p" -ForegroundColor Green
      $count++
    } catch {
      Write-Host "[!] Khong the xoa (co the dang chay): $p" -ForegroundColor Yellow
    }
  }
}

if ($count -eq 0) {
  Write-Host "[✓] May tinh hoan toan sach se, khong co tan du cua Molliee." -ForegroundColor Green
} else {
  Write-Host "[✓] Da don dep xong $count muc tan du cua Molliee!" -ForegroundColor Green
}
Write-Host "==========================================================" -ForegroundColor Cyan
