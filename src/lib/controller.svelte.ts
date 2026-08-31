import { SPSC } from "spsc";
import { SPSCReader } from "spsc/reader";
import { SPSCWriter } from "spsc/writer";

import type { EditorView } from "@codemirror/view";
import { Compartment } from "@codemirror/state";
import { LSPClient, languageServerExtensions } from "@codemirror/lsp-client";

import { hoverTooltips } from "$lib/codemirror/lsp-hover";

import {
  createReadableByteStream,
  createWritableByteStream,
  makeDriveHostWorker,
  makeLspWorker,
  mountArchiveOnDrive,
  persistDriveCache,
  traceFetchProgress,
  writeSourceFileToDrive,
} from "$lib";
import type {
  ALSWorkerInitResultProxied,
  WASMLoadingProgress,
} from "$lib/worker/types";
import { asset } from "$app/paths";
import {
  ALSMessageRouter,
  makeLSPTransport,
  type AgdaIOTCMStatus,
} from "./agda/transport";
import { commit } from "./codemirror/offsets";
import {
  getActiveAgdaGoal,
  getAgdaGoalById,
  getAgdaGoalContents,
  getAgdaGoals,
} from "./agda/goals";
import { browserAgdaSource } from "./agda/browser-source";

const isSafari =
  typeof navigator !== "undefined" &&
  /Apple Computer/.test((navigator as any).vendor);

type ALSWorkerStatus =
  | "initial"
  | "errored"
  | "loading"
  | "loaded"
  | "active"
  | "deactivating"
  | "terminated"
  | "exited";

const supportedAgdaVersion = ["2.6.4.3", "2.7.0.1", "2.8.0"] as const;
export type SupportedAgdaVersion = (typeof supportedAgdaVersion)[number];

export interface DriveHandle {
  lock: Int32Array<SharedArrayBuffer>;
  stdinWriter: SPSCWriter;
  stdoutReader: SPSCReader;
}

export interface AgdaProblem {
  severity: "error" | "warning";
  message: string;
}

export interface AgdaGoalInfo {
  id: number;
  type?: string;
  context: Array<{ name: string; type: string; inScope: boolean }>;
}

export interface AgdaResult {
  kind: string;
  title: string;
  body: string;
}

interface AgdaVersionSpec {
  path: string;
  compressedPath?: string;
  byteLength?: number;
  stdlibCandidates: string[];
  // Zip archive to unpack to the initial drive. Agda 2.8 still runs
  // `--setup`, but this archive also carries primitive interfaces.
  dataPath?: string;
}

export const agdaVersionMap: Record<SupportedAgdaVersion, AgdaVersionSpec> = {
  ["__proto__" as any]: null,
  "2.6.4.3": {
    path: asset("/als-2.6.wasm"),
    stdlibCandidates: ["2.0", "2.1"],
    dataPath: asset("/agda-data.zip"),
  },
  "2.7.0.1": {
    path: asset("/als-2.7ext.wasm"),
    stdlibCandidates: ["2.1.1", "2.2", "2.3"],
    dataPath: asset("/agda-data.zip"),
  },
  "2.8.0": {
    path: `${asset("/als-2.8ext.wasm")}?cache=stock-agda-o2-20260831`,
    compressedPath: `${asset("/als-2.8ext.wasm.gz")}?cache=stock-agda-o2-20260831`,
    byteLength: 32_996_332,
    stdlibCandidates: ["2.3"],
    dataPath: asset("/agda-data.zip"),
  },
};

export async function fetchWASMAndData(agdaVersion: SupportedAgdaVersion) {
  if (!(agdaVersion in agdaVersionMap)) {
    throw new Error(
      `version ${agdaVersion} not in list of supported versions: ${JSON.stringify(supportedAgdaVersion)}`,
    );
  }

  const { path, compressedPath, byteLength, dataPath } =
    agdaVersionMap[agdaVersion];

  let wasm: Response;
  if (compressedPath && typeof DecompressionStream !== "undefined") {
    const compressed = await fetch(compressedPath);
    if (compressed.ok && compressed.body) {
      const headers = new Headers({ "Content-Type": "application/wasm" });
      if (byteLength) headers.set("Content-Length", String(byteLength));
      // Some static servers attach Content-Encoding to .gz files, so fetch
      // has already decoded the response body. Others serve the gzip bytes as
      // an opaque file and need an explicit DecompressionStream.
      const body = compressed.headers
        .get("Content-Encoding")
        ?.toLowerCase()
        .includes("gzip")
        ? compressed.body
        : compressed.body.pipeThrough(new DecompressionStream("gzip"));
      wasm = new Response(body, { headers });
    } else {
      wasm = await fetch(path);
    }
  } else {
    wasm = await fetch(path);
  }

  if (!wasm.ok || wasm.status >= 400) {
    throw new Error(`failed to fetch ALS WASM: ${wasm.statusText}`);
  }

  let dataFile = null;
  if (dataPath) {
    dataFile = await fetch(dataPath);
    if (!dataFile.ok || dataFile.status >= 400) {
      throw new Error(`failed to fetch data file: ${dataFile.statusText}`);
    }
  }

  return { wasm, dataFile };
}

