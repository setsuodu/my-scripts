REM 用途: 启动 ComfyUI（NVIDIA GPU）并开启 API，允许远程/局域网调用
REM 用法: 双击运行，或放到 ComfyUI 根目录后执行
REM 注意: 无鉴权！暴露到公网前务必加防火墙/反向代理/Cloudflare Tunnel 等保护

.\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --listen 0.0.0.0 --port 8188
echo.
echo ComfyUI 已启动（API 模式）
echo 本机访问: http://127.0.0.1:8188
echo 局域网访问: http://你的局域网IP:8188
echo.
echo 如果启动失败：
echo 1. 更新 Nvidia 驱动到最新
echo 2. c10.dll 错误请安装 VC++ 运行库: https://aka.ms/vc14/vc_redist.x64.exe
echo.
pause