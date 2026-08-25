@echo off
title Push TradingView Broker to GitHub
echo ======================================================
echo Pushing project to https://github.com/imranalam89/tradingview-demo-broker ...
echo ======================================================
echo.
git push -u origin main
echo.
echo ======================================================
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Code pushed to GitHub successfully!
    echo Now go to Render.com and deploy your Web Service.
) else (
    echo [NOTICE] If prompted above, please sign in with your GitHub account.
)
echo ======================================================
pause