export const LS_DOC_KEY = "agda-web-ide-beta:doc";

function makeLspClient(rootUri: string = "/") {
  const lspExtsWithoutHover = languageServerExtensions().filter(
    (x) => !("active" in x),
  );

  return new LSPClient({
    timeout: 180000,
    rootUri,
    extensions: [...lspExtsWithoutHover, hoverTooltips()],
  });
}

export class AgdaController {
  agdaStdinWriter: SPSCWriter;
  agdaStdoutReader: SPSCReader;
  driveHandle: DriveHandle;
  editorView?: EditorView;
  lspClient?: LSPClient;
  alsRouter?: ALSMessageRouter;
  workerInitData?: ALSWorkerInitResultProxied;
  runningWASM?: Promise<number>;
  agdaDataZip?: Promise<Uint8Array>;

  lspClientCompartment = new Compartment();
  driveIsLocked = false;

  alsWorkerStatus = $state<ALSWorkerStatus>("initial");
  wasmLoadingProgress = $state<WASMLoadingProgress | null>(null);
  receivedALSVersion = $state<string | undefined>();
  driveIsCreated = $state(false);
  driveArchiveLoading = $state(false);
  currentFilePath = $state("/Main.agda");
  currentStorageKey = LS_DOC_KEY;
  iotcmStatus = $state<AgdaIOTCMStatus>("init");
  checked = $state(false);
  showImplicitArgs = $state(false);
  showIrrelevantArgs = $state(false);
  interactionPoints = $state<number[]>([]);
  activeGoalId = $state<number | undefined>();
  goalInfo = $state<Record<number, AgdaGoalInfo>>({});
  problems = $state<AgdaProblem[]>([]);
  runningMessages = $state<string[]>([]);
  lastResult = $state<AgdaResult | null>(null);
  lastAction = $state("Waiting for Agda");
  lastCheckDurationMs = $state<number | undefined>();
  pendingExpression: string | undefined;
  pendingCheckStartedAt: number | undefined;
  pendingGoalCheck = false;
  loadedSnapshot?: { filePath: string; source: string };
  pendingLoadSnapshot?: { filePath: string; source: string };

  _lspWorker: Worker | undefined;
  _driveHostWorker: Worker | undefined;
  _archiveMountPromise: Promise<void> | undefined;
  _mountedDriveArchives = new Set<string>();

  constructor(
    readonly config: {
      agdaBuffers: {
        stdin: SharedArrayBuffer;
        stdout: SharedArrayBuffer;
      };
      driveBuffers: {
        lock: SharedArrayBuffer;
        stdin: SharedArrayBuffer;
        stdout: SharedArrayBuffer;
      };
      agdaVersion: SupportedAgdaVersion;
    },
  ) {
    this.agdaStdinWriter = new SPSCWriter(config.agdaBuffers.stdin);
    this.agdaStdoutReader = new SPSCReader(config.agdaBuffers.stdout);
    this.driveHandle = {
      lock: new Int32Array(config.driveBuffers.lock, 0, 1),
      stdinWriter: new SPSCWriter(config.driveBuffers.stdin),
      stdoutReader: new SPSCReader(config.driveBuffers.stdout),
    };

    this.lspClient = makeLspClient();
  }

  connectEditorView(view: EditorView) {
    this.editorView = view;
  }

