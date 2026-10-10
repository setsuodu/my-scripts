# my-scripts

个人常用脚本集合。按用途分目录，每个脚本开头有统一文件头，方便检索与维护。

## 目录结构

```
my-scripts/
├── artcraft/       # 便携版创意软件格式注册（Photo/Word/Grid/Effect/FilmCraft）
├── files/          # 文件整理、去重、批量操作
├── chrome/         # Chrome 相关（指定 Profile 启动等）
├── windows/        # Windows 系统维护
├── make-index.py   # 扫描「用途:」行，自动生成 INDEX.md
├── INDEX.md        # 自动生成的脚本索引
└── README.md
```

## 当前脚本

见 [INDEX.md](INDEX.md)。

## 文件头约定

每个脚本开头固定三行（可再加「依赖」等）：

```
REM 用途: ……
REM 用法: ……
REM 注意: ……
```

跑一次 `python make-index.py` 即可更新索引表。

## artcraft 使用说明

把对应 `reg_xxx.bat` 放到对应 `xxx.exe` 同目录，右键「以管理员身份运行」。

- 只把程序加入该格式的「打开方式」备选列表，**不会修改系统默认程序**。
- 支持路径中带空格。
- 需要管理员权限写入注册表。

| 脚本 | 程序 | 主要扩展名 |
|------|------|------------|
| reg_photocraft.bat | photocraft.exe | .psd .psb .png .jpg .tif .webp .raw ... |
| reg_wordcraft.bat | wordcraft.exe | .docx .doc .rtf .odt .md ... |
| reg_gridcraft.bat | gridcraft.exe | .xlsx .xls .csv .xlsm .ods ... |
| reg_effectcraft.bat | effectcraft.exe | .aep .aepx .mogrt .ffx ... |
| reg_filmcraft.bat | filmcraft.exe | .prproj .prtl .mogrt ... |

## 使用建议

- 把本仓库目录加入 PATH，任意位置可直接敲脚本名。
- 搜索时用 Everything / PowerToys Run，搜中文关键词（如「去重」「签到」「注册」）即可命中文件头说明。
- 会改动数据的脚本务必在「注意」里写清楚副作用。
