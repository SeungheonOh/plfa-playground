<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { SPSC } from "spsc";
  import { basicSetup } from "codemirror";
  import { startCompletion } from "@codemirror/autocomplete";
  import { Compartment, Prec } from "@codemirror/state";
  import { EditorView, keymap } from "@codemirror/view";
  import { marked } from "marked";
  import {
    ArrowLeft,
    ArrowRight,
    BookOpen,
    Braces,
    ChevronDown,
    ChevronRight,
    CircleAlert,
    CircleCheck,
    FileCode,
    FolderOpen,
    FileText,
    Info,
    ListChecks,
    LoaderCircle,
    RotateCcw,
    Sigma,
    Split,
    SquareTerminal,
    TriangleAlert,
    WandSparkles,
    X,
    Zap,
  } from "@lucide/svelte";

  import { AgdaController, LS_DOC_KEY } from "$lib/controller.svelte";
  import { myCodeMirrorTheme } from "$lib/codemirror/theme";
  import { agdaCompletions } from "$lib/codemirror/completion";
  import { symbolInput } from "$lib/codemirror/symbol-input";
  import {
    agdaSourceLanguage,
    literateAgdaLanguage,
  } from "$lib/codemirror/agda-language";
  import { agdaSupport } from "$lib/agda";

  const DEFAULT_SOURCE = `module Main where

open import Agda.Builtin.Nat
open import Agda.Builtin.Equality

identity : {A : Set} → A → A
identity x = {! x !}

cong : {A B : Set} {x y : A} → (f : A → B) → x ≡ y → f x ≡ f y
cong f refl = refl

plus-zero : (n : Nat) → n + 0 ≡ n
plus-zero zero = refl
plus-zero (suc n) = cong suc {! plus-zero n !}
`;

  type CommandKind = "give" | "refine" | "case" | "infer" | "normalize";
  type InspectorMode = "goals" | "result" | "problems";
  type WorkspaceMode = "playground" | "plfa";
  type ActiveResource = "markdown" | "agda";

  interface PlfaChapter {
    id: string;
    name: string;
    title: string;
    sourcePath: string;
    modulePath: string;
  }

  interface PlfaGroup {
    id: string;
    title: string;
    chapters: PlfaChapter[];
  }

  interface PlfaManifest {
    title: string;
    source: string;
    license: string;
    commit: string;
    revisionDate: string;
    groups: PlfaGroup[];
  }

  const controller = new AgdaController({
    agdaBuffers: {
      stdin: SPSC.allocateArrayBuffer(4096),
      stdout: SPSC.allocateArrayBuffer(4096),
    },
    driveBuffers: {
      lock: new SharedArrayBuffer(4),
      stdin: SPSC.allocateArrayBuffer(1024 * 1024),
      stdout: SPSC.allocateArrayBuffer(1024 * 1024),
    },
    agdaVersion: "2.8.0",
  });
  const sourceLanguageCompartment = new Compartment();

  let editorHost: HTMLDivElement;
  let editor: EditorView | undefined;
  let readerContent = $state<HTMLDivElement>();
  let inspectorPreference = $state<"auto" | "goals">("auto");
  let filesOpen = $state(true);
  let workspaceMode = $state<WorkspaceMode>("playground");
  let activeResource = $state<ActiveResource>("agda");
  let plfaExpanded = $state(true);
  let expandedGroups = $state<Record<string, boolean>>({ part1: true });
  let plfaManifest = $state<PlfaManifest | null>(null);
  let selectedChapterId = $state("part1/Naturals");
  let plfaMarkdown = $state("");
  let plfaLoading = $state(false);
  let plfaError = $state("");
  let commandKind = $state<CommandKind | null>(null);
  let commandValue = $state("");
  let actionError = $state("");
  let startupError = $state("");
  let inspectorWidth = $state(390);
  let didAutoLoad = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let globalKeydown: ((event: KeyboardEvent) => void) | undefined;
  let editorScrollHandler: (() => void) | undefined;
  let readerScrollFrame = 0;
  let editorScrollFrame = 0;
  let scrollSyncOwner: "reader" | "editor" | null = null;
  let scrollSyncRelease: ReturnType<typeof setTimeout> | undefined;
  let chapterRequest = 0;

  const plfaChapters = $derived(
    plfaManifest?.groups.flatMap((group) => group.chapters) ?? [],
  );
  const selectedChapter = $derived(
    plfaChapters.find((chapter) => chapter.id === selectedChapterId),
  );
  const selectedChapterIndex = $derived(
    plfaChapters.findIndex((chapter) => chapter.id === selectedChapterId),
  );
  const plfaHtml = $derived(
    plfaMarkdown
      ? renderPlfaMarkdown(plfaMarkdown)
      : "",
  );
  const plfaCodeBlocks = $derived.by(() => {
    const ranges: Array<{ from: number; to: number }> = [];
    const opening = /^```agda[^\n]*\n/gm;
    for (const match of plfaMarkdown.matchAll(opening)) {
      const from = (match.index ?? 0) + match[0].length;
      const closing = plfaMarkdown.indexOf("\n```", from);
      ranges.push({ from, to: closing < 0 ? from : closing });
    }
    return ranges;
  });
  const editorFileName = $derived(
    workspaceMode === "plfa" && selectedChapter
      ? `${selectedChapter.name}.lagda.md`
      : "Main.agda",
  );

  const isAgdaBusy = $derived(
    controller.iotcmStatus === "requested" ||
      controller.iotcmStatus === "processing",
  );
  const isBusy = $derived(isAgdaBusy || controller.driveArchiveLoading);
  const compilerReady = $derived(
    controller.alsWorkerStatus === "active" &&
      controller.iotcmStatus === "ready",
  );
  const compilerStarting = $derived(
    controller.alsWorkerStatus === "initial" ||
      controller.alsWorkerStatus === "loading" ||
      controller.alsWorkerStatus === "loaded",
  );
  const progress = $derived.by(() => {
    const loaded = controller.wasmLoadingProgress?.bytesLoaded ?? 0;
    const total = controller.wasmLoadingProgress?.bytesTotal ?? 0;
    return total ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  });
  const compilerLoadingLabel = $derived(
    controller.alsWorkerStatus === "loaded" ? "Starting Agda" : "Loading Agda",
  );
  const currentGoals = $derived(
    controller.interactionPoints.map(
      (id) => controller.goalInfo[id] ?? { id, context: [] },
    ),
  );
  const inspectorMode = $derived.by((): InspectorMode => {
    if (inspectorPreference === "goals") return "goals";
    if (controller.problems.length) return "problems";
    if (
      controller.lastResult &&
      ["InferredType", "NormalForm", "Version"].includes(
        controller.lastResult.kind,
      )
    )
      return "result";
    return "goals";
  });
  const inspectorHeading = $derived(
    compilerStarting
      ? `${compilerLoadingLabel} ${progress}%`
      : isBusy
        ? controller.lastAction
      : inspectorMode === "problems"
        ? `${controller.problems.length} problem${controller.problems.length === 1 ? "" : "s"}`
        : inspectorMode === "result"
          ? (controller.lastResult?.title ?? "Result")
          : currentGoals.length
            ? `${currentGoals.length} open goal${currentGoals.length === 1 ? "" : "s"}`
            : controller.checked
              ? "Module checked"
              : "Waiting for check",
  );

  const commandMeta: Record<
    CommandKind,
    { title: string; description: string; placeholder: string; action: string }
  > = {
    give: {
      title: "Give expression",
      description:
        "Check this expression against the selected goal and replace the hole.",
      placeholder: "expression",
      action: "Give",
    },
    refine: {
      title: "Refine goal",
      description:
        "Insert the expression and let Agda create any required subgoals.",
      placeholder: "constructor or expression (optional)",
      action: "Refine",
    },
    case: {
      title: "Split on variable",
      description:
        "Generate clauses by pattern matching. Leave blank to split on the result.",
      placeholder: "variable, e.g. n",
      action: "Split",
    },
    infer: {
      title: "Infer a type",
      description: "Infer an expression in the current module scope.",
      placeholder: "expression",
      action: "Infer",
    },
    normalize: {
      title: "Normalize expression",
      description:
        "Evaluate an expression to normal form in the current scope.",
      placeholder: "expression",
      action: "Normalize",
    },
  };

  onMount(() => {
    editor = new EditorView({
      doc: localStorage.getItem(LS_DOC_KEY) ?? DEFAULT_SOURCE,
      parent: editorHost,
      extensions: [
        basicSetup,
        myCodeMirrorTheme(),
        agdaSupport(),
        sourceLanguageCompartment.of(agdaSourceLanguage()),
        agdaCompletions(),
        controller.lspClientCompartment.of([]),
        symbolInput(),
        Prec.highest(
          keymap.of([
            {
              key: "Ctrl-c Ctrl-l",
              run: () => runCheck(),
            },
            {
              key: "Ctrl-c Ctrl-f",
              run: () => moveGoal(1),
            },
            {
              key: "Ctrl-c Ctrl-b",
              run: () => moveGoal(-1),
            },
            {
              key: "Ctrl-c Ctrl-Space",
              run: () => runEditorAction(() => controller.give()),
            },
            {
              key: "Ctrl-c Ctrl-r",
              run: () => runEditorAction(() => controller.refine()),
            },
            {
              key: "Ctrl-c Ctrl-c",
              run: () => openEditorCommand("case"),
            },
            {
              key: "Ctrl-c Ctrl-t",
              run: () =>
                runEditorAction(() => controller.queryGoalType()),
            },
            {
              key: "Ctrl-c Ctrl-e",
              run: () => runEditorAction(() => controller.queryContext()),
            },
            {
              key: "Ctrl-c Ctrl-d",
              run: () => openEditorCommand("infer"),
            },
            {
              key: "Ctrl-c Ctrl-n",
              run: () => openEditorCommand("normalize"),
            },
            {
              key: "Ctrl-c Ctrl-?",
              run: () => showGoals(),
            },
            {
              key: "Ctrl-c Ctrl-x Ctrl-a",
              run: () => runEditorAction(() => controller.abort()),
            },
            {
              key: "Ctrl-Space",
              run: startCompletion,
            },
            {
              key: "Mod-Enter",
              run: () => runCheck(),
            },
          ]),
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            inspectorPreference = "goals";
            if (workspaceMode === "plfa")
              plfaMarkdown = update.state.doc.toString();
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(
              () => controller.persistDocument(update.state.doc.toString()),
              250,
            );
          }
          if (update.selectionSet) {
            const head = update.state.selection.main.head;
            const selected = controller
              .getGoals()
              .find((goal) => goal.from <= head && head <= goal.to);
            if (selected) {
              controller.activeGoalId = selected.id;
              inspectorPreference = "goals";
            }
          }
        }),
        EditorView.theme({
          "&": { background: "#fff", color: "#242a23", fontSize: "14px" },
          ".cm-scroller": { overscrollBehavior: "contain", lineHeight: "1.72" },
          ".cm-content": { padding: "18px 0 80px" },
          ".cm-gutters": {
            background: "#fafbf9",
            color: "#a0a79d",
            borderRight: "1px solid #edf0eb",
          },
          ".cm-activeLine, .cm-activeLineGutter": { background: "#f3f7f3" },
          ".cm-cursor": { borderLeftColor: "#20765b", borderLeftWidth: "2px" },
          ".agda-hole": {
            background: "#dff3e8",
            outline: "1px solid #8ac5aa",
            borderRadius: "0",
          },
          ".agda-goal-marker": {
            background: "#20765b",
            color: "white",
            borderRadius: "0",
            padding: "0 5px",
            marginRight: "3px",
            fontSize: "10px",
            fontFamily: "Inter, sans-serif",
          },
          ".cm-tooltip": {
            border: "1px solid #626a60",
            borderRadius: "0",
            boxShadow: "none",
            background: "#f8f9f5",
          },
          ".cm-lsp-documentation": {
            padding: "9px 11px",
            fontFamily: "JuliaMono, monospace",
            fontSize: "12px",
          },
          ".symbol-input-candidates": {
            background: "#f8f9f5",
            border: "1px solid #626a60",
            boxShadow: "none",
          },
        }),
      ],
    });
    controller.connectEditorView(editor);
    editorScrollHandler = () => scheduleScrollSync("editor");
    editor.scrollDOM.addEventListener("scroll", editorScrollHandler, {
      passive: true,
    });

    globalKeydown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        runCheck();
      } else if (event.key === "Escape") {
        if (commandKind) {
          commandKind = null;
          editor?.focus();
        }
      }
    };
    window.addEventListener("keydown", globalKeydown, { capture: true });

    void fetch("/plfa/manifest.json")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load the PLFA index");
        return response.json() as Promise<PlfaManifest>;
      })
      .then((manifest) => (plfaManifest = manifest))
      .catch((error) => (plfaError = readableError(error)));

    if (!crossOriginIsolated) {
      startupError =
        "This page needs COOP/COEP headers so its Agda worker can use SharedArrayBuffer.";
      return;
    }
    void controller.startALSWASM().catch((error) => {
      if (controller.alsWorkerStatus !== "terminated")
        startupError = readableError(error);
    });
  });

  $effect(() => {
    if (compilerReady && !didAutoLoad) {
      didAutoLoad = true;
      if (workspaceMode === "playground")
        setTimeout(() => void runAction(() => controller.loadAgdaFile()), 50);
    }
  });

  onDestroy(() => {
    if (saveTimer) clearTimeout(saveTimer);
    if (scrollSyncRelease) clearTimeout(scrollSyncRelease);
    if (readerScrollFrame) cancelAnimationFrame(readerScrollFrame);
    if (editorScrollFrame) cancelAnimationFrame(editorScrollFrame);
    if (globalKeydown)
      window.removeEventListener("keydown", globalKeydown, { capture: true });
    if (editorScrollHandler && editor)
      editor.scrollDOM.removeEventListener("scroll", editorScrollHandler);
    controller.terminateALSWASM();
    editor?.destroy();
  });

  function readableError(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  function renderPlfaMarkdown(source: string) {
    let blockIndex = 0;
    const codeOffsets = [...source.matchAll(/^```agda[^\n]*\n/gm)].map(
      (match) => (match.index ?? 0) + match[0].length,
    );
    const frontmatter = source.match(/^---\n[\s\S]*?\n---\n?/);
    const bodyOffset = frontmatter?.[0].length ?? 0;
    const markdownSource = source
      .slice(bodyOffset)
      .replace(
        /^#{1,6}\s+.+$/gm,
        (heading, offset) =>
          `<span class="source-scroll-anchor" data-source-offset="${bodyOffset + offset}"></span>\n${heading}`,
      )
      .replace(/\s+\{#([^}]+)\}(?=\n)/g, '\n<a id="$1"></a>')
      .replace(/^\{:[^}]+\}\s*$/gm, "");
    return (marked.parse(markdownSource) as string).replace(
      /<pre><code class="language-agda">/g,
      () =>
        `<pre class="agda-source-block" data-agda-block="${blockIndex}" data-source-offset="${codeOffsets[blockIndex++] ?? 0}" tabindex="0" title="Jump to this block in the literate source"><code class="language-agda">`,
    );
  }

  function claimScrollSync(owner: "reader" | "editor") {
    scrollSyncOwner = owner;
    if (scrollSyncRelease) clearTimeout(scrollSyncRelease);
    scrollSyncRelease = setTimeout(() => (scrollSyncOwner = null), 120);
  }

  function readerScrollPoints() {
    if (!readerContent || !editor) return [];
    const container = readerContent;
    const view = editor;
    const containerRect = container.getBoundingClientRect();
    const maxTop = Math.max(
      0,
      container.scrollHeight - container.clientHeight,
    );
    const points = Array.from(
      container.querySelectorAll<HTMLElement>("[data-source-offset]"),
      (element) => ({
        source: Number(element.dataset.sourceOffset),
        top: Math.max(
          0,
          Math.min(
              maxTop,
              element.getBoundingClientRect().top -
                containerRect.top +
              container.scrollTop,
          ),
        ),
      }),
    ).filter((point) => Number.isFinite(point.source));
    points.push(
      { source: 0, top: 0 },
      { source: view.state.doc.length, top: maxTop },
    );
    return points.sort((left, right) => left.top - right.top || left.source - right.source);
  }

  function interpolateScroll(
    points: Array<{ source: number; top: number }>,
    value: number,
    input: "source" | "top",
    output: "source" | "top",
  ) {
    if (!points.length) return 0;
    const sorted = [...points].sort((left, right) => left[input] - right[input]);
    if (value <= sorted[0][input]) return sorted[0][output];
    for (let index = 1; index < sorted.length; index++) {
      const upper = sorted[index];
      if (value > upper[input]) continue;
      const lower = sorted[index - 1];
      const span = upper[input] - lower[input];
      const ratio = span ? (value - lower[input]) / span : 0;
      return lower[output] + (upper[output] - lower[output]) * ratio;
    }
    return sorted.at(-1)?.[output] ?? 0;
  }

  function scheduleScrollSync(origin: "reader" | "editor") {
    if (workspaceMode !== "plfa" || !readerContent || !editor) return;
    if (scrollSyncOwner && scrollSyncOwner !== origin) return;
    claimScrollSync(origin);

    if (origin === "reader") {
      if (readerScrollFrame) return;
      readerScrollFrame = requestAnimationFrame(() => {
        readerScrollFrame = 0;
        if (!readerContent || !editor) return;
        const source = interpolateScroll(
          readerScrollPoints(),
          readerContent.scrollTop,
          "top",
          "source",
        );
        const block = editor.lineBlockAt(Math.round(source));
        const top = Math.max(0, block.top + editor.documentPadding.top);
        if (Math.abs(editor.scrollDOM.scrollTop - top) > 2)
          editor.scrollDOM.scrollTop = top;
      });
      return;
    }

    if (editorScrollFrame) return;
    editorScrollFrame = requestAnimationFrame(() => {
      editorScrollFrame = 0;
      if (!readerContent || !editor) return;
      const editorRect = editor.scrollDOM.getBoundingClientRect();
      const documentHeight = Math.max(
        0,
        (editorRect.top - editor.documentTop) / editor.scaleY,
      );
      const source = editor.lineBlockAtHeight(documentHeight).from;
      const top = interpolateScroll(
        readerScrollPoints(),
        source,
        "source",
        "top",
      );
      if (Math.abs(readerContent.scrollTop - top) > 2)
        readerContent.scrollTop = top;
    });
  }

  async function runAction(action: () => Promise<unknown>) {
    actionError = "";
    inspectorPreference = "auto";
    try {
      await action();
    } catch (error) {
      actionError = readableError(error);
    }
  }

  function plfaInterfaceUrls(chapter: PlfaChapter) {
    const index = plfaChapters.findIndex((candidate) => candidate.id === chapter.id);
    if (index < 0) return [];
    return plfaChapters.slice(0, index + 1).map(
      (candidate) =>
        `/plfa/interfaces/${candidate.id}.zip?cache=plfa-interfaces-v2`,
    );
  }

  function ensurePlfaInterfaces(chapter = selectedChapter) {
    if (!chapter) return Promise.resolve();
    return controller.mountDriveArchives(plfaInterfaceUrls(chapter));
  }

  function runCheck() {
    if (!compilerReady || isBusy) return true;
    void runAction(async () => {
      if (workspaceMode === "plfa") await ensurePlfaInterfaces();
      await controller.loadAgdaFile();
    });
    return true;
  }

  function runEditorAction(action: () => Promise<unknown>) {
    if (compilerReady && !isBusy) void runAction(action);
    return true;
  }

  function openEditorCommand(kind: CommandKind) {
    if (compilerReady && !isBusy) openCommand(kind);
    return true;
  }

  function moveGoal(direction: -1 | 1) {
    const goals = controller.getGoals();
    if (!goals.length) return true;
    const active = controller.getActiveGoal();
    const current = Math.max(
      0,
      goals.findIndex((goal) => goal.id === active?.id),
    );
    const next = (current + direction + goals.length) % goals.length;
    selectGoal(goals[next].id);
    return true;
  }

  function showGoals() {
    inspectorPreference = "goals";
    const goal = controller.getActiveGoal();
    if (goal) controller.selectGoal(goal.id);
    return true;
  }

  function openCommand(kind: CommandKind) {
    actionError = "";
    commandKind = kind;
    if (kind === "give" || kind === "refine") {
      const goal = controller.getActiveGoal();
      commandValue =
        goal && editor
          ? editor.state.doc
              .sliceString(goal.from + 2, Math.max(goal.from + 2, goal.to - 2))
              .trim()
          : "";
    } else commandValue = "";
    setTimeout(() =>
      document.querySelector<HTMLInputElement>("#command-input")?.focus(),
    );
  }

  async function submitCommand() {
    if (!commandKind) return;
    const kind = commandKind;
    const value = commandValue;
    await runAction(async () => {
      if (kind === "give") await controller.give(value);
      else if (kind === "refine") await controller.refine(value);
      else if (kind === "case") await controller.caseSplit(value);
      else if (kind === "infer") await controller.infer(value);
      else await controller.normalize(value);
      commandKind = null;
      setTimeout(() => editor?.focus());
    });
  }

  function selectGoal(id: number) {
    controller.selectGoal(id);
    inspectorPreference = "goals";
    if (compilerReady && !isBusy)
      void runAction(() => controller.queryGoalType(id));
  }

  async function openPlfaChapter(chapter: PlfaChapter) {
    if (isBusy) return;
    const request = ++chapterRequest;
    workspaceMode = "plfa";
    activeResource = "markdown";
    selectedChapterId = chapter.id;
    expandedGroups = {
      ...expandedGroups,
      [chapter.id.split("/")[0]]: true,
    };
    plfaLoading = true;
    plfaError = "";

    try {
      const sourceResponse = await fetch(chapter.sourcePath);
      if (!sourceResponse.ok)
        throw new Error(`Could not open ${chapter.name}`);
      const originalSource = await sourceResponse.text();
      if (request !== chapterRequest) return;

      const storageKey = `agda-web-ide-beta:plfa-lagda:${chapter.id}`;
      const source = localStorage.getItem(storageKey) ?? originalSource;
      plfaMarkdown = source;
      editor?.dispatch({
        effects: sourceLanguageCompartment.reconfigure(
          literateAgdaLanguage(),
        ),
      });
      controller.setDocument(source, chapter.modulePath, storageKey);
      readerContent?.scrollTo({ top: 0 });
      if (controller.driveIsCreated)
        void runAction(() => ensurePlfaInterfaces(chapter));
    } catch (error) {
      if (request === chapterRequest) plfaError = readableError(error);
    } finally {
      if (request === chapterRequest) plfaLoading = false;
    }
  }

  function openPlayground() {
    if (isBusy) return;
    chapterRequest++;
    workspaceMode = "playground";
    activeResource = "agda";
    const source = localStorage.getItem(LS_DOC_KEY) ?? DEFAULT_SOURCE;
    editor?.dispatch({
      effects: sourceLanguageCompartment.reconfigure(agdaSourceLanguage()),
    });
    controller.setDocument(source, "/Main.agda", LS_DOC_KEY);
    setTimeout(() => editor?.focus());
    if (compilerReady)
      setTimeout(() => void runAction(() => controller.loadAgdaFile()), 50);
  }

  function focusResource(resource: ActiveResource) {
    activeResource = resource;
    if (resource === "agda") setTimeout(() => editor?.focus());
    else readerContent?.focus();
  }

  function moveChapter(direction: -1 | 1) {
    const chapter = plfaChapters[selectedChapterIndex + direction];
    if (chapter) void openPlfaChapter(chapter);
  }

  function handleReaderClick(event: MouseEvent) {
    const target = event.target instanceof Element ? event.target : null;
    const sourceBlock = target?.closest<HTMLElement>("[data-agda-block]");
    if (sourceBlock) {
      const range = plfaCodeBlocks[Number(sourceBlock.dataset.agdaBlock)];
      if (!range || !editor) return;
      event.preventDefault();
      activeResource = "agda";
      claimScrollSync("reader");
      editor.dispatch({
        selection: { anchor: range.from },
        effects: EditorView.scrollIntoView(range.from, { y: "start" }),
      });
      editor.focus();
      return;
    }

    const anchor = target?.closest("a");
    const href = anchor?.getAttribute("href");
    if (!href?.startsWith("/")) return;

    const [pathname, fragment] = href.split("#", 2);
    const chapterName = decodeURIComponent(pathname)
      .split("/")
      .filter(Boolean)
      .at(-1);
    const chapter = plfaChapters.find(
      (candidate) =>
        candidate.name.toLowerCase() === chapterName?.toLowerCase(),
    );
    if (!chapter) return;

    event.preventDefault();
    void openPlfaChapter(chapter).then(() => {
      if (!fragment) return;
      setTimeout(() =>
        readerContent
          ?.querySelector<HTMLElement>(`#${CSS.escape(fragment)}`)
          ?.scrollIntoView({ block: "start" }),
      );
    });
  }

  function beginResize(event: PointerEvent) {
    const startX = event.clientX,
      startWidth = inspectorWidth;
    const move = (next: PointerEvent) =>
      (inspectorWidth = Math.max(
        300,
        Math.min(620, startWidth + startX - next.clientX),
      ));
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  }
</script>