  onInteractionEdit = () => {
    const source = this.editorView?.state.doc.toString();
    if (source != null) {
      // Give/refine/case-split already changed Agda's live interaction state.
      // Treat the response edit as the new checked snapshot instead of
      // immediately throwing that state away with another Cmd_load.
      this.loadedSnapshot = {
        filePath: this.currentFilePath,
        source,
      };
      this.checked = this.getGoals().length === 0;
    }
    void this.syncEditorToDrive()
      .then(() => persistDriveCache(this.driveHandle))
      .catch((error) =>
        console.warn("Could not persist the Agda cache", error),
      );
  };

  async startALSWASM() {
    if (this.runningWASM) {
      throw new Error("WASM is already running");
    }

    if (this.workerInitData) {
      if (!this._lspWorker) {
        throw new Error("runaway worker");
      }
      console.warn("reusing worker");
      return this._startALSWASM(this.workerInitData);
    }

    if (this.wasmLoadingProgress) {
      throw new Error("wasm is already loading");
    }

    this.alsWorkerStatus = "loading";
    const wasmAndData = await fetchWASMAndData(this.config.agdaVersion).catch(
      () => null,
    );

    if (wasmAndData == null) {
      this.alsWorkerStatus = "errored";
      return;
    }

    const progressCtx = traceFetchProgress(wasmAndData.wasm, (loaded) => {
      this.wasmLoadingProgress!.bytesLoaded = loaded;
    });

    if (isSafari) {
      // Safari does not support transfering a ReadableStream, so we consume the stream and pass its object URL to worker
      this.wasmLoadingProgress = {
        ...progressCtx,
        source: { type: "url", url: "fakeurl" },
        bytesLoaded: 0,
        // we read it till end; by the time "finished" is awaited, the object is replaced with the real one below
      };

      const resp = new Response(progressCtx.source.stream, {
        headers: { "Content-Type": "application/wasm" },
      });
      const blob = await resp.blob();
      this.wasmLoadingProgress = {
        source: { type: "url", url: URL.createObjectURL(blob) },
        bytesLoaded: blob.size,
        bytesTotal: blob.size,
        finished: Promise.resolve(),
      };
    } else {
      this.wasmLoadingProgress = { ...progressCtx, bytesLoaded: 0 };
    }

    this.wasmLoadingProgress.finished.then(
      () => (this.alsWorkerStatus = "loaded"),
    );

    return this.runALSWASM(wasmAndData.dataFile);
  }

  async restartALSWASM() {
    await this.stopALSWASM();
    // FIXME: make one tick for the status transition, is it required?
    await new Promise((r) => setTimeout(r));
    return this.startALSWASM();
  }

  async _startALSWASM(workerInitData: ALSWorkerInitResultProxied) {
    this.alsWorkerStatus = "active";

    SPSC.resetArrayBuffer(this.config.agdaBuffers.stdin);
    SPSC.resetArrayBuffer(this.config.agdaBuffers.stdout);

    this.runningWASM = workerInitData.start();

    this.lspClient!.connect(this.alsRouter!.transport);
    this.editorView!.dispatch({
      effects: this.lspClientCompartment.reconfigure(
        this.lspClient!.plugin(`file://${this.currentFilePath}`),
      ),
    });

    const ret = await this.runningWASM;
    this.runningWASM = undefined;
    this.deactivate();

    this.alsWorkerStatus = "exited";
    console.log("ALS worker exited with code", ret);
    return ret;
  }

  async initDriveHostWorker(options: {
    builtin?: ArrayBuffer;
    stdlib?: ArrayBuffer;
    plfa?: ArrayBuffer;
  }) {
    if (this._driveHostWorker) {
      throw new Error("should not be reusing existing drive host worker");
    }

    const { lock, stdin, stdout } = this.config.driveBuffers;
    new Int32Array(lock).set([0]);
    SPSC.resetArrayBuffer(stdin);
    SPSC.resetArrayBuffer(stdout);

    const { worker, event } = await makeDriveHostWorker({
      stdin,
      stdout,
      agdaDataZip: options.builtin ?? null,
      agdaStdlibZip: options.stdlib ?? null,
      plfaProjectZip: options.plfa ?? null,
      cacheNamespace:
        "stock-agda-2.8.0-o2-stdlib-2.3-plfa-870f9bb12d61927cdea3311cedcbbc48ac3fc422-browser-adapters-v1",
    });

    if (event.data !== "fs-ready") {
      throw new Error("drive worker did not respond correctly");
    }

    this.driveIsCreated = true;
    return (this._driveHostWorker = worker);
  }

