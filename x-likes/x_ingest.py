#!/usr/bin/env python3
"""
x_ingest.py —— 把油猴脚本导出的 x_*.json 入库到 Obsidian 目录。

流程：
  下载文件夹里出现 x_*.json
    -> 下载图片/视频到  <vault>/<年>/media/   （所有媒体平铺，文件名带贴文 id，不会重名）
    -> 生成 markdown 到 <vault>/<年>/
    -> 把原始 json 归档到 <vault>/_raw/<年>/    （以后可以随时重新生成 md）

用法：
  python x_ingest.py                 # 常驻，监视下载文件夹
  python x_ingest.py --once          # 处理一次就退出
  python x_ingest.py --rebuild       # 重新处理 _raw 里的 json：补下载缺失的媒体、补生成缺失的 md
  python x_ingest.py --rebuild --force   # 连已有的 md 也覆盖（你手改过的笔记会丢）

只用标准库，需要 Python 3.8+。
"""
import argparse
import json
import re
import shutil
import sys
import time
import urllib.request
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, parse_qs

# ---------------- 配置 ----------------
VAULT = Path(r"D:\GitLab\obsidian-x")
INBOX = Path.home() / "Downloads"   # 浏览器下载文件夹；不是这个就用 --inbox 指定
YEAR_BY = "posted"                  # "posted"=按贴文发布年份；"saved"=按保存年份
POLL_SECONDS = 2
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
WARN = "未下载"   # md 里的警告标记，重新保存后据此判断是否需要重新生成 md
# --------------------------------------


