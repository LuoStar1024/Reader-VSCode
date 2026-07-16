import * as vscode from "vscode";

import { LogLibrary } from "./logLibrary";
import { LogPanelViewProvider } from "./logPanelViewProvider";
import { getLocalizedStrings } from "./localization";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const strings = getLocalizedStrings(vscode.env.language);
  const logLibrary = new LogLibrary(context, strings);
  await logLibrary.initialize();

  const logPanelViewProvider = new LogPanelViewProvider(
    context,
    logLibrary,
    strings,
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      LogPanelViewProvider.viewId,
      logPanelViewProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("reader-star.openLogPanel", async () => {
      await logPanelViewProvider.reveal();

      if (!logLibrary.hasLogs()) {
        await logPanelViewProvider.promptAddLogs();
      } else {
        await logPanelViewProvider.refresh();
      }
    }),
    vscode.commands.registerCommand("reader-star.addLogs", async () => {
      await logPanelViewProvider.reveal();
      await logPanelViewProvider.promptAddLogs();
    }),
  );
}

export function deactivate(): void {}