  makeALSTransport(stdinWaker: MessagePort) {
    if (!this.editorView) {
      throw new Error("EditorView not ready");
    }

    const lspClientReadable = createReadableByteStream(
      this.agdaStdoutReader,
      stdinWaker,
    );
    const lspClientWritable = createWritableByteStream(this.agdaStdinWriter);

    const router = makeLSPTransport(
      this.editorView,
      (status) => {
        this.iotcmStatus = status;
      },
      (tag: string, contents: any) => this.handleAgdaResponse(tag, contents),
      this,
    );

    router.intercept(lspClientReadable, lspClientWritable);

    return router;
  }

  async runALSWASM(dataFile: Response | null) {
    if (!this.wasmLoadingProgress) {
      throw new Error("No active loading wasm");
    }

    const wakerChannel = new MessageChannel();

    this.alsRouter = this.makeALSTransport(wakerChannel.port1);

    const { initPromise } = makeLspWorker(
      {
        wasmSource: { ...this.wasmLoadingProgress.source },
        stdinWaker: wakerChannel.port2,
        stdin: this.config.agdaBuffers.stdin,
        stdout: this.config.agdaBuffers.stdout,
        // note that we pipe the app's stdout to drive's stdin and vice versa
        driveBuffers: {
          lock: this.config.driveBuffers.lock,
          stdin: this.config.driveBuffers.stdout,
          stdout: this.config.driveBuffers.stdin,
        },
        // ALS drives Agda through its interactive command loop, but unlike the
        // `agda --interaction` executable it does not enable Agda's loaded-file
        // cache by default. Pass the matching Agda option explicitly so repeat
        // checks can reuse declarations that have not changed.
        args: ["+RTS", "-A64m", "-RTS", "+AGDA", "--interaction", "-AGDA"],
      },
      (worker) => {
        this._lspWorker = worker;
        worker.addEventListener("error", (evt) => {
          console.error(evt);
          debugger;
        });
      },
    );

    this.workerInitData = await initPromise;

    const [, dataFileData, stdlibData, plfaData] = await Promise.all([
      this.workerInitData
        .getALSVersion()
        .then((ver) => (this.receivedALSVersion = ver)),
      dataFile ? dataFile.arrayBuffer() : Promise.resolve(undefined),
      fetch(`${asset("/agda-stdlib-2.3.zip")}?cache=stock-agda-20260831`).then(
        (x) => x.arrayBuffer(),
      ),
      fetch(
        `${asset("/plfa/project.zip")}?cache=browser-adapters-v1-20260831`,
      ).then((x) => x.arrayBuffer()),
    ]);

    try {
      await this.initDriveHostWorker({
        builtin: dataFileData,
        stdlib: stdlibData,
        plfa: plfaData,
      });
    } catch (err) {
      return Promise.reject(
        new Error("Failed to setup ALS drive host worker", { cause: err }),
      );
    }

    if (this.config.agdaVersion === "2.8.0") {
      try {
        await this.workerInitData.spawn(["--setup"]);
      } catch (err) {
        console.warn("failed to complete the setup stage of agda", err);
        this.alsWorkerStatus = "errored";
        return -1;
      }
    }

    // revoke object url after it is consumed
    if (
      this.wasmLoadingProgress.source.type === "url" &&
      this.wasmLoadingProgress.source.url.startsWith("blob:")
    ) {
      URL.revokeObjectURL(this.wasmLoadingProgress.source.url);
    }

    return this._startALSWASM(this.workerInitData);
  }

  async stopALSWASM() {
    if (this.alsWorkerStatus !== "active") {
      throw new Error("cannot stop if the status is not active");
    }
    // FIXME: cannot reuse the worker, transport just deadlock
    this.alsWorkerStatus = "deactivating";
    await this.lspClient!.request("shutdown", null);
    this.lspClient!.notification("exit", null);
    await this.runningWASM;
    this.runningWASM = undefined;
    this.alsWorkerStatus = "exited";
    this.deactivate();
  }

