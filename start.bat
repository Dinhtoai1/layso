@echo off
echo 🚀 Khởi động hệ thống quản lý hàng đợi...
echo.

REM Kiểm tra Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js chưa được cài đặt!
    echo Vui lòng tải và cài đặt Node.js từ: https://nodejs.org
    pause
    exit /b 1
)

REM Cài đặt dependencies nếu chưa có
if not exist node_modules (
    echo 📦 Cài đặt dependencies...
    npm install
)

REM Lấy IP của máy hiện tại
echo 🔍 Đang lấy địa chỉ IP...
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /i "IPv4"') do (
    set "ip=%%i"
    goto :found
)
:found
set "ip=%ip: =%"

echo.
echo ✅ Hệ thống sẵn sàng!
echo 🌐 Truy cập từ máy này: http://localhost:3000
echo 🏢 Truy cập từ máy khác: http://%ip%:3000
echo.
echo 📱 Các trang chính:
echo    • Nhân viên: http://%ip%:3000/staff
echo    • Quản trị: http://%ip%:3000/admin  
echo    • Màn hình hiển thị: http://%ip%:3000/all-counters-display
echo.
echo ⏹️  Nhấn Ctrl+C để dừng server
echo.

REM Khởi động server
node server.js

pause
