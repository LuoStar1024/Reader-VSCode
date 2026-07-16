export interface WebviewStrings {
  panelTitle: string;
  processing: string;
  addLog: string;
  chapterSearchPlaceholder: string;
  runtimeLogs: string;
  decreaseFontSize: string;
  increaseFontSize: string;
  decreaseLineHeight: string;
  increaseLineHeight: string;
  decreaseLineHeightLabel: string;
  increaseLineHeightLabel: string;
  previousChapter: string;
  logContent: string;
  nextChapter: string;
  adRelayLabel: string;
  noLogs: string;
  noChapters: string;
  unopenedChapter: string;
  waitingForOutput: string;
  selectLogAndChapter: string;
}

export interface LocalizedStrings {
  htmlLanguage: string;
  textFiles: string;
  addLogs: string;
  selectTxtLogs: string;
  importingLogs: string;
  addLogsFailedConsole: string;
  rejectedLogs(count: number): string;
  openingLog: string;
  deleteLogConfirmation(name: string): string;
  delete: string;
  onlyTxtFiles: string;
  duplicateLog: string;
  insufficientChapters(count: number): string;
  parseError(message: string): string;
  unreadableFile: string;
  noActiveLog: string;
  missingLog: string;
  blankLog: string;
  fullText: string;
  opening: string;
  webview: WebviewStrings;
}

const ENGLISH: LocalizedStrings = {
  htmlLanguage: "en",
  textFiles: "Text files",
  addLogs: "Add Logs",
  selectTxtLogs: "Select TXT log files to add",
  importingLogs: "Importing logs...",
  addLogsFailedConsole: "Failed to add logs",
  rejectedLogs: (count) =>
    count === 1
      ? "1 log could not be parsed and was skipped. See the developer tools console for details."
      : `${count} logs could not be parsed and were skipped. See the developer tools console for details.`,
  openingLog: "Opening log...",
  deleteLogConfirmation: (name) =>
    `Delete log \"${name}\"? This only removes the entry and does not delete the original TXT file.`,
  delete: "Delete",
  onlyTxtFiles: "Only TXT files are supported.",
  duplicateLog: "This log has already been added.",
  insufficientChapters: (count) =>
    `Parsing failed: ${count} chapters were detected; more than 2 are required.`,
  parseError: (message) => `Parsing failed: ${message}`,
  unreadableFile: "Parsing failed: the file could not be read or parsed.",
  noActiveLog: "There is no log to open.",
  missingLog: "The log does not exist or has been removed.",
  blankLog: "Blank log",
  fullText: "Full text",
  opening: "Opening",
  webview: {
    panelTitle: "Logs",
    processing: "Processing...",
    addLog: "Add Logs",
    chapterSearchPlaceholder: "Enter a chapter ID or number",
    runtimeLogs: "Runtime Logs",
    decreaseFontSize: "Decrease font size",
    increaseFontSize: "Increase font size",
    decreaseLineHeight: "Decrease line height",
    increaseLineHeight: "Increase line height",
    decreaseLineHeightLabel: "L-",
    increaseLineHeightLabel: "L+",
    previousChapter: "Previous chapter",
    logContent: "Log Content",
    nextChapter: "Next chapter",
    adRelayLabel: "API relay",
    noLogs: "No logs yet. Add TXT files above to start reading.",
    noChapters: "Open a log to view its chapter list here.",
    unopenedChapter: "No chapter open",
    waitingForOutput: "Waiting for simulated log output...",
    selectLogAndChapter:
      "Select a log on the left and a chapter in the middle to read its content here.",
  },
};

const SIMPLIFIED_CHINESE: LocalizedStrings = {
  htmlLanguage: "zh-CN",
  textFiles: "文本文件",
  addLogs: "添加日志",
  selectTxtLogs: "选择要添加的 TXT 日志文件",
  importingLogs: "正在导入日志...",
  addLogsFailedConsole: "新增日志失败",
  rejectedLogs: (count) =>
    `有 ${count} 个日志解析失败，已跳过。详情见开发者工具控制台。`,
  openingLog: "正在打开日志...",
  deleteLogConfirmation: (name) =>
    `确定删除日志“${name}”吗？这只会移除记录，不会删除原始 TXT 文件。`,
  delete: "删除",
  onlyTxtFiles: "仅支持添加 TXT 格式文件。",
  duplicateLog: "该日志已存在，无需重复添加。",
  insufficientChapters: (count) =>
    `解析失败：识别到的章节数为 ${count}，需大于 2 章。`,
  parseError: (message) => `解析失败：${message}`,
  unreadableFile: "解析失败：无法读取或解析该文件。",
  noActiveLog: "当前没有可打开的日志。",
  missingLog: "日志不存在或已被移除。",
  blankLog: "空白日志",
  fullText: "全文",
  opening: "开篇",
  webview: {
    panelTitle: "日志",
    processing: "正在处理...",
    addLog: "新增日志",
    chapterSearchPlaceholder: "输入章节 ID 或章节序号",
    runtimeLogs: "运行日志",
    decreaseFontSize: "缩小字号",
    increaseFontSize: "放大字号",
    decreaseLineHeight: "减小行距",
    increaseLineHeight: "增大行距",
    decreaseLineHeightLabel: "行-",
    increaseLineHeightLabel: "行+",
    previousChapter: "上一章",
    logContent: "日志正文",
    nextChapter: "下一章",
    adRelayLabel: "中转站",
    noLogs: "还没有日志。点击上方“新增日志”添加 TXT 文件后，就可以开始阅读。",
    noChapters: "打开日志后，这里会显示章节目录。",
    unopenedChapter: "未打开章节",
    waitingForOutput: "等待模拟日志输出...",
    selectLogAndChapter: "选择左侧日志与中间章节后，正文会显示在这里。",
  },
};

export function isChineseLanguage(language: string): boolean {
  return language.trim().toLowerCase().replaceAll("_", "-").startsWith("zh");
}

export function getLocalizedStrings(language: string): LocalizedStrings {
  return isChineseLanguage(language) ? SIMPLIFIED_CHINESE : ENGLISH;
}