  terminateALSWASM() {
    console.log("attempting to terminate the worker");
    if (this.wasmLoadingProgress) {
      this.wasmLoadingProgress.cancel?.();
    }
    this.wasmLoadingProgress = null;

    this._lspWorker?.terminate();
    this._lspWorker = undefined;
    this.workerInitData = undefined;
    this.runningWASM = undefined;

    this._driveHostWorker?.terminate();
    this._driveHostWorker = undefined;
    this.driveIsCreated = false;
    this.driveArchiveLoading = false;
    this._archiveMountPromise = undefined;
    this._mountedDriveArchives.clear();
    this.loadedSnapshot = undefined;
    this.pendingLoadSnapshot = undefined;
    this.pendingGoalCheck = false;

    this.alsWorkerStatus = "terminated";
    this.deactivate();
  }

  deactivate() {
    this.lspClient!.disconnect();
    this.editorView!.dispatch({
      effects: this.lspClientCompartment.reconfigure([]),
    });
  }

  async loadAgdaFile() {
    if (this.alsWorkerStatus !== "active") {
      throw new Error("Agda is still starting");
    }

    const source = this.editorView?.state.doc.toString();
    if (source == null) throw new Error("The Agda editor is not ready");

    if (
      this.loadedSnapshot?.filePath === this.currentFilePath &&
      this.loadedSnapshot.source === source &&
      !this.problems.some((problem) => problem.severity === "error")
    ) {
      this.lastAction = "Already checked";
      return;
    }

    const fastGoal = this.getFastGoalCheck(source);
    if (fastGoal) {
      this.lastAction = `Checking goal ${fastGoal.id}…`;
      this.lastCheckDurationMs = undefined;
      this.pendingCheckStartedAt = performance.now();
      this.problems = [];
      this.lastResult = null;
      this.activeGoalId = fastGoal.id;
      this.pendingExpression = fastGoal.value;
      this.pendingGoalCheck = true;
      try {
        await this.sendInteraction(
          `Cmd_give WithoutForce ${fastGoal.id} noRange ${JSON.stringify(fastGoal.value)}`,
        );
      } catch (error) {
        this.pendingCheckStartedAt = undefined;
        this.pendingGoalCheck = false;
        throw error;
      }
      return;
    }

    this.lastAction = "Checking source…";
    this.lastCheckDurationMs = undefined;
    this.pendingCheckStartedAt = performance.now();
    this.problems = [];
    this.lastResult = null;
    this.goalInfo = {};
    this.interactionPoints = [];
    this.activeGoalId = undefined;

    await this.syncEditorToDrive();

    const encodedFilePath = JSON.stringify(this.currentFilePath);
    this.pendingLoadSnapshot = {
      filePath: this.currentFilePath,
      source,
    };
    try {
      await this.sendInteraction(`Cmd_load ${encodedFilePath} []`);
    } catch (error) {
      this.pendingLoadSnapshot = undefined;
      this.pendingCheckStartedAt = undefined;
      throw error;
    }
  }

  /**
   * A single edit wholly inside one live goal can be checked by stock Agda's
   * Cmd_give. Everything else deliberately falls back to Cmd_load, so edits
   * to declarations, imports, or more than one hole always recheck the module.
   */
  private getFastGoalCheck(source: string) {
    const snapshot = this.loadedSnapshot;
    if (
      !this.editorView ||
      !snapshot ||
      snapshot.filePath !== this.currentFilePath
    ) {
      return undefined;
    }

    const previous = snapshot.source;
    let prefix = 0;
    const shortest = Math.min(previous.length, source.length);
    while (prefix < shortest && previous[prefix] === source[prefix]) prefix++;
    if (prefix === previous.length && prefix === source.length)
      return undefined;

    let suffix = 0;
    while (
      suffix < previous.length - prefix &&
      suffix < source.length - prefix &&
      previous[previous.length - 1 - suffix] ===
        source[source.length - 1 - suffix]
    ) {
      suffix++;
    }

    const previousChangeEnd = previous.length - suffix;
    const sourceChangeEnd = source.length - suffix;
    const delta = source.length - previous.length;

    for (const goal of this.getGoals()) {
      const previousGoalTo = goal.to - delta;
      const sourceInnerFrom = goal.from + 2;
      const sourceInnerTo = goal.to - 2;
      const previousInnerFrom = goal.from + 2;
      const previousInnerTo = previousGoalTo - 2;
      if (
        source.slice(goal.from, goal.from + 2) !== "{!" ||
        source.slice(goal.to - 2, goal.to) !== "!}" ||
        previous.slice(goal.from, goal.from + 2) !== "{!" ||
        previous.slice(previousGoalTo - 2, previousGoalTo) !== "!}" ||
        prefix < sourceInnerFrom ||
        sourceChangeEnd > sourceInnerTo ||
        prefix < previousInnerFrom ||
        previousChangeEnd > previousInnerTo
      ) {
        continue;
      }

      const value = source.slice(sourceInnerFrom, sourceInnerTo).trim();
      if (value) return { id: goal.id, value };
    }
    return undefined;
  }

