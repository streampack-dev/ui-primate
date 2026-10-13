/* A post's recording uploaded from the editor (#33), passed on to the API as it arrives: up to
   100 MB, so it's never held whole, in memory or on disk.

   The browser's form is multipart, its token first and its file last (views/Editor.marko). It's
   read as it comes (busboy): the fields before the file are checked, and the file is then sent on
   as the API's own multipart upload, its one part, chunk by chunk as the API takes them, so a slow
   API slows the browser rather than filling memory. The note and length go in the API's query.

   The part is sent as application/octet-stream, so the API types the file by its first bytes:
   browsers name the same file differently (audio/x-m4a, audio/mp3), and a declared type the API
   doesn't accept would be refused even when the bytes are fine (as ui-pudl's PostRecordings).

   Whatever happens, the rest of the browser's upload is read and dropped before the page answers,
   so a refused upload gets its message rather than a dropped connection. */
import busboy from "busboy";
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import type { Readable as NodeReadable } from "node:stream";
import { sendStream } from "#api/client.ts";
import { csrfOk } from "#auth/readers.ts";
import { KIND, MAX_BYTES, parseLength } from "#lib/audio.ts";

/** Room for the form's other fields and the multipart framing around the file. */
export const OVERHEAD = 64 * 1024;

/** How long the API is given to take the whole upload and store it: 10 minutes, as ui-pudl. */
const UPLOAD_TIMEOUT_MS = 10 * 60_000;

/** Most of a refused upload read and dropped, so the browser sees the answer; past this, the
   connection is left to close. */
const DRAIN_LIMIT = MAX_BYTES + 10 * 1024 * 1024;

export type Relayed =
  | { kind: "answered"; response: Response }
  | { kind: "forbidden" }
  | { kind: "refused"; notice: string; status: number };

export const TOO_BIG = "The recording is over 100 MB.";
const NO_FILE = "Choose a recording to upload.";
const BAD_LENGTH = "Give the length in seconds, or as minutes:seconds, or leave it empty.";
const BROKEN = "The upload didn't arrive whole. Try again.";
const UNREACHED = "The recording didn't reach the API: it isn't answering just now. Try again shortly.";

/** Reads what's left of [body], dropping it, up to [DRAIN_LIMIT] bytes. */
export async function drain(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body) return;
  const reader = body.getReader();
  let read = 0;
  try {
    while (read <= DRAIN_LIMIT) {
      const { done, value } = await reader.read();
      if (done) return;
      read += value.byteLength;
    }
    await reader.cancel();
  } catch {
    // The browser went; nothing to answer.
  }
}

/** Passes the upload in [body] (of [contentType]) on to the API as post [id]'s recording, with
   [access] as the admin's token. */
export function relay(id: string, body: ReadableStream<Uint8Array>, contentType: string, access: string): Promise<Relayed> {
  return new Promise((resolve) => {
    let parser: busboy.Busboy;
    try {
      parser = busboy({ headers: { "content-type": contentType }, limits: { files: 1, fileSize: MAX_BYTES, fields: 10, fieldSize: 2000, parts: 12 } });
    } catch {
      void drain(body).then(() => resolve({ kind: "refused", notice: NO_FILE, status: 400 }));
      return;
    }
    const fields: Record<string, string> = {};
    let outcome: Relayed | null = null;
    let answer: Promise<Relayed> | null = null;
    let sending: { abort: () => void; drop: () => void } | null = null;
    let tooBig = false;

    // The first word on it stands; the rest of the upload is still read and dropped.
    const decide = (o: Relayed) => { outcome ??= o; };

    parser.on("field", (name, value) => { fields[name] = value; });
    parser.on("file", (name, file, info) => {
      if (name !== "file" || answer || outcome) return void file.resume();
      // A form sent with no file chosen has the part, empty and unnamed.
      if (!info.filename) {
        decide({ kind: "refused", notice: NO_FILE, status: 400 });
        return void file.resume();
      }
      if (!csrfOk(fields.csrf)) {
        decide({ kind: "forbidden" });
        return void file.resume();
      }
      const typed = (fields.duration || "").trim();
      const duration = typed ? parseLength(typed) : null;
      if (typed && duration === null) {
        decide({ kind: "refused", notice: BAD_LENGTH, status: 400 });
        return void file.resume();
      }
      const query = new URLSearchParams();
      if (fields.note?.trim()) query.set("note", fields.note.trim());
      if (duration !== null) query.set("duration", String(duration));
      const out = outgoing(file);
      sending = out;
      file.on("limit", () => {
        tooBig = true;
        out.abort();
      });
      answer = sendStream("POST", `/admin/posts/${id}/versions/${KIND}${query.size ? `?${query}` : ""}`, out.stream, out.contentType,
        { Authorization: `Bearer ${access}` }, { timeoutMs: UPLOAD_TIMEOUT_MS, signal: out.signal })
        .then((response): Relayed => ({ kind: "answered", response }))
        .catch((): Relayed => (tooBig ? { kind: "refused", notice: TOO_BIG, status: 413 } : { kind: "refused", notice: UNREACHED, status: 503 }))
        // An API that answered before taking all of it (a refusal) leaves the rest to be dropped.
        .finally(() => out.drop());
    });

    let ended = false;
    const end = async (broken: boolean) => {
      if (ended) return;
      ended = true;
      if (broken) {
        sending?.abort();
        sending?.drop();
        decide({ kind: "refused", notice: BROKEN, status: 400 });
      }
      const sent = answer ? await answer : null;
      if (tooBig) return resolve({ kind: "refused", notice: TOO_BIG, status: 413 });
      resolve(outcome ?? sent ?? { kind: "refused", notice: NO_FILE, status: 400 });
    };
    const incoming = Readable.fromWeb(body as never) as NodeReadable;
    parser.on("close", () => void end(false));
    parser.on("error", () => {
      // What's left of a form that can't be read is read and dropped, so the browser gets the answer.
      incoming.unpipe(parser);
      incoming.resume();
      void end(true);
    });
    incoming.on("error", () => void end(true));
    incoming.pipe(parser);
  });
}

/** The API's multipart upload of [file], its one part, as a stream read as the API takes it. */
function outgoing(file: NodeReadable) {
  const boundary = `----bcn-${randomBytes(12).toString("hex")}`;
  const encode = (s: string) => new TextEncoder().encode(s);
  const head = encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="recording"\r\nContent-Type: application/octet-stream\r\n\r\n`);
  const tail = encode(`\r\n--${boundary}--\r\n`);
  const aborter = new AbortController();
  let control: ReadableStreamDefaultController<Uint8Array>;
  let dropping = false;

  // From now on the file is read and dropped, not sent.
  const drop = () => {
    if (dropping) return;
    dropping = true;
    file.resume();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      control = c;
      c.enqueue(head);
    },
    pull() {
      file.resume();
    },
    cancel() {
      drop();
    },
  });
  file.on("data", (chunk: Buffer) => {
    if (dropping) return;
    try {
      control.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
      if ((control.desiredSize ?? 0) <= 0) file.pause();
    } catch {
      drop();
    }
  });
  file.on("end", () => {
    if (dropping) return;
    try {
      control.enqueue(tail);
      control.close();
    } catch {
      // Already done with.
    }
  });
  return {
    stream,
    contentType: `multipart/form-data; boundary=${boundary}`,
    signal: aborter.signal,
    abort: () => aborter.abort(),
    drop,
  };
}
