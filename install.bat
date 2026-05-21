@echo off
cd /d d:\Exp\web3task\server
echo Installing server dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo Server npm install failed with error code %ERRORLEVEL%
    exit /b %ERRORLEVEL%
)

cd /d d:\Exp\web3task\client
echo Installing client dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo Client npm install failed with error code %ERRORLEVEL%
    exit /b %ERRORLEVEL%
)

echo All dependencies installed successfully!