  async syncEditorToDrive() {
    if (this.driveIsLocked) {
      return;
    }
    if (!this.editorView || !this.driveIsCreated) return;

    const doc = this.editorView!.state.doc.toString();
    this.persistDocument(doc);

    try {
      this.driveIsLocked = true;
      await writeSourceFileToDrive(
        this.driveHandle,
        this.currentFilePath,
        browserAgdaSource(this.currentFilePath, doc),
      );
    } finally {
      this.driveIsLocked = false;
    }

    this.editorView!.dispatch({ effects: commit.of() });

    this.lspClient!.notification("textDocument/didSave", {
      textDocument: {
        uri: "file://" + this.currentFilePath,
      },
    });
  }

  async mountDriveArchives(urls: string[]): Promise<void> {
    if (this._archiveMountPromise) {
      await this._archiveMountPromise;
      return this.mountDriveArchives(urls);
    }

    const missing = urls.filter(
      (url, index) =>
        !this._mountedDriveArchives.has(url) && urls.indexOf(url) === index,
    );
    if (!missing.length) return;
    if (!this.driveIsCreated) throw new Error("Agda filesystem is not ready");

    this.driveArchiveLoading = true;
    this.lastAction = `Loading ${missing.length} PLFA cache ${missing.length === 1 ? "bundle" : "bundles"}…`;
    const mount = async () => {
      const archives = await Promise.all(
        missing.map(async (url) => {
          const response = await fetch(url);
          if (!response.ok)
            throw new Error(`Could not load Agda cache: ${response.status}`);
          return { url, data: await response.arrayBuffer() };
        }),
      );
      this.lastAction = "Installing PLFA cache…";
      for (const archive of archives) {
        await mountArchiveOnDrive(this.driveHandle, archive.data);
        this._mountedDriveArchives.add(archive.url);
      }
    };
    this._archiveMountPromise = mount();
    try {
      await this._archiveMountPromise;
      this.lastAction = "PLFA cache ready";
    } finally {
      this._archiveMountPromise = undefined;
      this.driveArchiveLoading = false;
    }
  }

  async sendInteraction(command: string) {
    if (!this.lspClient || this.alsWorkerStatus !== "active") {
      throw new Error("Agda is not ready");
    }
    const encodedFilePath = JSON.stringify(this.currentFilePath);
    return this.lspClient.request("agda", {
      tag: "CmdReq",
      contents: `IOTCM ${encodedFilePath} NonInteractive Direct (${command})`,
    });
  }

  getGoals() {
    if (!this.editorView) return [];
    return getAgdaGoals(this.editorView.state);
  }

  getActiveGoal() {
    if (!this.editorView) return undefined;
    if (this.activeGoalId != null) {
      const selected = getAgdaGoalById(
        this.editorView.state,
        this.activeGoalId,
      );
      if (selected) return selected;
    }
    return getActiveAgdaGoal(this.editorView.state);
  }

  selectGoal(id: number) {
    if (!this.editorView) return;
    const goal = getAgdaGoalById(this.editorView.state, id);
    if (!goal) return;
    this.activeGoalId = id;
    this.editorView.dispatch({
      selection: { anchor: Math.min(goal.from + 2, goal.to) },
      scrollIntoView: true,
    });
    this.editorView.focus();
  }

  private requireGoal() {
    const goal = this.getActiveGoal();
    if (!goal)
      throw new Error("Place the cursor in a goal and load the file first");
    this.activeGoalId = goal.id;
    return goal;
  }

  async queryGoalType(id?: number) {
    if (id != null) this.selectGoal(id);
    const goal = this.requireGoal();
    this.lastAction = `Inspecting goal ${goal.id}…`;
    return this.sendInteraction(
      `Cmd_goal_type Normalised ${goal.id} noRange ""`,
    );
  }

  async queryContext(id?: number) {
    if (id != null) this.selectGoal(id);
    const goal = this.requireGoal();
    this.lastAction = `Loading context for goal ${goal.id}…`;
    return this.sendInteraction(`Cmd_context Normalised ${goal.id} noRange ""`);
  }

