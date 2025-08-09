@echo off
echo 🌍 Triển khai lên Internet bằng Ngrok...
echo.

REM Kiểm tra ngrok
ngrok version >nul 2>&1
if errorlevel 1 (
    echo ❌ Ngrok chưa được cài đặt!
    echo 📥 Đang cài đặt ngrok...
    npm install -g ngrok
)

echo ✅ Ngrok đã sẵn sàng!
echo.
echo 🚀 Bước 1: Khởi động server...
start "Server" cmd /k "node server.js"

echo ⏳ Đợi 3 giây cho server khởi động...
timeout /t 3 /nobreak >nul

echo 🌐 Bước 2: Tạo tunnel public...
echo.
echo 🔗 URL công khai sẽ hiển thị bên dưới:
echo ================================================
ngrok http 3000

pause