def parse_dt(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00")).astimezone()
    except Exception:
        return None


def safe(s):
    return re.sub(r"[^\w.\-]", "_", s or "")


def yaml_str(s):
    return json.dumps(s or "", ensure_ascii=False)


def ext_of(url, default):
    u = urlparse(url)
    ext = Path(u.path).suffix.lower().lstrip(".")
    if not ext or len(ext) > 4:
        ext = (parse_qs(u.query).get("format") or [default])[0]
    return ext or default


def download(url, dest):
    if dest.exists() and dest.stat().st_size > 0:
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    for attempt in range(1, 4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r, open(part, "wb") as f:
                shutil.copyfileobj(r, f, 1024 * 1024)
            part.replace(dest)
            return True
        except Exception as e:
            print(f"    下载失败({attempt}/3) {dest.name}: {e}")
            time.sleep(2 * attempt)
    try:
        part.unlink()
    except OSError:
        pass
    return False


def plan_media(tid, prefix, items, fallback_images):
    """返回 (任务列表[(kind, url, 文件名)], 说明列表)。prefix: 主贴 ''，引用贴 'q'。"""
    jobs, notes = [], []
    n_img = n_vid = 0
    for m in items:
        if m.get("type") == "photo":
            n_img += 1
            url = m.get("url", "")
            jobs.append(("img", url, f"{tid}_{prefix}i{n_img}.{ext_of(url, 'jpg')}"))
        else:
            n_vid += 1
            url = m.get("best_mp4")
            if url:
                jobs.append(("video", url, f"{tid}_{prefix}v{n_vid}.mp4"))
            else:
                notes.append(f"视频 {prefix}{n_vid} 没有 mp4 地址，{WARN}")
    if not items:  # 没有接口数据时，退回用页面上的图片地址
        for url in fallback_images:
            n_img += 1
            jobs.append(("img", url, f"{tid}_{prefix}i{n_img}.{ext_of(url, 'jpg')}"))
    return jobs, notes


def md_lines(text):
    return (text or "").replace("\r\n", "\n").split("\n")


def callout(kind, title, lines):
    out = [f"> [!{kind}] {title}".rstrip()]
    out += [("> " + l) if l else ">" for l in lines]
    return "\n".join(out)


def ingest(data, vault, force=False):
    tid = str(data["id"])
    author = data.get("author") or {}
    handle = safe(str(author.get("id", "")).lstrip("@")) or "unknown"
    name = author.get("name", "")
    saved = parse_dt(data.get("saved_at")) or datetime.now().astimezone()
    posted = parse_dt(data.get("time")) or saved
    year = (posted if YEAR_BY == "posted" else saved).year

    year_dir = vault / str(year)
    media_dir = year_dir / "media"
    md_path = year_dir / f"{posted:%Y-%m-%d}_{handle}_{tid}.md"

    quoted = data.get("quoted") or None
    jobs, notes = plan_media(tid, "", data.get("media") or [], data.get("images") or [])
    qjobs, qnotes = ([], [])
    if quoted:
        qjobs, qnotes = plan_media(tid, "q", quoted.get("media") or [], quoted.get("images") or [])

    problems = list(notes) + list(qnotes)
    has_video_media = any(m.get("type") != "photo" for m in (data.get("media") or []))
    if data.get("videos") and not has_video_media:
        problems.append(f"视频没有捕获到 mp4 地址（保存前没刷新页面？），{WARN}")

    def run(jobs_):
        res = []
        for kind, url, fname in jobs_:
            res.append((kind, fname, download(url, media_dir / fname)))
        return res

    main_res, q_res = run(jobs), run(qjobs)
    problems += [f"{f} 下载失败，{WARN}" for _, f, ok in main_res + q_res if not ok]

    # 已有 md 时不覆盖（可能有你手写的笔记）；除非 --force，或上次因缺媒体带了警告而这次补齐了
    write_md = force or not md_path.exists()
    if not write_md and not problems:
        try:
            write_md = WARN in md_path.read_text(encoding="utf-8")
        except OSError:
            write_md = False

    if write_md:
        fm = [
            "---",
            f"url: {yaml_str(data.get('url'))}",
            f"tweet_id: {yaml_str(tid)}",  # 字符串，避免数字精度丢失
            f"author: {yaml_str(name)}",
            f"handle: {yaml_str(handle)}",
            f"posted: {posted:%Y-%m-%dT%H:%M:%S}",
            f"saved: {saved:%Y-%m-%dT%H:%M:%S}",
            f"category: {yaml_str(data.get('category') or '默认')}",
            "tags:",
            "  - x",
            "---",
            "",
        ]
        orig = (data.get("text_original") or "").strip()
        shown = (data.get("text") or "").strip()
        body = [orig or shown]
        if orig and shown and orig != shown:
            body += ["", callout("note", "X 自动翻译", md_lines(shown))]

        embeds = [f"![[{f}]]" for _, f, ok in main_res if ok]
        if embeds:
            body += [""] + embeds

        if quoted:
            qa = quoted.get("author") or {}
            qtitle = f"引用 {qa.get('name', '')} {qa.get('id', '')}".strip()
            qtext = (quoted.get("text_original") or quoted.get("text") or "").strip()
            qlines = md_lines(qtext)
            for _, f, ok in q_res:
                if ok:
                    qlines += ["", f"![[{f}]]"]
            if quoted.get("url"):
                qlines += ["", f"[原帖]({quoted['url']})"]
            body += ["", callout("quote", qtitle, qlines)]

        if problems:
            body += ["", callout("warning", f"部分媒体{WARN}", [f"- {p}" for p in problems])]

        body += ["", f"[在 X 打开]({data.get('url')})", ""]
        year_dir.mkdir(parents=True, exist_ok=True)
        md_path.write_text("\n".join(fm + body), encoding="utf-8", newline="\n")

    n_img = sum(1 for k, _, ok in main_res + q_res if k == "img" and ok)
    n_vid = sum(1 for k, _, ok in main_res + q_res if k == "video" and ok)
    state = "写入 md" if write_md else "md 已存在，跳过"
    flag = f"  有问题 {len(problems)} 处" if problems else ""
    print(f"[{tid}] {md_path.relative_to(vault)}  图{n_img} 视频{n_vid}  {state}{flag}")
    for p in problems:
        print(f"    - {p}")
    return year, handle, tid


def archive_raw(src, vault, year, handle, tid):
    dest = vault / "_raw" / str(year) / f"x_{handle}_{tid}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dest))  # 同名则覆盖，新保存的数据替换旧的


def valid(data):
    return isinstance(data, dict) and data.get("id") and data.get("url") and "author" in data


def scan_inbox(inbox):
    for p in sorted(inbox.glob("x_*.json")):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue  # 可能还没写完，下一轮再试
        if valid(data):
            yield p, data


def process_inbox(inbox, vault, force):
    n = 0
    for p, data in scan_inbox(inbox):
        try:
            year, handle, tid = ingest(data, vault, force)
            archive_raw(p, vault, year, handle, tid)
            n += 1
        except Exception as e:
            print(f"处理 {p.name} 出错: {e}")
    return n


def rebuild(vault, force):
    for p in sorted((vault / "_raw").glob("**/*.json")):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            if valid(data):
                ingest(data, vault, force)
        except Exception as e:
            print(f"处理 {p.name} 出错: {e}")


def main():
    try:
        sys.stdout.reconfigure(errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault", default=str(VAULT))
    ap.add_argument("--inbox", default=str(INBOX))
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--rebuild", action="store_true")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    vault, inbox = Path(a.vault), Path(a.inbox)

    if a.rebuild:
        rebuild(vault, a.force)
        return
    if a.once:
        print(f"处理 {inbox} 中的 x_*.json -> {vault}")
        process_inbox(inbox, vault, a.force)
        return

    print(f"监视 {inbox}（x_*.json） -> {vault}，Ctrl+C 退出")
    try:
        while True:
            process_inbox(inbox, vault, a.force)
            time.sleep(POLL_SECONDS)
    except KeyboardInterrupt:
        print("已退出")


if __name__ == "__main__":
    main()
