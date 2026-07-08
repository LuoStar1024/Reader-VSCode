import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";

import * as vscode from "vscode";
import { detect } from "chardet";
import iconv from "iconv-lite";

import {
  ChapterSummary,
  LogEntry,
  PanelLayout,
  PanelState,
  ReadingPosition,
} from "./types";

interface ParsedChapter {
  id: string;
  index: number;
  title: string;
  start: number;
  end: number;
}

interface ParsedLog {
  log: LogEntry;
  text: string;
  chapters: ParsedChapter[];
  loadedAt: number;
}

export interface RejectedLogEntry {
  filePath: string;
  name: string;
  reason: string;
}

export interface AddLogsResult {
  addedEntries: LogEntry[];
  rejectedEntries: RejectedLogEntry[];
}

const STORAGE_KEYS = {
  logs: "reader.logs",
  activeLogId: "reader.activeLogId",
  readingPositions: "reader.readingPositions",
  layout: "reader.layout",
  fontSize: "reader.fontSize",
  lineHeight: "reader.lineHeight",
} as const;

const DEFAULT_LAYOUT: PanelLayout = {
  leftWidth: 260,
  middleWidth: 280,
  outputWidth: 170,
};

const DEFAULT_FONT_SIZE = 11;
const MIN_FONT_SIZE = 9;
const MAX_FONT_SIZE = 20;
const DEFAULT_LINE_HEIGHT = 1.3;
const MIN_LINE_HEIGHT = 1.0;
const MAX_LINE_HEIGHT = 2.2;

const CACHE_LIMIT = 2;

const HEADING_PATTERNS = [
  /^\s*第[\d零一二三四五六七八九十百千万两〇]+[章节回卷篇部集节][^\n]{0,40}$/u,
  /^\s*(chapter|chap\.?)\s*\d+[^\n]{0,40}$/iu,
  /^\s*(序章|序言|楔子|前言|引子|后记|终章|尾声|番外|附录)[^\n]{0,30}$/u,
] as const;

const BOM_ENCODINGS: Array<{ bytes: number[]; encoding: string }> = [
  { bytes: [0xff, 0xfe], encoding: "utf16le" },
  { bytes: [0xfe, 0xff], encoding: "utf16be" },
  { bytes: [0xef, 0xbb, 0xbf], encoding: "utf8" },
];

export class LogLibrary {
  private readonly cache = new Map<string, ParsedLog>();
  private readonly readingPositions = new Map<string, ReadingPosition>();
  private logs: LogEntry[] = [];
  private activeLogId?: string;
  private hasSavedLayout = false;
  private layout: PanelLayout = DEFAULT_LAYOUT;
  private fontSize = DEFAULT_FONT_SIZE;
  private lineHeight = DEFAULT_LINE_HEIGHT;

  public constructor(private readonly context: vscode.ExtensionContext) {
    this.logs = this.context.globalState.get<LogEntry[]>(STORAGE_KEYS.logs, []);
    this.activeLogId = this.context.globalState.get<string | undefined>(
      STORAGE_KEYS.activeLogId,
      undefined,
    );
    const savedLayout = this.context.globalState.get<Partial<PanelLayout> | undefined>(
      STORAGE_KEYS.layout,
      undefined,
    );
    this.hasSavedLayout = savedLayout !== undefined;
    this.layout = {
      ...DEFAULT_LAYOUT,
      ...savedLayout,
    };
    this.fontSize = this.context.globalState.get<number>(
      STORAGE_KEYS.fontSize,
      DEFAULT_FONT_SIZE,
    );
    this.lineHeight = this.context.globalState.get<number>(
      STORAGE_KEYS.lineHeight,
      DEFAULT_LINE_HEIGHT,
    );

    const savedPositions = this.context.globalState.get<
      Record<string, ReadingPosition>
    >(STORAGE_KEYS.readingPositions, {});

    for (const [logId, position] of Object.entries(savedPositions)) {
      this.readingPositions.set(logId, position);
    }
  }

