/** @import { Transport } from '@codemirror/lsp-client' */
/** @import { EditorView } from '@codemirror/view' */

import { Message } from "@andy0130tw/vscode-jsonrpc-esm";
import { LSPMessageDecoder } from "./lsp";
import { makeLSPResponseHandlerMap } from "./handlers";

/** @typedef {'init' | 'ready' | 'requested' | 'processing'} AgdaIOTCMStatus */

/** @import { ResponseMessage, NotificationMessage, RequestMessage } from 'vscode-languageserver-protocol' */
/** @typedef {ResponseMessage | NotificationMessage | RequestMessage} LSPPayload */

export class ALSMessageRouter {
  /**
   * @param {EditorView} editorView
   * @param {(tag: import('./handlers').ALSResponseType, contents: any) => void} msgCallback - The hook that gets called with Agda-method messages
   * @param {(status: AgdaIOTCMStatus) => void} statusCallback  The hook that gets called with worker status changes
   */
  constructor(editorView, msgCallback, statusCallback) {
    /** @type {AgdaIOTCMStatus} */
    this.status = "init";
    /** @type {((s: string) => void)[]} */
    this.handlers = [];

    /** @type {WritableStream<Uint8Array> | null} */
    this.rpcSink = null;

    this.editorView = editorView;
    this.handleRequest = msgCallback;
    this.handleStatusChange = statusCallback;

    this.checked = false;
    this.showImplicitArgs = false;
    this.showIrrelevantArgs = false;

    this.cmEncoder = new TextEncoder();

    /** @type {Transport} */
    this.transport = {
      send: this.cmSend.bind(this),
      subscribe: this.cmSubscribe.bind(this),
      unsubscribe: this.cmUnsubscribe.bind(this),
    };
  }

  /** @type {Transport['send']} */
  cmSend(message) {
    if (this.rpcSink == null) {
      throw new Error("RPC sink is not set");
    }

    if (this.status === "init") {
      const pp = JSON.parse(message);
      if (Message.isNotification(pp) && pp.method === "initialized") {
        this.setStatus("ready");
      }
    } else if (this.status === "ready") {
      const pp = JSON.parse(message);
      if (Message.isRequest(pp) && pp.method === "agda") {
        this.setStatus("requested");
      }
    }

    const encoded = this.cmEncoder.encode(message);
    const header = this.cmEncoder.encode(
      `Content-Length: ${encoded.byteLength}\r\n\r\n`,
    );
    const wr = this.rpcSink.getWriter();
    // XXX: does not wait the write to complete, but errors are not handled
    wr.write(header).catch(console.error);
    wr.write(encoded).catch(console.error);
    wr.releaseLock();
  }

  /** @type {Transport['subscribe']} */
  cmSubscribe(hh) {
    this.handlers.push(hh);
  }

  /** @type {Transport['unsubscribe']} */
  cmUnsubscribe(hh) {
    const idx = this.handlers.indexOf(hh);
    if (idx >= 0) {
      const hhs = this.handlers;
      this.handlers = hhs
        .slice(0, idx)
        .concat(hhs.slice(idx + 1).filter((h) => h !== hh));
    }
  }

  /** @param {AgdaIOTCMStatus} s */
  setStatus(s) {
    if (this.status === s) return;
    // FIXME: add state transition checks
    this.status = s;
    this.handleStatusChange(s);
  }

  /**
   * @param {ReadableStream<Uint8Array>} workerReadable
   * @param {WritableStream<Uint8Array>} workerWritable
   */
  async intercept(workerReadable, workerWritable) {
    /** @type {UnderlyingSink<string>['write']} */
    const write = (msg) => {
      /** @type {LSPPayload} */
      const pp = JSON.parse(msg);
      // We MUST filter out requests from als and reply with our custom ACK to ensure synchronizations
      if (Message.isRequest(pp)) {
        // payload is a request message, and we must not pass it to lsp-client
        this.transport.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: pp.id,
            result: null,
          }),
        );
        if (pp.method === "agda") {
          const tag = /** @type {any} */ (pp.params)?.tag;
          if (tag === "ResponseEnd") {
            this.setStatus("ready");
            this.handleRequest(tag, /** @type {any} */ (pp.params).contents);
          } else {
            this.handleRequest(tag, /** @type {any} */ (pp.params).contents);
          }
        }
      } else {
        if (Message.isResponse(pp)) {
          /** @type {any} */
          const { result } = pp;
          if (result?.tag === "CmdRes") {
            if (result?.contents == null) {
              this.setStatus("processing");
            } else {
              console.warn(
                "failed to send cmd:",
                result.contents.tag,
                result.contents.contents,
              );
              this.setStatus("ready");
            }
          }
        }
        return this.forwardIncomingMessage(msg);
      }
    };

    this.rpcSink = workerWritable;

    return workerReadable
      .pipeThrough(new TransformStream(new LSPMessageDecoder()))
      .pipeTo(new WritableStream({ write }));
  }

  /** @param {string} msg */
  forwardIncomingMessage(msg) {
    for (const h of this.handlers) {
      h(msg);
    }
  }
}

/**
 * @param {EditorView} editorView  The editor the transport will attach to
 * @param {(status: AgdaIOTCMStatus) => void} statusCallback  The hook that gets called with worker status changes
 * @param {(tag: string, contents: any) => void} [responseCallback]
 * @param {any} [handlerController]
 * @returns {ALSMessageRouter}
 */
export function makeLSPTransport(
  editorView,
  statusCallback,
  responseCallback = () => {},
  handlerController,
) {
  const router = new ALSMessageRouter(editorView, msgCallback, statusCallback);
  const handlerMap = makeLSPResponseHandlerMap(
    handlerController ?? router,
    editorView,
  );

  /**
   * @param {string} tag
   * @param {any} contents
   */
  function msgCallback(tag, contents) {
    if (tag in handlerMap) {
      // @ts-ignore
      const handler = handlerMap[tag];
      const result = handler.call(router, contents);
      responseCallback(tag, contents);
      return result;
    }
    responseCallback(tag, contents);
    if (tag === "ResponseEnd") return;
    console.warn("Unrecognized resp", { tag, contents });
  }

  return router;
}
