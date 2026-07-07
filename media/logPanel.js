(function () {
  const vscode = acquireVsCodeApi();

  const MIN_LEFT = 50;
  const MIN_MIDDLE = 50;
  const MIN_OUTPUT = 50;
  const MIN_RIGHT = 320;
  const LEFT_DIVIDER_WIDTH = 6;
  const CHAPTER_DIVIDER_WIDTH = 6;
  const OUTPUT_DIVIDER_WIDTH = 1;
  const AD_ROTATION_MS = 60000;
  const AD_MESSAGES = [
    "中转站：api.luostar.net",
    "中转站：apicf.luostar.net",
  ];
  const MIN_FONT_SIZE = 9;
  const MAX_FONT_SIZE = 20;
  const MIN_LINE_HEIGHT = 1.0;
  const MAX_LINE_HEIGHT = 2.2;
  const LOG_START_OFFSET_MS = 60 * 60 * 1000;
  const LOG_LEVELS = ["Info", "Warn", "Error", "Debug"];
  const LOG_ACTIONS = [
    "reader.boot",
    "chapter.match",
    "panel.sync",
    "stream.flush",
    "cursor.update",
    "offset.commit",
    "session.trace",
  ];
  const LOG_MODULES = [
    "ReaderGateway",
    "BookIndexWorker",
    "ChapterCursor",
    "PanelSyncBridge",
    "TraceCollector",
    "RuntimeDispatch",
  ];
  const LOG_THREADS = [
    "T#07",
    "T#11",
    "T#13",
    "T#21",
    "T#34",
    "T#55",
  ];

  const elements = {
    paneContainer: document.getElementById("paneContainer"),
    leftDivider: document.getElementById("leftDivider"),
    chapterDivider: document.getElementById("chapterDivider"),
    outputDivider: document.getElementById("outputDivider"),
    addLogButton: document.getElementById("addLogButton"),
    adBanner: document.getElementById("adBanner"),
    logList: document.getElementById("logList"),
    chapterSearchInput: document.getElementById("chapterSearchInput"),
    chapterList: document.getElementById("chapterList"),
    outputBody: document.getElementById("outputBody"),
    fontSizeDownButton: document.getElementById("fontSizeDownButton"),
    fontSizeUpButton: document.getElementById("fontSizeUpButton"),
    fontSizeValue: document.getElementById("fontSizeValue"),
    lineHeightDownButton: document.getElementById("lineHeightDownButton"),
    lineHeightUpButton: document.getElementById("lineHeightUpButton"),
    lineHeightValue: document.getElementById("lineHeightValue"),
    contentTitle: document.getElementById("contentTitle"),
    contentBody: document.getElementById("contentBody"),
    previousChapterButton: document.getElementById("previousChapterButton"),
    nextChapterButton: document.getElementById("nextChapterButton"),
    busyOverlay: document.getElementById("busyOverlay"),
    busyText: document.getElementById("busyText"),
  };

  const state = {
    panel: {
      logs: [],
      chapters: [],
      activeLogId: undefined,
      activeLogName: undefined,
      activeChapterIndex: -1,
      content: "",
      readingPosition: undefined,
      layout: {
        leftWidth: 260,
        middleWidth: 280,
        outputWidth: 170,
      },
      fontSize: 11,
      lineHeight: 1.3,
    },
    renderedContentLines: [],
    simulatedOutputLines: [],
    activeChapterLabel: "",
    adIndex: 0,
    adTimer: undefined,
    searchHitIndex: -1,
    suppressScrollEvent: false,
    linkedScrollLock: false,
    saveScrollTimer: undefined,
    saveLayoutTimer: undefined,
  };

  function postMessage(message) {
    vscode.postMessage(message);
  }

  function debounce(key, callback, delay) {
    clearTimeout(state[key]);
    state[key] = window.setTimeout(callback, delay);
  }

  function getClosestTarget(event, selector) {
    return event.target instanceof Element
      ? event.target.closest(selector)
      : null;
  }

  function updateBusy(busy, message) {
    elements.busyOverlay.classList.toggle("hidden", !busy);
    elements.busyText.textContent = message || "正在处理...";
  }

  function getTotalDividerWidth() {
    return LEFT_DIVIDER_WIDTH + CHAPTER_DIVIDER_WIDTH + OUTPUT_DIVIDER_WIDTH;
  }

  function applyLayout(layout) {
    const containerWidth = elements.paneContainer.clientWidth || 0;
    let leftWidth = Math.max(MIN_LEFT, Math.round(layout.leftWidth || 260));
    let middleWidth = Math.max(MIN_MIDDLE, Math.round(layout.middleWidth || 280));
    let outputWidth = Math.max(MIN_OUTPUT, Math.round(layout.outputWidth || 170));

    if (containerWidth > 0) {
      const maxUsable =
        containerWidth - MIN_RIGHT - getTotalDividerWidth();
      let totalFixed = leftWidth + middleWidth + outputWidth;

      if (totalFixed > maxUsable) {
        let overflow = totalFixed - maxUsable;

        const outputShrink = Math.min(overflow, outputWidth - MIN_OUTPUT);
        outputWidth -= outputShrink;
        overflow -= outputShrink;

        if (overflow > 0) {
          const middleShrink = Math.min(overflow, middleWidth - MIN_MIDDLE);
          middleWidth -= middleShrink;
          overflow -= middleShrink;
        }

        if (overflow > 0) {
          leftWidth = Math.max(MIN_LEFT, leftWidth - overflow);
        }
      }
    }

    state.panel.layout.leftWidth = leftWidth;
    state.panel.layout.middleWidth = middleWidth;
    state.panel.layout.outputWidth = outputWidth;
    elements.paneContainer.style.gridTemplateColumns =
      `${leftWidth}px ${LEFT_DIVIDER_WIDTH}px ${middleWidth}px ${CHAPTER_DIVIDER_WIDTH}px ${outputWidth}px ${OUTPUT_DIVIDER_WIDTH}px minmax(${MIN_RIGHT}px, 1fr)`;
  }

  function saveLayout() {
    debounce("saveLayoutTimer", () => {
      postMessage({
        type: "saveLayout",
        layout: state.panel.layout,
      });
    }, 180);
  }

  function formatLogPath(filePath) {
    const parts = filePath.split(/[/\\]/);
    return parts.slice(-2).join(" / ");
  }

  function applyFontSize(fontSize) {
    const safeFontSize = Math.min(Math.max(Number(fontSize) || 11, MIN_FONT_SIZE), MAX_FONT_SIZE);
    state.panel.fontSize = safeFontSize;
    document.documentElement.style.setProperty("--reader-font-size", `${safeFontSize}px`);
    if (elements.fontSizeValue) {
      elements.fontSizeValue.textContent = `${safeFontSize}`;
    }
    if (elements.fontSizeDownButton) {
      elements.fontSizeDownButton.disabled = safeFontSize <= MIN_FONT_SIZE;
    }
    if (elements.fontSizeUpButton) {
      elements.fontSizeUpButton.disabled = safeFontSize >= MAX_FONT_SIZE;
    }
  }

  function applyLineHeight(lineHeight) {
    const safeLineHeight =
      Math.min(Math.max(Math.round((Number(lineHeight) || 1.3) * 10) / 10, MIN_LINE_HEIGHT), MAX_LINE_HEIGHT);
    state.panel.lineHeight = safeLineHeight;
    document.documentElement.style.setProperty("--reader-line-height", `${safeLineHeight}`);
    if (elements.lineHeightValue) {
      elements.lineHeightValue.textContent = `${safeLineHeight.toFixed(1)}`;
    }
    if (elements.lineHeightDownButton) {
      elements.lineHeightDownButton.disabled = safeLineHeight <= MIN_LINE_HEIGHT;
    }
    if (elements.lineHeightUpButton) {
      elements.lineHeightUpButton.disabled = safeLineHeight >= MAX_LINE_HEIGHT;
    }
  }

  function escapeHtml(value) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderAdBanner() {
    if (!elements.adBanner) {
      return;
    }

    const message = AD_MESSAGES[state.adIndex] || "";
    elements.adBanner.textContent = message;
  }

  function startAdRotation() {
    clearInterval(state.adTimer);
    renderAdBanner();

    if (AD_MESSAGES.length <= 1) {
      return;
    }

    state.adTimer = window.setInterval(() => {
      state.adIndex = (state.adIndex + 1) % AD_MESSAGES.length;
      renderAdBanner();
    }, AD_ROTATION_MS);
  }

  function renderLogs() {
    if (!state.panel.logs.length) {
      elements.logList.innerHTML =
        '<div class="list-empty">还没有日志。点击上方“新增日志”添加 TXT 文件后，就可以开始阅读。</div>';
      return;
    }

    const markup = state.panel.logs
      .map((log) => {
        const isActive = log.id === state.panel.activeLogId;
        return `
          <button class="list-item ${isActive ? "active" : ""}" data-log-id="${log.id}" title="${log.filePath}">
            <div class="list-meta">
              <div class="list-title">${escapeHtml(log.name)}</div>
              <div class="list-subtitle">${escapeHtml(formatLogPath(log.filePath))}</div>
            </div>
          </button>
        `;
      })
      .join("");

    elements.logList.innerHTML = markup;
  }

  function scrollChapterIntoView(chapterIndex, smooth) {
    if (chapterIndex < 0) {
      return;
    }

    const target = elements.chapterList.querySelector(
      `[data-chapter-index="${chapterIndex}"]`,
    );

    target?.scrollIntoView({
      block: "nearest",
      behavior: smooth ? "smooth" : "auto",
    });
  }

  function renderChapters() {
    if (!state.panel.chapters.length) {
      elements.chapterList.innerHTML =
        '<div class="list-empty">打开日志后，这里会显示章节目录。</div>';
      return;
    }

    const markup = state.panel.chapters
      .map((chapter) => {
        const isActive = chapter.index === state.panel.activeChapterIndex;
        const isSearchHit = chapter.index === state.searchHitIndex;
        return `
          <button
            class="list-item ${isActive ? "active" : ""} ${isSearchHit ? "search-hit" : ""}"
            data-chapter-index="${chapter.index}"
            title="${escapeHtml(chapter.title)}"
          >
            <div class="item-index">#${chapter.index + 1}</div>
            <div class="list-meta">
              <div class="list-title">${escapeHtml(chapter.title)}</div>
            </div>
          </button>
        `;
      })
      .join("");

    elements.chapterList.innerHTML = markup;
    scrollChapterIntoView(state.panel.activeChapterIndex, false);
  }

  function getContentLines(content) {
    const normalized = content.replace(/\r\n?/g, "\n").trim();

    if (!normalized) {
      return [];
    }

    return normalized
      .split(/\n\s*\n/g)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
  }

  function padNumber(value, length) {
    return String(value).padStart(length, "0");
  }

  function formatTimestamp(date) {
    return `${date.getFullYear()}-${padNumber(date.getMonth() + 1, 2)}-${padNumber(date.getDate(), 2)} ${padNumber(date.getHours(), 2)}:${padNumber(date.getMinutes(), 2)}:${padNumber(date.getSeconds(), 2)}`;
  }

  function buildLogEntry(timestampMs, sequence, chapterLabel) {
    const level = LOG_LEVELS[sequence % LOG_LEVELS.length];
    const action = LOG_ACTIONS[sequence % LOG_ACTIONS.length];
    const moduleName = LOG_MODULES[sequence % LOG_MODULES.length];
    const threadName = LOG_THREADS[sequence % LOG_THREADS.length];
    const seqText = padNumber(sequence + 1, 4);
    const timestamp = formatTimestamp(new Date(timestampMs));

    return {
      timestamp,
      level: `Log.${level}`,
      levelClass: level.toLowerCase(),
      message:
        `module=${moduleName} thread=${threadName} action=${action} seq=${seqText} chapter="${chapterLabel || "未打开章节"}" result=accepted latency=${12 + (sequence % 17)}ms checksum=0x${padNumber((sequence * 37) % 65535, 4)} frame=dispatch.pipeline.runtime`,
    };
  }

  function seedOutputLines(chapterLabel, lineCount) {
    const safeLineCount = Math.max(lineCount, 24);
    const startTimeMs = Date.now() - LOG_START_OFFSET_MS;

    state.activeChapterLabel = chapterLabel || "未打开章节";
    state.simulatedOutputLines = Array.from({ length: safeLineCount }, (_, index) =>
      buildLogEntry(startTimeMs + index * 1000, index, state.activeChapterLabel),
    );
  }

  function renderOutput() {
    if (state.simulatedOutputLines.length === 0) {
      elements.outputBody.innerHTML =
        '<div class="output-placeholder">等待模拟日志输出...</div>';
      return;
    }

    const previousScrollRatio = getScrollRatio(elements.outputBody);

    const markup = state.simulatedOutputLines
      .map((line) => {
        return `
          <div class="output-line">
            <span class="output-time">${escapeHtml(line.timestamp)}</span>
            <span class="output-level output-level-${line.levelClass}">${escapeHtml(line.level)}</span>
            <span class="output-message">${escapeHtml(line.message)}</span>
          </div>
        `;
      })
      .join("");

    elements.outputBody.innerHTML = markup;
    setElementScrollByRatio(elements.outputBody, previousScrollRatio);
  }

  function renderContent() {
    const activeChapter = state.panel.chapters.find(
      (chapter) => chapter.index === state.panel.activeChapterIndex,
    );
    const title = activeChapter ? `#${activeChapter.index + 1}` : "#";

    elements.contentTitle.textContent = title;
    updateChapterButtons();

    if (!state.panel.content) {
      state.renderedContentLines = [];
      state.simulatedOutputLines = [];
      state.activeChapterLabel = "";
      elements.contentBody.innerHTML =
        '<div class="content-placeholder">选择左侧日志与中间章节后，正文会显示在这里。</div>';
      renderOutput();
      return;
    }

    state.renderedContentLines = getContentLines(state.panel.content);
    seedOutputLines(title, state.renderedContentLines.length);
    elements.contentBody.innerHTML = renderContentLines(state.renderedContentLines);
    renderOutput();

    const scrollRatio = state.panel.readingPosition?.scrollRatio || 0;
    state.suppressScrollEvent = true;
    window.requestAnimationFrame(() => {
      setLinkedScrollRatio(scrollRatio);
      window.setTimeout(() => {
        state.suppressScrollEvent = false;
      }, 0);
    });
  }

  function renderContentLines(lines) {
    return lines
      .map((line) => {
        if (!line) {
          return '<div class="content-line content-line-empty">&nbsp;</div>';
        }

        return `<div class="content-line">${escapeHtml(line)}</div>`;
      })
      .join("");
  }

  function renderAll() {
    applyLayout(state.panel.layout);
    applyFontSize(state.panel.fontSize);
    applyLineHeight(state.panel.lineHeight);
    renderAdBanner();
    renderLogs();
    renderChapters();
    renderContent();
    vscode.setState(state.panel);
  }

  function updateChapterButtons() {
    const activeIndex = state.panel.activeChapterIndex;
    const hasChapters = state.panel.chapters.length > 0;
    elements.previousChapterButton.disabled = !hasChapters || activeIndex <= 0;
    elements.nextChapterButton.disabled =
      !hasChapters || activeIndex < 0 || activeIndex >= state.panel.chapters.length - 1;
  }

  function openRelativeChapter(offset) {
    const nextIndex = state.panel.activeChapterIndex + offset;
    if (nextIndex < 0 || nextIndex >= state.panel.chapters.length) {
      return;
    }

    postMessage({
      type: "openChapter",
      chapterIndex: nextIndex,
    });
  }

  function findChapterIndex(query) {
    const text = query.trim();

    if (!text) {
      return -1;
    }

    const parsedNumber = Number(text);
    if (Number.isFinite(parsedNumber) && parsedNumber >= 1) {
      const chapter = state.panel.chapters.find(
        (item) => item.index === parsedNumber - 1,
      );
      return chapter ? chapter.index : -1;
    }

    const lower = text.toLowerCase();
    const matchedChapter = state.panel.chapters.find((chapter) =>
      chapter.title.toLowerCase().includes(lower),
    );
    return matchedChapter ? matchedChapter.index : -1;
  }

  function getScrollRatio(element) {
    const maxScroll = element.scrollHeight - element.clientHeight;
    return maxScroll <= 0 ? 0 : element.scrollTop / maxScroll;
  }

  function setElementScrollByRatio(element, scrollRatio) {
    const maxScroll = element.scrollHeight - element.clientHeight;
    element.scrollTop = maxScroll <= 0 ? 0 : Math.max(0, maxScroll * scrollRatio);
  }

  function setLinkedScrollRatio(scrollRatio) {
    state.linkedScrollLock = true;
    setElementScrollByRatio(elements.outputBody, scrollRatio);
    setElementScrollByRatio(elements.contentBody, scrollRatio);
    window.requestAnimationFrame(() => {
      state.linkedScrollLock = false;
    });
  }

  function saveCurrentReadingPosition() {
    if (state.panel.activeChapterIndex < 0) {
      return;
    }

    const maxScroll =
      elements.contentBody.scrollHeight - elements.contentBody.clientHeight;
    const scrollRatio = maxScroll <= 0 ? 0 : elements.contentBody.scrollTop / maxScroll;

    debounce("saveScrollTimer", () => {
      postMessage({
        type: "saveReadingPosition",
        chapterIndex: state.panel.activeChapterIndex,
        scrollRatio,
      });
    }, 250);
  }

  function bindEvents() {
    elements.addLogButton.addEventListener("click", () => {
      postMessage({ type: "addLogs" });
    });

    elements.logList.addEventListener("click", (event) => {
      const target = getClosestTarget(event, "[data-log-id]");
      if (!target) {
        return;
      }

      postMessage({
        type: "openLog",
        logId: target.dataset.logId,
      });
    });

    elements.logList.addEventListener("contextmenu", (event) => {
      const target = getClosestTarget(event, "[data-log-id]");
      if (!target) {
        return;
      }

      event.preventDefault();
      postMessage({
        type: "deleteLog",
        logId: target.dataset.logId,
      });
    });

    elements.chapterList.addEventListener("click", (event) => {
      const target = getClosestTarget(event, "[data-chapter-index]");
      if (!target) {
        return;
      }

      postMessage({
        type: "openChapter",
        chapterIndex: Number(target.dataset.chapterIndex),
      });
    });

    elements.chapterSearchInput.addEventListener("input", (event) => {
      const chapterIndex = findChapterIndex(event.target.value);
      state.searchHitIndex = chapterIndex;
      renderChapters();
      scrollChapterIntoView(chapterIndex, true);
    });

    elements.previousChapterButton.addEventListener("click", () => {
      openRelativeChapter(-1);
    });

    elements.nextChapterButton.addEventListener("click", () => {
      openRelativeChapter(1);
    });

    elements.fontSizeDownButton.addEventListener("click", () => {
      const nextFontSize = Math.max(MIN_FONT_SIZE, state.panel.fontSize - 1);
      applyFontSize(nextFontSize);
      vscode.setState(state.panel);
      postMessage({
        type: "saveFontSize",
        fontSize: nextFontSize,
      });
    });

    elements.fontSizeUpButton.addEventListener("click", () => {
      const nextFontSize = Math.min(MAX_FONT_SIZE, state.panel.fontSize + 1);
      applyFontSize(nextFontSize);
      vscode.setState(state.panel);
      postMessage({
        type: "saveFontSize",
        fontSize: nextFontSize,
      });
    });

    elements.lineHeightDownButton.addEventListener("click", () => {
      const nextLineHeight = Math.max(
        MIN_LINE_HEIGHT,
        Math.round((state.panel.lineHeight - 0.1) * 10) / 10,
      );
      applyLineHeight(nextLineHeight);
      vscode.setState(state.panel);
      postMessage({
        type: "saveLineHeight",
        lineHeight: nextLineHeight,
      });
    });

    elements.lineHeightUpButton.addEventListener("click", () => {
      const nextLineHeight = Math.min(
        MAX_LINE_HEIGHT,
        Math.round((state.panel.lineHeight + 0.1) * 10) / 10,
      );
      applyLineHeight(nextLineHeight);
      vscode.setState(state.panel);
      postMessage({
        type: "saveLineHeight",
        lineHeight: nextLineHeight,
      });
    });

    elements.contentBody.addEventListener("scroll", () => {
      if (state.linkedScrollLock) {
        return;
      }

      setLinkedScrollRatio(getScrollRatio(elements.contentBody));

      if (state.suppressScrollEvent) {
        return;
      }

      saveCurrentReadingPosition();
    });

    elements.outputBody.addEventListener("scroll", () => {
      if (state.linkedScrollLock) {
        return;
      }

      setLinkedScrollRatio(getScrollRatio(elements.outputBody));

      if (state.suppressScrollEvent) {
        return;
      }

      saveCurrentReadingPosition();
    });

    bindDivider(elements.leftDivider, "left");
    bindDivider(elements.chapterDivider, "chapter");
    bindDivider(elements.outputDivider, "output");
  }

  function bindDivider(divider, type) {
    divider.addEventListener("pointerdown", (event) => {
      divider.setPointerCapture(event.pointerId);
      divider.classList.add("dragging");
      document.body.classList.add("dragging");

      const startX = event.clientX;
      const initialLeft = state.panel.layout.leftWidth;
      const initialMiddle = state.panel.layout.middleWidth;
      const initialOutput = state.panel.layout.outputWidth;
      const containerWidth = elements.paneContainer.clientWidth;

      function onPointerMove(moveEvent) {
        const delta = moveEvent.clientX - startX;
        const totalDividerWidth = getTotalDividerWidth();

        if (type === "left") {
          const pairWidth = initialLeft + initialMiddle;
          const nextLeft = Math.max(
            MIN_LEFT,
            Math.min(
              initialLeft + delta,
              pairWidth - MIN_MIDDLE,
            ),
          );
          const nextMiddle = Math.max(MIN_MIDDLE, pairWidth - nextLeft);
          applyLayout({
            leftWidth: nextLeft,
            middleWidth: nextMiddle,
            outputWidth: initialOutput,
          });
          return;
        }

        if (type === "chapter") {
          const pairWidth = initialMiddle + initialOutput;
          const nextMiddle = Math.max(
            MIN_MIDDLE,
            Math.min(
              initialMiddle + delta,
              pairWidth - MIN_OUTPUT,
            ),
          );
          const nextOutput = Math.max(MIN_OUTPUT, pairWidth - nextMiddle);
          applyLayout({
            leftWidth: initialLeft,
            middleWidth: nextMiddle,
            outputWidth: nextOutput,
          });
          return;
        }

        const nextOutput = Math.max(
          MIN_OUTPUT,
          Math.min(
            initialOutput + delta,
            containerWidth - initialLeft - initialMiddle - MIN_RIGHT - totalDividerWidth,
          ),
        );
        applyLayout({
          leftWidth: initialLeft,
          middleWidth: initialMiddle,
          outputWidth: nextOutput,
        });
      }

      function onPointerUp(upEvent) {
        divider.releasePointerCapture(upEvent.pointerId);
        divider.classList.remove("dragging");
        document.body.classList.remove("dragging");
        divider.removeEventListener("pointermove", onPointerMove);
        divider.removeEventListener("pointerup", onPointerUp);
        divider.removeEventListener("pointercancel", onPointerUp);
        saveLayout();
      }

      divider.addEventListener("pointermove", onPointerMove);
      divider.addEventListener("pointerup", onPointerUp);
      divider.addEventListener("pointercancel", onPointerUp);
    });
  }

  function hydrate(nextState) {
    state.panel = {
      ...state.panel,
      ...nextState,
      layout: {
        ...state.panel.layout,
        ...(nextState.layout || {}),
      },
    };
    state.searchHitIndex = -1;
    renderAll();
  }

  window.addEventListener("message", (event) => {
    const message = event.data;

    switch (message.type) {
      case "hydrate":
        hydrate(message.state);
        break;
      case "chapterContent":
        state.panel.activeChapterIndex = message.payload.activeChapterIndex;
        state.panel.content = message.payload.content;
        state.panel.readingPosition = message.payload.readingPosition;
        renderChapters();
        renderContent();
        break;
      case "busy":
        updateBusy(message.busy, message.message);
        break;
      case "fontSizeSaved":
        applyFontSize(message.fontSize);
        vscode.setState(state.panel);
        break;
      case "lineHeightSaved":
        applyLineHeight(message.lineHeight);
        vscode.setState(state.panel);
        break;
    }
  });

  bindEvents();
  startAdRotation();
  window.addEventListener("resize", () => applyLayout(state.panel.layout));
  window.addEventListener("beforeunload", () => {
    clearInterval(state.adTimer);
  });

  const restoredState = vscode.getState();
  if (restoredState) {
    hydrate(restoredState);
  } else {
    renderAll();
  }

  postMessage({ type: "ready" });
})();
