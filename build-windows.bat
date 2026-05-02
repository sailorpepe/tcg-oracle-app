@echo off
:: ================================================================
:: TCG Oracle — Windows Build Script
:: RIGHT-CLICK > Run as Administrator on any Windows 10/11 PC.
:: Produces the NSIS .exe installer.
:: ================================================================

echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║   TCG ORACLE — WINDOWS BUILD v1.2.0             ║
echo  ╚══════════════════════════════════════════════════╝
echo.

:: Enable long paths
echo [0/5] Enabling Windows long path support...
reg add "HKLM\SYSTEM\CurrentControlSet\Control\FileSystem" /v LongPathsEnabled /t REG_DWORD /d 1 /f >nul 2>&1

:: Check for winget
where winget >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] winget not found. Update Windows or install App Installer from Microsoft Store.
    pause
    exit /b 1
)

:: Step 1: Install Rust
echo [1/5] Installing Rust...
winget install --id Rustlang.Rustup --accept-source-agreements --accept-package-agreements -e
call "%USERPROFILE%\.cargo\env.bat" 2>nul
rustup install stable
rustup default stable

:: Step 2: Install Node.js
echo [2/5] Installing Node.js 20...
winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements -e

:: Step 3: Install Git
echo [3/5] Installing Git...
winget install --id Git.Git --accept-source-agreements --accept-package-agreements -e

:: Refresh PATH
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
set PATH=%PROGRAMFILES%\nodejs;%PATH%
set PATH=%PROGRAMFILES%\Git\bin;%PATH%

:: Set up build directory
echo [4/5] Cloning TCG Oracle...
if exist D:\ (
    set BUILD_ROOT=D:\tcg-oracle-build
) else (
    set BUILD_ROOT=C:\tcg-oracle-build
)

if not exist %BUILD_ROOT% mkdir %BUILD_ROOT%
cd /d %BUILD_ROOT%

git config --global --add safe.directory %BUILD_ROOT%\tcg-oracle-app 2>nul

if exist tcg-oracle-app (
    echo   Updating repo...
    cd tcg-oracle-app
    git pull origin main
    cd ..
) else (
    git clone https://github.com/sailorpepe/tcg-oracle-app.git
)

cd tcg-oracle-app

:: Clean old build
echo   Cleaning previous build output...
if exist src-tauri\target\release\bundle\nsis rmdir /s /q src-tauri\target\release\bundle\nsis

:: Install and export
echo   Running npm install...
call npm install

echo   Exporting static web build...
if exist dist rmdir /s /q dist
call npx expo export --platform web

:: CRITICAL: Verify the export produced index.html
if not exist dist\index.html (
    echo.
    echo  ╔══════════════════════════════════════════════════╗
    echo  ║          EXPORT FAILED — dist/index.html        ║
    echo  ╠══════════════════════════════════════════════════╣
    echo  ║  The static web export did not produce files.   ║
    echo  ║  Try running manually:                          ║
    echo  ║    cd tcg-oracle-app                            ║
    echo  ║    npx expo export --platform web               ║
    echo  ║  Then re-run this script.                       ║
    echo  ╚══════════════════════════════════════════════════╝
    echo.
    pause
    exit /b 1
)
echo   dist/index.html verified OK.

:: Build
echo [5/5] Running Tauri build (10-15 minutes)...
call npx tauri build

:: Check result
if exist src-tauri\target\release\bundle\nsis\*.exe (
    echo.
    echo  ╔══════════════════════════════════════════════════╗
    echo  ║              BUILD COMPLETE!                     ║
    echo  ╠══════════════════════════════════════════════════╣
    echo  ║  Your .exe installer is ready.                  ║
    echo  ║  Opening the folder now...                      ║
    echo  ╚══════════════════════════════════════════════════╝
    echo.
    explorer src-tauri\target\release\bundle\nsis
) else (
    echo.
    echo  ╔══════════════════════════════════════════════════╗
    echo  ║              BUILD FAILED                       ║
    echo  ╠══════════════════════════════════════════════════╣
    echo  ║  Scroll up to see the error message.            ║
    echo  ║  Common fixes:                                  ║
    echo  ║  1. Reboot and run as Administrator             ║
    echo  ║  2. Check if antivirus blocked the build        ║
    echo  ╚══════════════════════════════════════════════════╝
    echo.
)

pause
