# VSCode Reader

`VSCode Reader` 是一个 VS Code 扩展，用来在编辑器底部面板里阅读 `TXT` 小说或长文本。

它把阅读界面放进一个名为“日志”的自定义面板中，适合一边写代码、一边顺手看文本内容。

## Features

- 在底部面板中打开 `TXT` 文件进行阅读
- 自动识别常见中文章节标题并生成目录
- 支持章节切换与章节搜索
- 记忆每本书的阅读进度
- 记忆面板布局、字号和行距
- 支持同时导入多本书
- 支持从列表中移除已导入书籍记录

## Usage

1. 打开 VS Code 底部面板中的“日志”视图
2. 点击“新增日志”
3. 选择一个或多个 `.txt` 文件
4. 从左侧书籍列表与中间章节列表中开始阅读

## Supported Content

- `.txt` 纯文本文件
- 常见中文章节命名，例如 `第一章`、`第十二回`
- 部分英文章节命名，例如 `Chapter 1`

## Notes

- 当前界面容器名为“日志”，这是该扩展现阶段的视图名称
- 插件不会删除原始 `TXT` 文件；移除操作只会删除扩展内记录
- 首次打开时四个区域会均分，后续会恢复你保存过的布局

## Commands

- `新建日志`
- `新增日志`

## Known Limitations

- 目前仅支持 `TXT` 文件
- 章节识别依赖标题规则，部分格式特殊的文本可能无法正确拆章
- 暂不提供云同步或跨设备同步阅读进度

## License

This project is licensed under the GNU GPL v3. See the [LICENSE](LICENSE) file for details.
