#!/usr/bin/env python3
# 用途: 文件夹剪切工具，超长文件名自动缩短后移动（跨盘安全）
# 用法: python movedir.py SRC DST [--max-bytes 255] [--dry-run] [--overwrite] [--log FILE]
# 注意: 跨盘非原子；失败不删源；默认不覆盖已存在文件；eCryptfs 用 --max-bytes 143
"""
movedir.py - 文件夹到文件夹"剪切"，遇到超长文件名自动缩短而不是跳过。

用法:
    python movedir.py SRC DST [--max-bytes 255] [--dry-run] [--overwrite] [--log moved.csv]

要点:
  * 文件名/目录名按 UTF-8 *字节数* 判断（中文 1 字 = 3 字节），超限则截断，
    保留扩展名，并追加 ~xxxxxx 短哈希避免重名。
  * 同盘用 rename，跨盘用 复制 -> 校验大小 -> 删除源；失败绝不删源文件。
  * Windows 下自动加 \\\\?\\ 前缀，绕开 260 字符路径限制。
  * 所有改名与错误写入 CSV 日志，方便回溯。
  * 目标若是 eCryptfs 之类，用 --max-bytes 143。
"""
import argparse
import csv
import hashlib
import os
import shutil
import sys

IS_WIN = os.name == "nt"


def lp(path: str) -> str:
    """Windows 长路径前缀。"""
    if not IS_WIN:
        return path
    path = os.path.abspath(path)
    if path.startswith("\\\\?\\"):
        return path
    if path.startswith("\\\\"):  # UNC
        return "\\\\?\\UNC\\" + path[2:]
    return "\\\\?\\" + path


def blen(s: str) -> int:
    return len(s.encode("utf-8", "surrogatepass"))


def shorten(name: str, max_bytes: int) -> str:
    """若 name 的 UTF-8 字节数超限，则截断 + 追加短哈希，保留扩展名。"""
    if blen(name) <= max_bytes:
        return name
    stem, ext = os.path.splitext(name)
    if blen(ext) > 20:  # 扩展名异常长，当作没有扩展名
        stem, ext = name, ""
    tag = "~" + hashlib.sha1(name.encode("utf-8", "surrogatepass")).hexdigest()[:6]
    budget = max_bytes - blen(ext) - blen(tag)
    raw = stem.encode("utf-8", "surrogatepass")[:budget]
    cut = raw.decode("utf-8", "ignore")  # 丢弃被切断的半个字符
    return cut + tag + ext


def move_file(src: str, dst: str) -> None:
    s, d = lp(src), lp(dst)
    try:
        os.rename(s, d)  # 同盘：瞬间完成
        return
    except OSError:
        pass
    # 跨盘：复制 -> 校验 -> 删除源
    shutil.copy2(s, d)
    if os.path.getsize(s) != os.path.getsize(d):
        os.remove(d)
        raise OSError("复制后大小不一致，已回滚目标文件")
    os.remove(s)


def main() -> int:
    ap = argparse.ArgumentParser(description="文件夹→文件夹剪切，自动缩短超长文件名")
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--max-bytes", type=int, default=255, help="单个名字的 UTF-8 字节上限，默认 255")
    ap.add_argument("--dry-run", action="store_true", help="只预览，不实际移动")
    ap.add_argument("--overwrite", action="store_true", help="目标已存在同名文件时覆盖（默认跳过）")
    ap.add_argument("--log", default="movedir_log.csv", help="日志文件，默认 movedir_log.csv")
    a = ap.parse_args()

    src = os.path.abspath(a.src)
    dst = os.path.abspath(a.dst)
    if not os.path.isdir(lp(src)):
        print(f"源目录不存在: {src}", file=sys.stderr)
        return 2
    if dst == src or dst.startswith(src + os.sep):
        print("目标不能在源目录内部", file=sys.stderr)
        return 2

    n_ok = n_renamed = n_skip = n_err = 0
    with open(a.log, "w", newline="", encoding="utf-8-sig") as lf:
        log = csv.writer(lf)
        log.writerow(["status", "source", "target", "note"])

        for root, dirs, files in os.walk(lp(src)):
            rel = os.path.relpath(root, lp(src))
            rel_parts = [] if rel == "." else rel.split(os.sep)
            new_parts = [shorten(p, a.max_bytes) for p in rel_parts]
            out_dir = os.path.join(dst, *new_parts)
            if not a.dry_run:
                os.makedirs(lp(out_dir), exist_ok=True)

            for fn in files:
                s_path = os.path.join(root, fn)
                new_fn = shorten(fn, a.max_bytes)
                t_path = os.path.join(out_dir, new_fn)
                changed = (new_fn != fn) or (new_parts != rel_parts)
                note = "已缩短名称" if changed else ""
                show_s = s_path.replace("\\\\?\\", "", 1) if IS_WIN else s_path

                try:
                    if os.path.exists(lp(t_path)) and not a.overwrite:
                        n_skip += 1
                        log.writerow(["SKIP", show_s, t_path, "目标已存在"])
                        continue
                    if not a.dry_run:
                        if a.overwrite and os.path.exists(lp(t_path)):
                            os.remove(lp(t_path))
                        move_file(s_path, t_path)
                    n_ok += 1
                    if changed:
                        n_renamed += 1
                        log.writerow(["RENAMED", show_s, t_path, note])
                    else:
                        log.writerow(["OK", show_s, t_path, ""])
                except Exception as e:  # 单个文件失败不影响其他文件，源文件保留
                    n_err += 1
                    log.writerow(["ERROR", show_s, t_path, repr(e)])
                    print(f"[失败] {show_s}: {e}", file=sys.stderr)

        # 清理已清空的源目录（自底向上，只删空目录）
        if not a.dry_run:
            for root, dirs, files in os.walk(lp(src), topdown=False):
                try:
                    os.rmdir(root)
                except OSError:
                    pass

    tag = "[预览] " if a.dry_run else ""
    print(f"{tag}完成：移动 {n_ok}（其中改名 {n_renamed}），跳过 {n_skip}，失败 {n_err}。日志：{a.log}")
    return 1 if n_err else 0


if __name__ == "__main__":
    sys.exit(main())