  public async initialize(): Promise<void> {
    const verifiedLogs: LogEntry[] = [];

    for (const log of this.logs) {
      try {
        await fs.access(log.filePath);
        verifiedLogs.push(log);
      } catch {
        this.readingPositions.delete(log.id);
        this.cache.delete(log.id);
      }
    }

    this.logs = verifiedLogs;

    if (this.activeLogId && !this.logs.some((log) => log.id === this.activeLogId)) {
      this.activeLogId = this.logs[0]?.id;
    }

    await this.persist();
  }

  public getLogs(): LogEntry[] {
    return [...this.logs].sort((left, right) => right.addedAt - left.addedAt);
  }

  public hasLogs(): boolean {
    return this.logs.length > 0;
  }

  public async addLogs(fileUris: readonly vscode.Uri[]): Promise<AddLogsResult> {
    const addedEntries: LogEntry[] = [];
    const rejectedEntries: RejectedLogEntry[] = [];

    for (const uri of fileUris) {
      const fileName = path.basename(uri.fsPath, ".txt");

      if (path.extname(uri.fsPath).toLowerCase() !== ".txt") {
        rejectedEntries.push({
          filePath: uri.fsPath,
          name: fileName || path.basename(uri.fsPath),
          reason: "仅支持添加 TXT 格式文件。",
        });
        continue;
      }

      if (this.logs.some((log) => log.filePath === uri.fsPath)) {
        rejectedEntries.push({
          filePath: uri.fsPath,
          name: fileName,
          reason: "该日志已存在，无需重复添加。",
        });
        continue;
      }

      try {
        const text = await this.readTextFile(uri.fsPath);
        const chapters = this.parseChapters(text);

        if (chapters.length <= 2) {
          const reason = `解析失败：识别到的章节数为 ${chapters.length}，需大于 2 章。`;
          console.error(`[reader] ${fileName}: ${reason}`);
          rejectedEntries.push({
            filePath: uri.fsPath,
            name: fileName,
            reason,
          });
          continue;
        }
      } catch (error) {
        const reason =
          error instanceof Error
            ? `解析失败：${error.message}`
            : "解析失败：无法读取或解析该文件。";
        console.error(`[reader] ${fileName}: ${reason}`);
        rejectedEntries.push({
          filePath: uri.fsPath,
          name: fileName,
          reason,
        });
        continue;
      }

      const entry: LogEntry = {
        id: crypto.randomUUID(),
        filePath: uri.fsPath,
        name: fileName,
        addedAt: Date.now(),
      };

      this.logs.push(entry);
      addedEntries.push(entry);
    }

    if (!this.activeLogId && addedEntries[0]) {
      this.activeLogId = addedEntries[0].id;
    }

    await this.persist();
    return {
      addedEntries,
      rejectedEntries,
    };
  }

  public async removeLog(logId: string): Promise<void> {
    this.logs = this.logs.filter((log) => log.id !== logId);
    this.cache.delete(logId);
    this.readingPositions.delete(logId);

    if (this.activeLogId === logId) {
      this.activeLogId = this.logs[0]?.id;
    }

    await this.persist();
  }

  public async buildPanelState(): Promise<PanelState> {
    const activeLog = this.logs.find((log) => log.id === this.activeLogId);

    if (!activeLog) {
      return {
        logs: this.getLogs(),
        activeChapterIndex: -1,
        chapters: [],
        content: "",
        layout: this.layout,
        hasSavedLayout: this.hasSavedLayout,
        fontSize: this.fontSize,
        lineHeight: this.lineHeight,
      };
    }

    const parsedLog = await this.loadParsedLog(activeLog.id);
    const savedPosition = this.readingPositions.get(activeLog.id);
    const chapterIndex = this.clampChapterIndex(
      parsedLog.chapters,
      savedPosition?.chapterIndex ?? 0,
    );

    return {
      logs: this.getLogs(),
      activeLogId: activeLog.id,
      activeLogName: activeLog.name,
      chapters: parsedLog.chapters.map<ChapterSummary>((chapter) => ({
        id: chapter.id,
        index: chapter.index,
        title: chapter.title,
      })),
      activeChapterIndex: chapterIndex,
      content: this.getChapterContent(parsedLog, chapterIndex),
      readingPosition: savedPosition ?? {
        chapterIndex,
        scrollRatio: 0,
        updatedAt: Date.now(),
      },
      layout: this.layout,
      hasSavedLayout: this.hasSavedLayout,
      fontSize: this.fontSize,
      lineHeight: this.lineHeight,
    };
  }

