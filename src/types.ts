export interface LogEntry {
  id: string;
  filePath: string;
  name: string;
  addedAt: number;
}

export interface ChapterSummary {
  id: string;
  index: number;
  title: string;
}

export interface ReadingPosition {
  chapterIndex: number;
  scrollRatio: number;
  updatedAt: number;
}

export interface PanelLayout {
  leftWidth: number;
  middleWidth: number;
  outputWidth: number;
}

export interface PanelState {
  logs: LogEntry[];
  activeLogId?: string;
  activeLogName?: string;
  chapters: ChapterSummary[];
  activeChapterIndex: number;
  content: string;
  readingPosition?: ReadingPosition;
  layout: PanelLayout;
  fontSize: number;
  lineHeight: number;
}
