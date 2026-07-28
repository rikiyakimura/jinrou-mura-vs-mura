@echo off
chcp 65001 > nul
cd /d "%~dp0"

REM .env.local から環境変数を読み込む
for /f "usebackq tokens=1,* delims==" %%a in (".env.local") do (
    if not "%%a"=="" if not "%%a:~0,1%"=="#" (
        set "%%a=%%b"
    )
)

echo 環境変数を読み込みました
echo Starting Claude Code...
claude
