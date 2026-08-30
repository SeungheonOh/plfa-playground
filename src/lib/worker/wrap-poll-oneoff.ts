import * as Runno from '@runno/wasi'
const { Result } = Runno.WASISnapshotPreview1

enum EventType {
  CLOCK = 0,
  FD_READ = 1,
  FD_WRITE = 2,
}

const SubscriptionClockFlags = {
  SUBSCRIPTION_CLOCK_ABSTIME: 1,
}

const SUBSCRIPTION_SIZE = 48
const EVENT_SIZE = 32

type ClockSubscription = {
 type: EventType.CLOCK,
 id: number,
 timeout: number,
 userdata: Uint8Array,
 precision: number,
}

type ReadWriteSubscription = {
  type: EventType.FD_READ | EventType.FD_WRITE,
  fd: number,
  userdata: Uint8Array,
}

/**
 * @param {Uint8Array} userdata
 * @param {number} error
 * @returns {Uint8Array} */
function createClockEvent(userdata: Uint8Array, error: number): Uint8Array {
  const eventBuffer = new Uint8Array(EVENT_SIZE);
  eventBuffer.set(userdata, 0);

  const view = new DataView(eventBuffer.buffer);
  view.setUint16(8, error, true);
  view.setUint16(10, EventType.CLOCK, true);

  return eventBuffer;
}

/**
 * @this {Runno.WASI}
 * @param {Runno.WASI['poll_oneoff']} origPollOneoff
 * @param {(timeout: number) => boolean} pollStdin
 *   called with -1 or a timeout, should (-1) block or (timeout) return whether stdin is ready
 * @returns {Runno.WASI['poll_oneoff']}
 */
export default function wrapPollOneoff(
  this: Runno.WASI,
  origPollOneoff: Runno.WASI['poll_oneoff'],
  pollStdin: (timeout: number) => boolean): Runno.WASI['poll_oneoff'] {

  return (...args) => {
    const [in_ptr, out_ptr, nsubscriptions, retptr0] = args

    const subs = []
    for (let i = 0; i < nsubscriptions; i++) {
      const subscriptionBuffer = new Uint8Array(
        this.memory.buffer,
        in_ptr + i * SUBSCRIPTION_SIZE,
        SUBSCRIPTION_SIZE
      );
      subs.push(readSubscription(subscriptionBuffer));
    }

    let stdinIsReady = true

    const readStdinSub = subs.find(
      s => s.type === EventType.FD_READ && s.fd === 0) as ReadWriteSubscription | undefined
    const clockSub = subs.find(s => s.type === EventType.CLOCK) as ClockSubscription | undefined

    // XXX: only handles the two cases that occurs from GHC RTS
    if (readStdinSub) {
      if (subs.length === 1 && clockSub === undefined) {
        // pure (blocking) fd_read
        pollStdin(-1)
      } else if (subs.length === 2 && clockSub !== undefined) {
        // fd_read + clock
        stdinIsReady = pollStdin(clockSub.timeout)
      }
    }  // TODO: handle the case that other fds are queried

    if (!stdinIsReady) {
      // only reports the clock

      const eventBuffer = new Uint8Array(
        this.memory.buffer,
        out_ptr,
        EVENT_SIZE
      );

      eventBuffer.set(
        createClockEvent(clockSub!.userdata, Result.SUCCESS)
      )

      const returnView = new DataView(this.memory.buffer, retptr0, 4);
      returnView.setUint32(0, 1, true);
      return Result.SUCCESS
    }

    return origPollOneoff(...args)
  }
}

/** @param {Date} date */
function dateToNanoseconds(date: Date) {
  return BigInt(date.getTime()) * BigInt(1e6);
}

/**
 * @param {Uint8Array} buffer
 * @returns { ReadWriteSubscription | ClockSubscription } */
function readSubscription(buffer: Uint8Array): ReadWriteSubscription | ClockSubscription {
  const userdata = new Uint8Array(8);
  userdata.set(buffer.subarray(0, 8));

  const type = buffer[8];

  // View at SubscriptionU offset
  const view = new DataView(buffer.buffer, buffer.byteOffset + 9);
  switch (type) {
    case EventType.FD_READ:
    case EventType.FD_WRITE:
      return {
        userdata,
        type,
        fd: view.getUint32(0, true),
      };
    case EventType.CLOCK:
      const flags = view.getUint16(24, true);
      const currentTimeNanos = dateToNanoseconds(new Date());
      const timeoutRawNanos = view.getBigUint64(8, true);
      const precisionNanos = view.getBigUint64(16, true);

      const timeoutNanos =
        flags & SubscriptionClockFlags.SUBSCRIPTION_CLOCK_ABSTIME
          ? timeoutRawNanos
          : currentTimeNanos + timeoutRawNanos;

      return {
        userdata,
        type,
        id: view.getUint32(0, true),
        timeout: Number(timeoutRawNanos) / 1e6,
        precision: Number(timeoutNanos + precisionNanos) / 1e6,
      };
    default: throw new Error('invalid event type' + type)
  }
}
