@echo off
charset utf-8
echo 「ファイル名を指定して実行」の履歴を削除しています...

:: 1. 履歴が保存されているレジストリキーを削除
reg delete "HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\RunMRU" /f

:: 2. 変更を反映させるためにエクスプローラーを再起動
echo エクスプローラーを再起動しています...
taskkill /f /im explorer.exe
start explorer.exe

echo 削除が完了しました！
pause
