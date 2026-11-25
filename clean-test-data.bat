@echo off
chcp 65001 > nul
title FuHa Cafe POS - Xóa Dữ Liệu Đơn Hàng Test
echo ==========================================================
echo        FUHA CAFE POS - DỌN DẸP DỮ LIỆU TEST
echo ==========================================================
echo [*] Thao tác này sẽ:
echo     - Xóa toàn bộ đơn hàng test, hóa đơn và lịch sử thanh toán về 0.
echo     - Trả toàn bộ bàn về trạng thái TRỐNG.
echo     - GIỮ NGUYÊN danh mục, thực đơn món, giá bán và tài khoản nhân viên.
echo     - Tự động tạo 1 bản sao lưu dự phòng an toàn trước khi dọn.
echo ==========================================================
echo.
set /p confirm="Bạn có chắc chắn muốn xóa dữ liệu test không? (Y/N): "
if /i not "%confirm%"=="Y" (
    echo Đã hủy thao tác.
    pause
    exit /b
)

node -e "
import('./electron/database.js').then(async ({ initDatabase, dbService }) => {
  initDatabase();
  dbService.cleanTestData();
  console.log('\n[SUCCESS] Đã dọn dẹp sạch toàn bộ đơn hàng test!');
  console.log('[INFO] Doanh thu và hóa đơn đã về 0, sẵn sàng cho ngày khai trương.');
  process.exit(0);
}).catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
"
echo.
pause
