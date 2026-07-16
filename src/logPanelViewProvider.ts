import * as vscode from "vscode";

import { LogLibrary } from "./logLibrary";
import { LocalizedStrings } from "./localization";
import { PanelLayout } from "./types";

type WebviewMessage =
  | { type: "ready" }
  | { type: "addLogs" }
  | { type: "openLog"; logId: string }
  | { type: "openChapter"; chapterIndex: number }
  | { type: "deleteLog"; logId: string }
  | { type: "saveReadingPosition"; chapterIndex: number; scrollRatio: number }
  | { type: "saveLayout"; layout: PanelLayout }
  | { type: "saveFontSize"; fontSize: number }
  | { type: "saveLineHeight"; lineHeight: number };

export class LogPanelViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "readerStar.logView";
  public static readonly panelContainerId = "readerStarPanel";

  private view?: vscode.WebviewView;

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logLibrary: LogLibrary,
    private readonly strings: LocalizedStrings,
  ) {}

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
  ): Promise<void> {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);
    webviewView.onDidDispose(() => {
      this.view = undefined;
    });

    webviewView.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      await this.handleMessage(message);
    });

    await this.refresh();
  }

  public async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }

    const state = await this.logLibrary.buildPanelState();
    await this.postMessage({
      type: "hydrate",
      state,
    });
  }

  public async reveal(): Promise<void> {
    await vscode.commands.executeCommand("workbench.action.focusPanel");

    try {
      await vscode.commands.executeCommand(
        `workbench.view.extension.${LogPanelViewProvider.panelContainerId}`,
      );
    } catch {
      try {
        await vscode.commands.executeCommand(
          `${LogPanelViewProvider.viewId}.focus`,
        );
      } catch {
        // Keeping a quiet fallback here avoids blocking the feature on
        // internal command id differences across VS Code builds.
      }
    }
  }

  public async promptAddLogs(): Promise<void> {
    const selectedUris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      filters: {
        [this.strings.textFiles]: ["txt"],
      },
      openLabel: this.strings.addLogs,
      title: this.strings.selectTxtLogs,
    });

    if (!selectedUris || selectedUris.length === 0) {
      return;
    }

    await this.withProgress(this.strings.importingLogs, async () => {
      const result = await this.logLibrary.addLogs(selectedUris);

      if (result.addedEntries[0]) {
        await this.logLibrary.openLog(result.addedEntries[0].id);
      }

      if (result.rejectedEntries.length > 0) {
        const rejectedSummary = result.rejectedEntries
          .map((entry) => `${entry.name}: ${entry.reason}`)
          .join("\n");
        console.error(
          `[reader-star] ${this.strings.addLogsFailedConsole}:\n${rejectedSummary}`,
        );
        void vscode.window.showErrorMessage(
          this.strings.rejectedLogs(result.rejectedEntries.length),
        );
      }
    });

    await this.refresh();
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case "ready":
        await this.refresh();
        return;
      case "addLogs":
        await this.promptAddLogs();
        return;
      case "openLog":
        await this.withProgress(this.strings.openingLog, async () => {
          await this.logLibrary.openLog(message.logId);
        });
        await this.refresh();
        return;
      case "openChapter": {
        const payload = await this.logLibrary.openChapter(message.chapterIndex);
        await this.postMessage({
          type: "chapterContent",
          payload,
        });
        return;
      }
      case "deleteLog":
        await this.confirmAndDeleteLog(message.logId);
        return;
      case "saveReadingPosition":
        await this.logLibrary.saveReadingPosition(
          message.chapterIndex,
          message.scrollRatio,
        );
        return;
      case "saveLayout":
        await this.logLibrary.saveLayout(message.layout);
        return;
      case "saveFontSize": {
        const fontSize = await this.logLibrary.saveFontSize(message.fontSize);
        await this.postMessage({
          type: "fontSizeSaved",
          fontSize,
        });
        return;
      }
      case "saveLineHeight": {
        const lineHeight = await this.logLibrary.saveLineHeight(
          message.lineHeight,
        );
        await this.postMessage({
          type: "lineHeightSaved",
          lineHeight,
        });
        return;
      }
    }
  }

  private async confirmAndDeleteLog(logId: string): Promise<void> {
    const state = await this.logLibrary.buildPanelState();
    const targetLog = state.logs.find((log) => log.id === logId);

    if (!targetLog) {
      return;
    }

    const confirmed = await vscode.window.showWarningMessage(
      this.strings.deleteLogConfirmation(targetLog.name),
      { modal: true },
      this.strings.delete,
    );

    if (confirmed !== this.strings.delete) {
      return;
    }

    await this.logLibrary.removeLog(logId);
    await this.refresh();
  }

  private async withProgress<T>(
    message: string,
    task: () => Promise<T>,
  ): Promise<T> {
    await this.postMessage({
      type: "busy",
      busy: true,
      message,
    });

    try {
      return await task();
    } finally {
      await this.postMessage({
        type: "busy",
        busy: false,
        message: "",
      });
    }
  }

  private async postMessage(message: unknown): Promise<void> {
    await this.view?.webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "logPanel.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "logPanel.css"),
    );
    const nonce = String(Date.now());
    const webviewStrings = JSON.stringify(this.strings.webview).replaceAll(
      "<",
      "\\u003c",
    );
    const text = this.strings.webview;

    return `<!DOCTYPE html>
<html lang="${this.strings.htmlLanguage}">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>${text.panelTitle}</title>
</head>
<body>
  <div id="app" class="app">
    <div id="busyOverlay" class="busy-overlay hidden">
      <div class="busy-card">
        <div class="busy-spinner"></div>
        <div id="busyText">${text.processing}</div>
      </div>
    </div>
    <div id="paneContainer" class="pane-container">
      <section id="leftPane" class="pane pane-left">
        <header class="pane-header">
          <button id="addLogButton" class="primary-button">${text.addLog}</button>
          <div id="adBanner" class="notice-text notice-text-inline"></div>
        </header>
        <div id="logList" class="list-container"></div>
      </section>
      <div id="leftDivider" class="pane-divider" data-divider="left"></div>
      <section id="middlePane" class="pane pane-middle">
        <header class="pane-header">
          <input
            id="chapterSearchInput"
            class="text-input"
            type="text"
            placeholder="${text.chapterSearchPlaceholder}"
          />
        </header>
        <div id="chapterList" class="list-container"></div>
      </section>
      <div id="chapterDivider" class="pane-divider" data-divider="chapter"></div>
      <section id="outputPane" class="pane pane-output">
        <header class="pane-header pane-header-tools">
          <div class="output-title">${text.runtimeLogs}</div>
          <div class="font-size-tools">
            <button id="fontSizeDownButton" class="tool-button" title="${text.decreaseFontSize}">A-</button>
            <span id="fontSizeValue" class="font-size-value">11</span>
            <button id="fontSizeUpButton" class="tool-button" title="${text.increaseFontSize}">A+</button>
          </div>
          <div class="line-height-tools">
            <button id="lineHeightDownButton" class="tool-button" title="${text.decreaseLineHeight}">${text.decreaseLineHeightLabel}</button>
            <span id="lineHeightValue" class="font-size-value">1.3</span>
            <button id="lineHeightUpButton" class="tool-button" title="${text.increaseLineHeight}">${text.increaseLineHeightLabel}</button>
          </div>
        </header>
        <article id="outputBody" class="output-body"></article>
      </section>
      <div id="outputDivider" class="pane-divider" data-divider="output"></div>
      <section id="rightPane" class="pane pane-right">
        <header class="pane-header pane-header-readable">
          <button id="previousChapterButton" class="secondary-button">${text.previousChapter}</button>
          <div id="contentTitle" class="content-title">${text.logContent}</div>
          <button id="nextChapterButton" class="secondary-button">${text.nextChapter}</button>
        </header>
        <article id="contentBody" class="content-body"></article>
      </section>
    </div>
  </div>
  <script nonce="${nonce}">window.readerStarI18n = ${webviewStrings};</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
