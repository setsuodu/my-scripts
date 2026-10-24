#!/usr/bin/env python3
"""
自动维护 D:\Program Files\ArtCraft 下的各个 Craft 应用（portable 版）
检测到新版本 → 下载 → 解压覆盖 → 更新 version.json
"""

import json
import time
import requests
import zipfile
import shutil
from pathlib import Path
from datetime import datetime

CONFIG_FILE  = Path("config.json")
VERSION_FILE = Path("version.json")

def load_json(path: Path, default=None):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default

def save_json(path: Path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

def get_latest_release(repo: str, platform: str):
    url = f"https://api.github.com/repos/storytold/{repo}/releases/latest"
    try:
        r = requests.get(url, timeout=20)
        r.raise_for_status()
        data = r.json()
        tag = data["tag_name"]
        version = tag.lstrip("v")

        expected_name = f"{repo}-{version}-{platform}.zip"
        for asset in data.get("assets", []):
            if asset["name"] == expected_name:
                return version, asset["browser_download_url"]
        print(f"[{datetime.now():%H:%M:%S}] {repo} 没找到 {expected_name}")
    except Exception as e:
        print(f"[{datetime.now():%H:%M:%S}] 获取 {repo} 失败: {e}")
    return None, None

def download_and_extract(url: str, target_dir: Path, zip_path: Path):
    print(f"  下载中 → {zip_path.name}")
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(zip_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 128):
                if chunk:
                    f.write(chunk)

    # 清空旧目录再解压（保证干净）
    if target_dir.exists():
        shutil.rmtree(target_dir)
    target_dir.mkdir(parents=True)

    print(f"  解压到 → {target_dir}")
    with zipfile.ZipFile(zip_path, "r") as z:
        # 有些 zip 会带一层目录，有些直接是文件，这里统一处理
        for info in z.infolist():
            # 去掉最外层目录（如果有）
            parts = Path(info.filename).parts
            if len(parts) > 1 and parts[0].startswith(repo := target_dir.name):
                # 跳过最外层
                dest = target_dir / Path(*parts[1:])
            else:
                dest = target_dir / info.filename

            if info.is_dir():
                dest.mkdir(parents=True, exist_ok=True)
            else:
                dest.parent.mkdir(parents=True, exist_ok=True)
                with z.open(info) as src, open(dest, "wb") as dst:
                    shutil.copyfileobj(src, dst)

    zip_path.unlink(missing_ok=True)  # 下完就删 zip，省空间
    print(f"  完成")

def main():
    config = load_json(CONFIG_FILE)
    if not config:
        print("请先创建 config.json")
        return

    install_root = Path(config["install_root"])
    install_root.mkdir(parents=True, exist_ok=True)

    versions = load_json(VERSION_FILE, default={})
    interval = config.get("check_interval", 300)
    platform = config["platform"]
    repos = config["repos"]

    print(f"安装根目录: {install_root}")
    print(f"监控 {len(repos)} 个应用，每 {interval} 秒检查一次\n")

    while True:
        updated = False

        for repo in repos:
            version, url = get_latest_release(repo, platform)
            if not version:
                continue

            old_version = versions.get(repo)
            if old_version == version:
                print(f"[{datetime.now():%H:%M:%S}] {repo}: {version} （已是最新）")
                continue

            print(f"\n🔔 {repo} 有更新：{old_version or '无'} → {version}")

            target_dir = install_root / repo
            zip_path = install_root / f"{repo}-{version}-{platform}.zip"

            try:
                download_and_extract(url, target_dir, zip_path)
                versions[repo] = version
                save_json(VERSION_FILE, versions)
                updated = True
            except Exception as e:
                print(f"  失败: {e}")

        if updated:
            print("\n✅ 本轮更新完成\n")

        time.sleep(interval)

if __name__ == "__main__":
    main()