<svelte:head><title>Agda Playground — Agda in your browser</title></svelte:head>

<main class="app-shell" style={`--inspector-width: ${inspectorWidth}px`}>
  {#if startupError}<div class="fatal-banner">
      <CircleAlert size={18} /><span>{startupError}</span>
    </div>{/if}

  <section
    class:files-closed={!filesOpen}
    class:lesson-workspace={workspaceMode === "plfa"}
    class="workspace"
  >
    <aside class="activitybar" aria-label="Workspace navigation">
      <button
        class:active={filesOpen}
        class="activity"
        aria-label={filesOpen ? "Hide files" : "Show files"}
        aria-expanded={filesOpen}
        onclick={() => (filesOpen = !filesOpen)}
        title={filesOpen ? "Hide files" : "Show files"}
        ><FolderOpen size={19} /></button
      >
    </aside>
    <aside class="explorer">
      <div class="section-label">EXPLORER</div>
      <div class="tree-root open">
        <ChevronDown size={13} /><span>PLAYGROUND</span>
      </div>
      <button
        class:active={workspaceMode === "playground"}
        class="file-row"
        onclick={openPlayground}
        disabled={isBusy}
        ><FileCode size={15} /><span>Main.agda</span><span
          class="dirty-dot"
          title="Saved locally"
        ></span></button
      >
      <button
        class:open={plfaExpanded}
        class="tree-root tree-button"
        onclick={() => (plfaExpanded = !plfaExpanded)}
        aria-expanded={plfaExpanded}
      >
        {#if plfaExpanded}<ChevronDown size={13} />{:else}<ChevronRight
            size={13}
          />{/if}<span>PLFA</span>
      </button>
      {#if plfaExpanded}
        {#if plfaManifest}
          <div class="plfa-tree">
            {#each plfaManifest.groups as group}
              <button
                class="tree-part"
                onclick={() =>
                  (expandedGroups = {
                    ...expandedGroups,
                    [group.id]: !expandedGroups[group.id],
                  })}
                aria-expanded={Boolean(expandedGroups[group.id])}
                title={group.title}
              >
                {#if expandedGroups[group.id]}<ChevronDown
                    size={12}
                  />{:else}<ChevronRight size={12} />{/if}<span
                  >{group.id.toUpperCase()}</span
                >
              </button>
              {#if expandedGroups[group.id]}
                {#each group.chapters as chapter}
                  <button
                    class:active={workspaceMode === "plfa" &&
                      selectedChapterId === chapter.id}
                    class="chapter-row"
                    onclick={() => void openPlfaChapter(chapter)}
                    disabled={isBusy}
                    title={chapter.title}
                  >
                    <FileText size={14} /><span>{chapter.name}.lagda.md</span>
                  </button>
                {/each}
              {/if}
            {/each}
          </div>
        {:else if plfaError}
          <div class="tree-message error">{plfaError}</div>
        {:else}
          <div class="tree-message"><LoaderCircle size={13} class="spin" />Indexing</div>
        {/if}
      {/if}
    </aside>

    <section class:lesson-open={workspaceMode === "plfa"} class="editor-pane">
      {#if workspaceMode === "plfa"}
        <section class="reader-pane" aria-label="PLFA chapter">
          <div class="reader-tabs">
            <button
              class="reader-tab active"
              onclick={() => focusResource("markdown")}
            >
              <BookOpen size={15} /><span>{editorFileName}</span>
            </button>
          </div>
          <div class="reader-nav">
            <button
              onclick={() => moveChapter(-1)}
              disabled={selectedChapterIndex <= 0 || plfaLoading}
              aria-label="Previous PLFA chapter"
              title="Previous chapter"
            ><ArrowLeft size={14} /></button>
            <strong>{selectedChapter?.title ?? "PLFA"}</strong>
            <button
              onclick={() => moveChapter(1)}
              disabled={selectedChapterIndex >= plfaChapters.length - 1 ||
                plfaLoading}
              aria-label="Next PLFA chapter"
              title="Next chapter"
            ><ArrowRight size={14} /></button>
          </div>
          <div
            class="reader-content"
            bind:this={readerContent}
            tabindex="-1"
            onclick={handleReaderClick}
            onscroll={() => scheduleScrollSync("reader")}
          >
            {#if plfaLoading}
              <div class="reader-state"><LoaderCircle
                  size={15}
                  class="spin"
                />Opening chapter</div>
            {:else if plfaError}
              <div class="reader-state error"><CircleAlert size={15} />{plfaError}</div>
            {:else}
              <article class="markdown-body">{@html plfaHtml}</article>
            {/if}
          </div>
          <footer class="reader-status">
            <a
              href={plfaManifest?.source ?? "https://plfa.github.io"}
              target="_blank"
              rel="noreferrer">PLFA</a
            ><span>CC BY 4.0</span><span class="status-spacer"></span><span
              >{selectedChapterIndex + 1}/{plfaChapters.length}</span
            >
          </footer>
        </section>
      {/if}
      <section class="code-pane">
      <div class="editor-tabs">
        <button
          class="editor-tab active"
          onclick={() => focusResource("agda")}
        >
          <FileCode size={15} /><span>{editorFileName}</span>
        </button>
      </div>
      <div class="command-strip">
        <button
          title="Goal type (C-c C-t)"
          onclick={() => runAction(() => controller.queryGoalType())}
          disabled={!compilerReady || isBusy || !currentGoals.length}
          ><Info size={14} />Type</button
        >
        <button
          title="Context (C-c C-e)"
          onclick={() => runAction(() => controller.queryContext())}
          disabled={!compilerReady || isBusy || !currentGoals.length}
          ><ListChecks size={14} />Context</button
        ><span class="strip-divider"></span>
        <button
          title="Give hole contents (C-c C-Space)"
          onclick={() => openCommand("give")}
          disabled={!compilerReady || isBusy || !currentGoals.length}
          ><Zap size={14} />Give</button
        >
        <button
          title="Refine or introduce (C-c C-r)"
          onclick={() => openCommand("refine")}
          disabled={!compilerReady || isBusy || !currentGoals.length}
          ><WandSparkles size={14} />Refine</button
        >
        <button
          title="Case split (C-c C-c)"
          onclick={() => openCommand("case")}
          disabled={!compilerReady || isBusy || !currentGoals.length}
          ><Split size={14} />Case split</button
        ><span class="strip-divider"></span>
        <button
          title="Infer type (C-c C-d)"
          onclick={() => openCommand("infer")}
          disabled={!compilerReady || isBusy}><Sigma size={14} />Infer</button
        >
        <button
          title="Normalize (C-c C-n)"
          onclick={() => openCommand("normalize")}
          disabled={!compilerReady || isBusy}
          ><RotateCcw size={14} />Normalize</button
        >
      </div>
      <div class="editor-host" bind:this={editorHost}></div>
      {#if commandKind}
        <form
          class="minibuffer"
          onsubmit={(event) => {
            event.preventDefault();
            void submitCommand();
          }}
        >
          <label for="command-input">
            <span>AGDA</span>
            <strong>{commandMeta[commandKind].title}</strong>
          </label>
          <input
            id="command-input"
            class="mono"
            bind:value={commandValue}
            placeholder={commandMeta[commandKind].placeholder}
            title={commandMeta[commandKind].description}
            autocomplete="off"
          />
          <button type="submit" class="minibuffer-run"
            >{commandMeta[commandKind].action}<span>↵</span></button
          >
          <button
            type="button"
            class="minibuffer-cancel"
            onclick={() => {
              commandKind = null;
              editor?.focus();
            }}
            aria-label="Cancel command">ESC</button
          >
        </form>
      {/if}
      <footer class="statusbar">
        {#if !compilerStarting}<span
            class:success={controller.checked &&
              !controller.problems.some((p) => p.severity === "error")}
          >
            {#if isBusy}<LoaderCircle
              size={13}
              class="spin"
            />{controller.lastAction}{:else if controller.problems.some(
              (p) => p.severity === "error",
            )}<CircleAlert
              size={13}
            />{controller.problems.filter((p) => p.severity === "error").length} error{:else}<CircleCheck
              size={13}
            />{controller.checked ? "Checked" : "Agda ready"}{/if}
          </span>{/if}<span
          >{currentGoals.length} goal{currentGoals.length === 1
            ? ""
            : "s"}</span
        ><span class="status-spacer"></span><span>Agda 2.8</span><span
          >WASI · local</span
        ><span>UTF-8</span>
      </footer>
      </section>
    </section>

    <div
      class="resize-handle"
      role="separator"
      aria-label="Resize inspector"
      onpointerdown={beginResize}
    ></div>
    <aside class="inspector">
      <div class="inspector-header" aria-live="polite">
        <span class="inspector-title">
          {#if compilerStarting || isBusy}<LoaderCircle
              size={14}
              class="spin"
            />{:else if inspectorMode ===
            "problems"}<TriangleAlert size={14} />{:else if inspectorMode ===
            "result"}<SquareTerminal size={14} />{:else}<Braces
              size={14}
            />{/if}
          <strong>AGDA INFO</strong>
        </span>
        <span class="inspector-state">
          <span class="inspector-status">{inspectorHeading}</span>
          {#if isAgdaBusy}<button
              class="abort-action"
              onclick={() => void runAction(() => controller.abort())}
              title="Abort current Agda command (C-c C-x C-a)">STOP</button
            >{/if}
        </span>
      </div>
      <div class="inspector-content">
        {#if inspectorMode === "goals"}
          {#if currentGoals.length}
            <div class="goal-list">
              {#each currentGoals as goal}<button
                  class:active={controller.activeGoalId === goal.id}
                  class="goal-card"
                  onclick={() => selectGoal(goal.id)}
                  ><span class="goal-number">{goal.id}</span><span
                    class="goal-content"
                    ><code>{goal.type ?? "?"}</code></span
                  ><ChevronDown size={15} class="goal-chevron" /></button
                >{/each}
            </div>
            {@const active =
              controller.activeGoalId == null
                ? undefined
                : controller.goalInfo[controller.activeGoalId]}
            {#if active?.context.length}<section class="context-panel">
                <h3>Context</h3>
                {#each active.context as entry}<div class="context-row">
                    <code class="context-name">{entry.name}</code><span>:</span
                    ><code>{entry.type}</code>
                  </div>{/each}
              </section>{/if}
          {/if}
        {:else if inspectorMode === "result"}
          {#if controller.lastResult}<div class="result-card">
              <span class="result-kind">{controller.lastResult.kind}</span>
              <h2>{controller.lastResult.title}</h2>
              <pre>{controller.lastResult.body}</pre>
            </div>{/if}
          {#if controller.runningMessages.length}<section class="compiler-log">
              <h3>Compiler log</h3>
              <pre>{controller.runningMessages.join("")}</pre>
            </section>{/if}
        {:else}<div class="problem-list">
            {#each controller.problems as problem}<article
                class:error={problem.severity === "error"}
                class:warning={problem.severity === "warning"}
                class="problem-card"
              >
                {#if problem.severity === "error"}<CircleAlert
                    size={17}
                  />{:else}<TriangleAlert size={17} />{/if}
                <div>
                  <strong>{problem.severity}</strong>
                  <pre>{problem.message}</pre>
                </div>
              </article>{/each}
          </div>{/if}
      </div>
      {#if actionError}<div class="action-error">
          <CircleAlert size={15} /><span>{actionError}</span><button
            onclick={() => (actionError = "")}
            aria-label="Dismiss"><X size={14} /></button
          >
        </div>{/if}
    </aside>
  </section>

</main>

<style>
  .app-shell {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--canvas);
    overflow: hidden;
  }
  :global(.spin) {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  button {
    border: 0;
    background: none;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .fatal-banner {
    min-height: 39px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px 16px;
    color: var(--red);
    background: var(--red-soft);
    border-bottom: 1px solid #efd0cd;
    font-size: 12px;
  }
  .workspace {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 44px 210px minmax(320px, 1fr) 5px var(
        --inspector-width
      );
  }
  .workspace.files-closed {
    grid-template-columns: 44px minmax(320px, 1fr) 5px var(
        --inspector-width
      );
  }
  .workspace.files-closed .explorer {
    display: none;
  }
  .workspace.lesson-workspace {
    grid-template-columns: 44px 210px minmax(340px, 43fr) minmax(420px, 57fr);
    grid-template-rows: minmax(300px, 64fr) minmax(210px, 36fr);
  }
  .workspace.lesson-workspace.files-closed {
    grid-template-columns: 44px minmax(340px, 43fr) minmax(420px, 57fr);
  }
  .lesson-workspace .activitybar,
  .lesson-workspace .explorer {
    grid-row: 1 / 3;
  }
  .lesson-workspace .editor-pane.lesson-open {
    display: contents;
  }
  .lesson-workspace .reader-pane {
    grid-column: 3;
    grid-row: 1 / 3;
  }
  .lesson-workspace.files-closed .reader-pane {
    grid-column: 2;
  }
  .lesson-workspace .code-pane {
    grid-column: 4;
    grid-row: 1;
    border-bottom: 1px solid var(--line-strong);
  }
  .lesson-workspace.files-closed .code-pane {
    grid-column: 3;
  }
  .lesson-workspace .resize-handle {
    display: none;
  }
  .lesson-workspace .inspector {
    grid-column: 4;
    grid-row: 2;
  }
  .lesson-workspace.files-closed .inspector {
    grid-column: 3;
  }
  .activitybar {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 0;
    background: #dfe3dc;
    border-right: 1px solid var(--line);
  }
  .activity {
    position: relative;
    width: 44px;
    height: 40px;
    display: grid;
    place-items: center;
    color: #7c847a;
  }
  .activity:hover,
  .activity.active {
    color: var(--green);
  }
  .activity.active:before {
    content: "";
    position: absolute;
    left: 0;
    width: 2px;
    height: 24px;
    background: var(--green);
  }
  .explorer {
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: #ebeee8;
    border-right: 1px solid var(--line);
    color: var(--muted);
    overflow: hidden;
  }
  .section-label {
    height: 35px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    font-size: 10px;
    letter-spacing: 0.09em;
  }
  .tree-root {
    height: 27px;
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 0 7px;
    font-size: 10px;
    font-weight: 700;
    color: #4d554b;
  }
  .tree-button {
    width: 100%;
    flex: none;
    text-align: left;
  }
  .tree-button:hover,
  .tree-part:hover {
    background: #dfe3dc;
  }
  .file-row {
    height: 31px;
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 0 11px 0 22px;
    color: #596057;
    text-align: left;
    font-size: 12px;
  }
  .file-row.active {
    color: var(--text);
    background: #d7ddd4;
    border-left: 3px solid var(--green);
  }
  .file-row :global(svg) {
    color: var(--green);
  }
  .plfa-tree {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    padding-bottom: 12px;
    border-top: 1px solid #d5d9d2;
  }
  .tree-part,
  .chapter-row {
    width: 100%;
    display: flex;
    align-items: center;
    text-align: left;
    color: #596057;
  }
  .tree-part {
    height: 27px;
    gap: 3px;
    padding: 0 9px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.05em;
  }
  .chapter-row {
    height: 29px;
    gap: 6px;
    padding: 0 8px 0 23px;
    font-size: 11px;
  }
  .chapter-row:hover {
    background: #e2e6df;
  }
  .chapter-row.active {
    color: var(--green-dark);
    background: #d9e4dc;
  }
  .chapter-row :global(svg) {
    flex: none;
    color: #6d756b;
  }
  .chapter-row span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tree-message {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 9px 13px 9px 22px;
    color: var(--muted);
    font-size: 10px;
  }
  .tree-message.error {
    color: var(--red);
  }
  .dirty-dot {
    width: 6px;
    height: 6px;
    margin-left: auto;
    border-radius: 50%;
    background: #90ad9d;
  }
  .editor-pane {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #fff;
  }
  .editor-pane.lesson-open {
    display: grid;
    grid-template-columns: minmax(330px, 42%) minmax(360px, 1fr);
  }
  .code-pane,
  .reader-pane {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .code-pane {
    flex: 1;
  }
  .reader-pane {
    background: #f8f9f5;
    border-right: 1px solid var(--line-strong);
  }
  .reader-tabs {
    height: 37px;
    min-height: 37px;
    display: flex;
    border-bottom: 1px solid var(--line);
    background: #e9ece6;
  }
  .reader-tab {
    min-width: 140px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 12px;
    border-right: 1px solid var(--line);
    color: var(--muted);
    font-size: 12px;
    text-align: left;
  }
  .reader-tab.active {
    position: relative;
    color: var(--text);
    background: #fff;
  }
  .reader-tab.active:before {
    content: "";
    position: absolute;
    inset: 0 0 auto;
    height: 2px;
    background: var(--green);
  }
  .reader-tab :global(svg) {
    color: var(--green);
  }
  .reader-nav {
    min-height: 39px;
    display: grid;
    grid-template-columns: 31px minmax(0, 1fr) 31px;
    align-items: center;
    border-bottom: 1px solid #e1e5de;
  }
  .reader-nav button {
    height: 100%;
    display: grid;
    place-items: center;
    color: var(--muted);
  }
  .reader-nav button:not(:disabled):hover {
    color: var(--green-dark);
    background: var(--green-soft);
  }
  .reader-nav strong {
    overflow: hidden;
    color: #454d43;
    font-size: 10px;
    font-weight: 600;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .reader-content {
    flex: 1;
    min-height: 0;
    overflow: auto;
    outline: 0;
    scroll-padding-top: 18px;
  }
  .reader-state {
    min-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    color: var(--muted);
    font-size: 11px;
  }
  .reader-state.error {
    color: var(--red);
  }
  .reader-status {
    height: 25px;
    min-height: 25px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 9px;
    border-top: 1px solid var(--line);
    background: #e4e8e1;
    color: #667064;
    font-size: 10px;
  }
  .reader-status a {
    color: var(--green-dark);
    text-decoration: none;
  }
  .markdown-body {
    max-width: 760px;
    margin: 0 auto;
    padding: 24px 28px 80px;
    color: #252a24;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 14px;
    line-height: 1.58;
  }
  .markdown-body :global(h1),
  .markdown-body :global(h2),
  .markdown-body :global(h3) {
    margin: 1.65em 0 0.6em;
    color: #171a16;
    font-family: Arial, Helvetica, sans-serif;
    font-weight: 600;
    line-height: 1.2;
  }
  .markdown-body :global(h1) {
    padding-bottom: 7px;
    border-bottom: 1px solid #c9cec5;
    font-size: 22px;
  }
  .markdown-body :global(h2) {
    font-size: 17px;
  }
  .markdown-body :global(h3) {
    font-size: 14px;
  }
  .markdown-body :global(p),
  .markdown-body :global(ul),
  .markdown-body :global(ol),
  .markdown-body :global(blockquote) {
    margin: 0 0 1em;
  }
  .markdown-body :global(a) {
    color: var(--green-dark);
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
  }
  .markdown-body :global(code),
  .markdown-body :global(pre) {
    font-family: JuliaMono, "SFMono-Regular", Consolas, monospace;
  }
  .markdown-body :global(code) {
    padding: 1px 3px;
    background: #e8ece5;
    font-size: 0.88em;
  }
  .markdown-body :global(pre) {
    overflow: auto;
    margin: 0 0 1.2em;
    padding: 12px 13px;
    border: 1px solid #bec5ba;
    background: #f0f2ed;
    font-size: 11px;
    line-height: 1.55;
  }
  .markdown-body :global(pre code) {
    padding: 0;
    background: transparent;
  }
  .markdown-body :global(pre.agda-source-block) {
    cursor: pointer;
    border-left: 3px solid #7f9488;
  }
  .markdown-body :global(pre.agda-source-block:hover),
  .markdown-body :global(pre.agda-source-block:focus) {
    border-color: var(--green);
    background: #e6eee8;
    outline: 1px solid var(--green);
  }
  .markdown-body :global(.source-scroll-anchor) {
    display: block;
    height: 0;
    pointer-events: none;
  }
  .markdown-body :global(blockquote) {
    padding: 7px 12px;
    border-left: 3px solid #8da297;
    color: #4f574d;
    background: #eef1eb;
  }
  .markdown-body :global(table) {
    width: 100%;
    margin-bottom: 1.2em;
    border-collapse: collapse;
    font-size: 12px;
  }
  .markdown-body :global(th),
  .markdown-body :global(td) {
    padding: 6px 7px;
    border: 1px solid #c4c9c0;
    text-align: left;
  }
  .markdown-body :global(img) {
    max-width: 100%;
  }
  .editor-tabs {
    height: 37px;
    min-height: 37px;
    display: flex;
    border-bottom: 1px solid var(--line);
    background: #e9ece6;
  }
  .editor-tab {
    min-width: 140px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 12px;
    color: var(--muted);
    border-right: 1px solid var(--line);
    font-size: 12px;
  }
  .editor-tab.active {
    position: relative;
    background: #fff;
    color: var(--text);
  }
  .editor-tab.active:before {
    content: "";
    position: absolute;
    inset: 0 0 auto;
    height: 2px;
    background: var(--green);
  }
  .editor-tab :global(svg:first-child) {
    color: var(--green);
  }
  :global(.tab-close) {
    margin-left: auto;
    opacity: 0.45;
  }
  .command-strip {
    min-height: 39px;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 8px;
    border-bottom: 1px solid #e8ece6;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .command-strip button {
    height: 29px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex: none;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: 0;
    color: #535c51;
    font-size: 11px;
  }
  .command-strip button:not(:disabled):hover {
    background: var(--green-soft);
    color: var(--green-dark);
    border-color: #809087;
  }
  .strip-divider {
    width: 1px;
    height: 18px;
    flex: none;
    margin: 0 3px;
    background: var(--line);
  }
  .editor-host {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .editor-host :global(.cm-editor) {
    height: 100%;
  }
  .minibuffer {
    min-height: 45px;
    display: grid;
    grid-template-columns: auto minmax(120px, 1fr) auto auto;
    align-items: stretch;
    border-top: 1px solid #60685e;
    background: #d9ded6;
  }
  .minibuffer label {
    min-width: 150px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 10px;
    border-right: 1px solid #899087;
    color: #2e342d;
    white-space: nowrap;
  }
  .minibuffer label span {
    padding: 3px 4px;
    color: #f4f7f1;
    background: var(--green);
    font: 700 8px JuliaMono, monospace;
    letter-spacing: 0.06em;
  }
  .minibuffer label strong {
    font-size: 10px;
  }
  .minibuffer input {
    min-width: 0;
    border: 0;
    border-right: 1px solid #899087;
    border-radius: 0;
    outline: 0;
    padding: 0 10px;
    color: #1d211c;
    background: #fafbf7;
    font-size: 12px;
  }
  .minibuffer input:focus {
    border-left: 3px solid var(--green);
  }
  .minibuffer-run,
  .minibuffer-cancel {
    min-width: 66px;
    padding: 0 10px;
    border-right: 1px solid #697167;
    background: #e9ece6;
    color: #293029;
    font: 700 9px JuliaMono, monospace;
    letter-spacing: 0.035em;
  }
  .minibuffer-run {
    color: #fff;
    background: var(--green);
  }
  .minibuffer-run span {
    margin-left: 5px;
  }
  .minibuffer-run:hover {
    background: var(--green-dark);
  }
  .minibuffer-cancel:hover {
    background: #f5f6f2;
  }
  .statusbar {
    height: 25px;
    min-height: 25px;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 9px;
    background: #e4e8e1;
    border-top: 1px solid var(--line);
    color: #667064;
    font-size: 10px;
  }
  .statusbar span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
  .statusbar .success {
    color: var(--green);
  }
  .status-spacer {
    flex: 1;
  }
  .resize-handle {
    cursor: col-resize;
    background: #dce0d9;
    border-inline: 1px solid var(--line);
    z-index: 5;
  }
  .resize-handle:hover,
  .resize-handle:focus {
    background: #9bcab4;
    outline: 0;
  }
  .inspector {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #f2f4ef;
  }
  .inspector-header {
    height: 38px;
    min-height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border-bottom: 1px solid var(--line);
    background: #e4e8e1;
    padding: 0 10px;
  }
  .inspector-title {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--green-dark);
    font-size: 10px;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .inspector-state {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .abort-action {
    height: 23px;
    padding: 0 7px;
    border: 1px solid #a34c45;
    color: var(--red);
    font: 700 8px JuliaMono, monospace;
    letter-spacing: 0.04em;
  }
  .abort-action:hover {
    color: #fff;
    background: var(--red);
  }
  .inspector-status {
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .inspector-content {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 14px;
  }
  .goal-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .goal-card {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    width: 100%;
    padding: 11px;
    border: 1px solid var(--line);
    border-radius: 0;
    background: #f9faf6;
    text-align: left;
  }
  .goal-card:hover {
    border-color: #b6c9bc;
  }
  .goal-card.active {
    border-color: #78ae95;
    border-left: 3px solid var(--green);
  }
  .goal-number {
    display: grid;
    place-items: center;
    flex: none;
    width: 24px;
    height: 24px;
    border-radius: 0;
    background: var(--green-soft);
    color: var(--green-dark);
    font:
      700 11px JuliaMono,
      monospace;
  }
  .goal-content {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .goal-content code {
    overflow-wrap: anywhere;
    color: #28322b;
    font:
      11px/1.5 JuliaMono,
      monospace;
  }
  :global(.goal-chevron) {
    flex: none;
    margin-left: auto;
    color: var(--faint);
    transform: rotate(-90deg);
  }
  .context-panel,
  .compiler-log {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .context-panel h3,
  .compiler-log h3 {
    margin: 0 0 8px;
    color: #515950;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
  }
  .context-row {
    display: grid;
    grid-template-columns: auto auto 1fr;
    gap: 6px;
    padding: 7px 4px;
    border-bottom: 1px solid #edf0eb;
    color: var(--muted);
    font-size: 10px;
  }
  .context-row code {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font:
      10px/1.5 JuliaMono,
      monospace;
    color: #3f4840;
  }
  .context-row .context-name {
    color: var(--green-dark);
    font-weight: 700;
  }
  .result-card {
    border: 1px solid var(--line);
    border-radius: 0;
    background: #f9faf6;
    padding: 14px;
  }
  .result-kind {
    padding: 3px 6px;
    border-radius: 0;
    background: var(--green-soft);
    color: var(--green-dark);
    font-size: 8px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .result-card h2 {
    margin: 12px 0 8px;
    font-size: 13px;
  }
  pre {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font:
      11px/1.65 JuliaMono,
      monospace;
  }
  .compiler-log pre {
    max-height: 220px;
    overflow: auto;
    color: #626a60;
    font-size: 10px;
  }
  .problem-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .problem-card {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 11px;
    border: 1px solid;
    border-radius: 0;
    background: #f9faf6;
  }
  .problem-card.error {
    border-color: #eccbc7;
    color: var(--red);
  }
  .problem-card.warning {
    border-color: #ecd9b7;
    color: var(--amber);
  }
  .problem-card :global(svg) {
    flex: none;
  }
  .problem-card strong {
    display: block;
    margin-bottom: 6px;
    font-size: 9px;
    text-transform: uppercase;
  }
  .problem-card pre {
    color: #4f554e;
    font-size: 10px;
  }
  .action-error {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 9px 10px;
    border-top: 1px solid #efcfcc;
    background: var(--red-soft);
    color: var(--red);
    font-size: 10px;
  }
  .action-error span {
    flex: 1;
    overflow-wrap: anywhere;
  }
  .action-error button {
    display: grid;
    place-items: center;
    color: inherit;
  }
  @media (max-width: 1080px) {
    .workspace {
      grid-template-columns: 42px 180px minmax(300px, 1fr) 5px min(
          var(--inspector-width),
          36vw
        );
    }
    .workspace.files-closed {
      grid-template-columns: 42px minmax(300px, 1fr) 5px min(
          var(--inspector-width),
          36vw
        );
    }
    .workspace.lesson-workspace {
      grid-template-columns: 42px 180px minmax(300px, 43fr) minmax(
          350px,
          57fr
        );
    }
    .workspace.lesson-workspace.files-closed {
      grid-template-columns: 42px minmax(300px, 43fr) minmax(350px, 57fr);
    }
  }
  @media (max-width: 800px) {
    .workspace {
      display: flex;
      flex-direction: column;
      overflow: auto;
    }
    .explorer,
    .activitybar,
    .resize-handle {
      display: none;
    }
    .editor-pane {
      min-height: 58vh;
    }
    .workspace.lesson-workspace .editor-pane.lesson-open {
      min-height: 116vh;
      display: flex;
      flex-direction: column;
      overflow: visible;
    }
    .workspace.lesson-workspace .reader-pane {
      min-height: 55vh;
      border-right: 0;
      border-bottom: 1px solid var(--line-strong);
    }
    .workspace.lesson-workspace .code-pane {
      min-height: 61vh;
    }
    .inspector {
      min-height: 42vh;
      border-top: 1px solid var(--line);
    }
    .inspector-content {
      min-height: 300px;
    }
    .statusbar span:nth-last-child(-n + 3) {
      display: none;
    }
  }
  @media (max-width: 520px) {
    .command-strip {
      padding-left: 4px;
    }
    .minibuffer {
      grid-template-columns: auto minmax(90px, 1fr) 49px 42px;
    }
    .minibuffer label {
      min-width: auto;
      padding: 0 7px;
    }
    .minibuffer label strong {
      display: none;
    }
    .minibuffer-run,
    .minibuffer-cancel {
      min-width: 0;
      padding: 0 5px;
      font-size: 8px;
    }
  }
</style>
