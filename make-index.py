#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""扫描仓库中的脚本，根据文件头「用途:」行自动生成 INDEX.md。"""

import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
SUFFIXES = {".bat", ".ps1", ".py", ".sh", ".cmd"}

rows = []
for p in sorted(ROOT.rglob("*")):
    if not p.is_file() or p.suffix.lower() not in SUFFIXES:
        continue
    if p.name == "make-index.py":
        continue
    text = p.read_text(encoding="utf-8", errors="ignore")
    m = re.search(r"用途[:：]\s*(.+)", text)
    purpose = m.group(1).strip() if m else "（缺说明）"
    rel = p.relative_to(ROOT).as_posix()
    rows.append(f"| `{rel}` | {purpose} |")

header = "| 脚本 | 用途 |\n|---|---|\n"
content = header + "\n".join(rows) + "\n"
(ROOT / "INDEX.md").write_text(content, encoding="utf-8")
print(f"已生成 INDEX.md，共 {len(rows)} 个脚本。")