  public async openLog(logId: string): Promise<PanelState> {
    this.activeLogId = logId;
    await this.persist();
    return this.buildPanelState();
  }

  public async openChapter(
    chapterIndex: number,
  ): Promise<{
    activeChapterIndex: number;
    content: string;
    readingPosition: ReadingPosition;
  }> {
    const parsedLog = await this.requireActiveLog();
    const nextChapterIndex = this.clampChapterIndex(parsedLog.chapters, chapterIndex);

    const readingPosition: ReadingPosition = {
      chapterIndex: nextChapterIndex,
      scrollRatio: 0,
      updatedAt: Date.now(),
    };

    this.readingPositions.set(parsedLog.log.id, readingPosition);
    await this.persistReadingPositions();

    return {
      activeChapterIndex: nextChapterIndex,
      content: this.getChapterContent(parsedLog, nextChapterIndex),
      readingPosition,
    };
  }

  public async saveReadingPosition(
    chapterIndex: number,
    scrollRatio: number,
  ): Promise<void> {
    const parsedLog = await this.requireActiveLog();
    const nextChapterIndex = this.clampChapterIndex(parsedLog.chapters, chapterIndex);
    const safeScrollRatio = Number.isFinite(scrollRatio)
      ? Math.min(Math.max(scrollRatio, 0), 1)
      : 0;

    this.readingPositions.set(parsedLog.log.id, {
      chapterIndex: nextChapterIndex,
      scrollRatio: safeScrollRatio,
      updatedAt: Date.now(),
    });

    await this.persistReadingPositions();
  }

  public async saveLayout(layout: PanelLayout): Promise<void> {
    const leftWidth = Math.max(50, Math.round(layout.leftWidth));
    const middleWidth = Math.max(50, Math.round(layout.middleWidth));
    const outputWidth = Math.max(50, Math.round(layout.outputWidth));
    this.hasSavedLayout = true;
    this.layout = { leftWidth, middleWidth, outputWidth };
    await this.context.globalState.update(STORAGE_KEYS.layout, this.layout);
  }

  public async saveFontSize(fontSize: number): Promise<number> {
    const safeFontSize = Math.min(
      Math.max(Math.round(fontSize), MIN_FONT_SIZE),
      MAX_FONT_SIZE,
    );
    this.fontSize = safeFontSize;
    await this.context.globalState.update(STORAGE_KEYS.fontSize, this.fontSize);
    return this.fontSize;
  }

  public async saveLineHeight(lineHeight: number): Promise<number> {
    const safeLineHeight = Math.min(
      Math.max(Math.round(lineHeight * 10) / 10, MIN_LINE_HEIGHT),
      MAX_LINE_HEIGHT,
    );
    this.lineHeight = safeLineHeight;
    await this.context.globalState.update(
      STORAGE_KEYS.lineHeight,
      this.lineHeight,
    );
    return this.lineHeight;
  }

  private async requireActiveLog(): Promise<ParsedLog> {
    const activeLogId = this.activeLogId ?? this.logs[0]?.id;

    if (!activeLogId) {
      throw new Error("当前没有可打开的日志。");
    }

    this.activeLogId = activeLogId;
    return this.loadParsedLog(activeLogId);
  }

  private async loadParsedLog(logId: string): Promise<ParsedLog> {
    const cached = this.cache.get(logId);

    if (cached) {
      cached.loadedAt = Date.now();
      this.retouchCache(logId, cached);
      return cached;
    }

    const log = this.logs.find((entry) => entry.id === logId);

    if (!log) {
      throw new Error("日志不存在或已被移除。");
    }

    const text = await this.readTextFile(log.filePath);
    const chapters = this.parseChapters(text);
    const parsedLog: ParsedLog = {
      log,
      text,
      chapters,
      loadedAt: Date.now(),
    };

    this.retouchCache(logId, parsedLog);
    this.trimCache();
    return parsedLog;
  }