  async give(expression?: string) {
    const goal = this.requireGoal();
    const value =
      expression?.trim() || getAgdaGoalContents(this.editorView!.state, goal);
    if (!value) throw new Error("Enter an expression to give");
    this.pendingExpression = value;
    this.lastAction = `Giving goal ${goal.id}…`;
    return this.sendInteraction(
      `Cmd_give WithoutForce ${goal.id} noRange ${JSON.stringify(value)}`,
    );
  }

  async refine(expression?: string) {
    const goal = this.requireGoal();
    const value =
      expression?.trim() || getAgdaGoalContents(this.editorView!.state, goal);
    this.pendingExpression = value;
    this.lastAction = `Refining goal ${goal.id}…`;
    return this.sendInteraction(
      `Cmd_refine_or_intro False ${goal.id} noRange ${JSON.stringify(value)}`,
    );
  }

  async caseSplit(patterns = "") {
    const goal = this.requireGoal();
    this.lastAction = `Splitting goal ${goal.id}…`;
    return this.sendInteraction(
      `Cmd_make_case ${goal.id} noRange ${JSON.stringify(patterns)}`,
    );
  }

  async infer(expression: string) {
    if (!expression.trim()) throw new Error("Enter an expression to infer");
    this.lastAction = "Inferring type…";
    return this.sendInteraction(
      `Cmd_infer_toplevel Normalised ${JSON.stringify(expression)}`,
    );
  }

  async normalize(expression: string) {
    if (!expression.trim()) throw new Error("Enter an expression to normalize");
    const goal = this.getActiveGoal();
    this.lastAction = "Normalizing expression…";
    if (goal) {
      this.activeGoalId = goal.id;
      return this.sendInteraction(
        `Cmd_compute DefaultCompute ${goal.id} noRange ${JSON.stringify(expression)}`,
      );
    }
    return this.sendInteraction(
      `Cmd_compute_toplevel DefaultCompute ${JSON.stringify(expression)}`,
    );
  }

  async abort() {
    this.lastAction = "Aborting…";
    return this.sendInteraction("Cmd_abort");
  }

  persistDocument(source: string) {
    localStorage.setItem(this.currentStorageKey, source);
  }

  setDocument(
    source: string,
    filePath = "/Main.agda",
    storageKey = LS_DOC_KEY,
  ) {
    if (!this.editorView) return;
    const pathChanged = filePath !== this.currentFilePath;
    this.currentFilePath = filePath;
    this.currentStorageKey = storageKey;
    this.checked = false;
    this.problems = [];
    this.interactionPoints = [];
    this.goalInfo = {};
    this.activeGoalId = undefined;
    this.lastResult = null;
    this.lastCheckDurationMs = undefined;
    this.pendingCheckStartedAt = undefined;
    this.pendingGoalCheck = false;
    const length = this.editorView.state.doc.length;
    this.editorView.dispatch({
      changes: { from: 0, to: length, insert: source },
      selection: { anchor: 0 },
      effects:
        pathChanged && this.alsWorkerStatus === "active"
          ? this.lspClientCompartment.reconfigure(
              this.lspClient!.plugin(`file://${this.currentFilePath}`),
            )
          : undefined,
    });
    this.persistDocument(source);
  }