  private async readTextFile(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    const encoding = this.detectEncoding(fileBuffer);
    let text = iconv.decode(fileBuffer, encoding);

    text = text.replace(/^\uFEFF/, "");
    text = text.replace(/\r\n?/g, "\n");

    return text;
  }

  private detectEncoding(fileBuffer: Buffer): string {
    for (const candidate of BOM_ENCODINGS) {
      const matched = candidate.bytes.every(
        (byte, index) => fileBuffer[index] === byte,
      );

      if (matched) {
        return candidate.encoding;
      }
    }

    const detected = detect(fileBuffer);

    if (detected) {
      const normalized = detected.toLowerCase().replace(/[_-]/g, "");

      if (normalized.includes("utf8")) {
        return "utf8";
      }

      if (normalized.includes("utf16le")) {
        return "utf16le";
      }

      if (normalized.includes("utf16be")) {
        return "utf16be";
      }

      if (normalized.includes("gb") || normalized.includes("cp936")) {
        return "gb18030";
      }

      if (iconv.encodingExists(detected)) {
        return detected;
      }
    }

    return "utf8";
  }

  private parseChapters(text: string): ParsedChapter[] {
    if (!text.trim()) {
      return [
        {
          id: "1",
          index: 0,
          title: "空白日志",
          start: 0,
          end: 0,
        },
      ];
    }

    const markers: Array<{ title: string; start: number }> = [];
    const lines = text.split("\n");
    let offset = 0;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      const isHeading =
        line.length > 0 &&
        line.length <= 60 &&
        HEADING_PATTERNS.some((pattern) => pattern.test(line));

      if (isHeading) {
        markers.push({
          title: line,
          start: offset,
        });
      }

      offset += rawLine.length + 1;
    }

    if (markers.length === 0) {
      return [
        {
          id: "1",
          index: 0,
          title: "全文",
          start: 0,
          end: text.length,
        },
      ];
    }

    const chapters: ParsedChapter[] = [];

    if (markers[0].start > 0 && text.slice(0, markers[0].start).trim()) {
      chapters.push({
        id: "1",
        index: 0,
        title: "开篇",
        start: 0,
        end: markers[0].start,
      });
    }

    for (let index = 0; index < markers.length; index += 1) {
      const marker = markers[index];
      const nextMarker = markers[index + 1];
      const chapterIndex = chapters.length;

      chapters.push({
        id: String(chapterIndex + 1),
        index: chapterIndex,
        title: marker.title,
        start: marker.start,
        end: nextMarker?.start ?? text.length,
      });
    }

    return chapters;
  }

  private getChapterContent(parsedLog: ParsedLog, chapterIndex: number): string {
    if (chapterIndex < 0) {
      return "";
    }

    const chapter = parsedLog.chapters[chapterIndex];

    if (!chapter) {
      return "";
    }

    return parsedLog.text.slice(chapter.start, chapter.end).trim();
  }

  private clampChapterIndex(
    chapters: readonly ParsedChapter[],
    chapterIndex: number,
  ): number {
    if (chapters.length === 0) {
      return -1;
    }

    if (!Number.isFinite(chapterIndex)) {
      return 0;
    }

    return Math.min(Math.max(Math.trunc(chapterIndex), 0), chapters.length - 1);
  }

  private retouchCache(logId: string, parsedLog: ParsedLog): void {
    this.cache.delete(logId);
    this.cache.set(logId, parsedLog);
  }

  private trimCache(): void {
    while (this.cache.size > CACHE_LIMIT) {
      const oldestEntry = [...this.cache.entries()].sort(
        (left, right) => left[1].loadedAt - right[1].loadedAt,
      )[0];

      if (!oldestEntry) {
        return;
      }

      this.cache.delete(oldestEntry[0]);
    }
  }

  private async persist(): Promise<void> {
    await Promise.all([
      this.context.globalState.update(STORAGE_KEYS.logs, this.logs),
      this.context.globalState.update(STORAGE_KEYS.activeLogId, this.activeLogId),
      this.persistReadingPositions(),
    ]);
  }

  private async persistReadingPositions(): Promise<void> {
    const serialized = Object.fromEntries(this.readingPositions.entries());
    await this.context.globalState.update(
      STORAGE_KEYS.readingPositions,
      serialized,
    );
  }
}