  private handleAgdaResponse(tag: string, contents: any) {
    if (tag === "ResponseEnd") {
      if (this.pendingGoalCheck) {
        this.checked =
          this.getGoals().length === 0 &&
          !this.problems.some((problem) => problem.severity === "error");
        this.pendingGoalCheck = false;
      }
      if (this.pendingCheckStartedAt != null) {
        this.lastCheckDurationMs =
          performance.now() - this.pendingCheckStartedAt;
        this.pendingCheckStartedAt = undefined;
      }
      if (this.pendingLoadSnapshot) {
        let completedLoad = false;
        if (!this.problems.some((problem) => problem.severity === "error")) {
          this.loadedSnapshot = {
            filePath: this.pendingLoadSnapshot.filePath,
            // Cmd_load may expand a `?` into an interaction hole. Store the
            // editor's actual post-response text so the next diff is exact.
            source:
              this.editorView?.state.doc.toString() ??
              this.pendingLoadSnapshot.source,
          };
          completedLoad = true;
        }
        this.pendingLoadSnapshot = undefined;
        if (completedLoad) {
          void persistDriveCache(this.driveHandle).catch((error) =>
            console.warn("Could not persist the Agda cache", error),
          );
        }
      }
      this.lastAction = this.problems.some(
        (problem) => problem.severity === "error",
      )
        ? "Check failed"
        : this.checked
          ? "Checked successfully"
          : "Ready";
      return;
    }
    if (tag !== "ResponseJSONRaw" || !contents) return;

    if (contents.kind === "RunningInfo") {
      this.runningMessages = [
        ...this.runningMessages.slice(-49),
        contents.message,
      ];
      return;
    }
    if (contents.kind === "ClearRunningInfo") {
      this.runningMessages = [];
      return;
    }
    if (contents.kind === "InteractionPoints") {
      this.interactionPoints = contents.interactionPoints.map(
        (point: any) => point.id,
      );
      if (
        this.activeGoalId == null ||
        !this.interactionPoints.includes(this.activeGoalId)
      ) {
        this.activeGoalId = this.interactionPoints[0];
      }
      return;
    }
    if (contents.kind !== "DisplayInfo") return;

    const info = contents.info;
    if (info.kind === "Error") {
      this.problems = [
        {
          severity: "error",
          message: info.error?.message ?? "Agda reported an error",
        },
        ...(info.warnings ?? []).map((warning: any) => ({
          severity: "warning" as const,
          message: warning.message ?? String(warning),
        })),
      ];
      this.lastResult = {
        kind: "Error",
        title: "Type checking failed",
        body: info.error?.message ?? "",
      };
    } else if (info.kind === "AllGoalsWarnings") {
      this.problems = [
        ...(info.errors ?? []).map((error: any) => ({
          severity: "error" as const,
          message: error.message ?? String(error),
        })),
        ...(info.warnings ?? []).map((warning: any) => ({
          severity: "warning" as const,
          message: warning.message ?? String(warning),
        })),
      ];
      this.goalInfo = Object.fromEntries(
        (info.visibleGoals ?? []).flatMap((goal: any) => {
          const id = goal.constraintObj?.id;
          if (typeof id !== "number") return [];
          return [
            [
              id,
              {
                id,
                type: goal.type,
                context: this.goalInfo[id]?.context ?? [],
              },
            ],
          ];
        }),
      );
    } else if (info.kind === "GoalSpecific") {
      const id = info.interactionPoint.id;
      const goalInfo = info.goalInfo;
      if (typeof goalInfo.type === "string") {
        this.goalInfo = {
          ...this.goalInfo,
          [id]: {
            id,
            type: goalInfo.type,
            context:
              goalInfo.kind === "GoalType"
                ? (goalInfo.entries ?? []).map((entry: any) => ({
                    name: entry.reifiedName || entry.originalName,
                    type: entry.binding,
                    inScope: entry.inScope,
                  }))
                : (this.goalInfo[id]?.context ?? []),
          },
        };
        this.lastResult = {
          kind: goalInfo.kind,
          title: `Goal ${id}`,
          body: goalInfo.type,
        };
      } else {
        this.lastResult = {
          kind: goalInfo.kind,
          title: `Goal ${id}`,
          body:
            goalInfo.expr ?? goalInfo.type ?? JSON.stringify(goalInfo, null, 2),
        };
      }
    } else if (info.kind === "InferredType") {
      this.lastResult = {
        kind: info.kind,
        title: "Inferred type",
        body: info.expr,
      };
    } else if (info.kind === "NormalForm") {
      this.lastResult = {
        kind: info.kind,
        title: "Normal form",
        body: info.expr,
      };
    } else if (info.kind === "Context") {
      const context = (info.context ?? []).map((entry: any) => ({
        name: entry.reifiedName || entry.originalName,
        type: entry.binding,
        inScope: entry.inScope,
      }));
      const id = info.interactionPoint.id;
      this.goalInfo = {
        ...this.goalInfo,
        [id]: { id, type: this.goalInfo[id]?.type, context },
      };
      this.lastResult = {
        kind: info.kind,
        title: `Context for goal ${id}`,
        body:
          context
            .map((entry: any) => `${entry.name} : ${entry.type}`)
            .join("\n") || "Empty context",
      };
    } else if (info.kind === "Version") {
      this.lastResult = {
        kind: info.kind,
        title: "Agda version",
        body: info.version,
      };
    }
  }
}
