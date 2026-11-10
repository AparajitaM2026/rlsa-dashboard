// Stream-extract a CSV from an uploaded compressed archive (.gz / .zip) into a
// ReadableStream of decompressed bytes — never materialising the full
// decompressed payload in memory. gzip uses the built-in DecompressionStream;
// a zip entry's raw deflate stream uses DecompressionStream("deflate-raw").
// The compressed archive itself is small (the whole point of compression), so
// loading it fully into memory to parse its central directory is safe.

export type ArchiveType = "gzip" | "zip" | null;

export function detectArchive(url: string): ArchiveType {
  if (!url) return null;
  const path = url.split("?")[0].split("#")[0].toLowerCase();
  if (path.endsWith(".zip")) return "zip";
  if (path.endsWith(".gz") || path.endsWith(".gzip")) return "gzip";
  return null;
}

const sub = (bytes: Uint8Array, start: number, len: number) =>
  bytes.subarray(start, start + len);

/**
 * Return a ReadableStream of decompressed CSV bytes from a .gz or .zip URL.
 */
export async function getDecompressedCsvStream(
  url: string
): Promise<ReadableStream<Uint8Array>> {
  const archive = detectArchive(url);
  if (!archive) throw new Error(`Unsupported archive: ${url}`);

  if (archive === "gzip") {
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download archive (HTTP ${res.status})`);
    }
    return res.body.pipeThrough(new DecompressionStream("gzip"));
  }

  // zip — load the (small) compressed archive, locate the first .csv entry via
  // the central directory, then stream its raw deflate data through
  // DecompressionStream("deflate-raw").
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download archive (HTTP ${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // 1. End-of-Central-Directory record (scan from the tail; comment ≤ 64k).
  let eocd = -1;
  const scanFrom = Math.max(0, bytes.length - 65557);
  for (let i = scanFrom; i <= bytes.length - 4; i++) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("Invalid zip: end-of-central-directory not found");
  const totalEntries = dv.getUint16(eocd + 10, true);
  const cdOffset = dv.getUint32(eocd + 16, true);

  // 2. Walk the central directory to find the first .csv entry.
  let entry: { method: number; compSize: number; localOffset: number } | null = null;
  let p = cdOffset;
  for (let n = 0; n < totalEntries && entry == null; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) {
      throw new Error("Invalid zip: bad central directory entry");
    }
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(sub(bytes, p + 46, nameLen)).toLowerCase();
    if (name.endsWith(".csv")) entry = { method, compSize, localOffset };
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (!entry) throw new Error("No .csv file found inside the zip archive");

  // 3. Parse the entry's local header to locate the start of its data.
  if (dv.getUint32(entry.localOffset, true) !== 0x04034b50) {
    throw new Error("Invalid zip: bad local file header");
  }
  const localNameLen = dv.getUint16(entry.localOffset + 26, true);
  const localExtraLen = dv.getUint16(entry.localOffset + 28, true);
  const dataStart = entry.localOffset + 30 + localNameLen + localExtraLen;
  const data = sub(bytes, dataStart, entry.compSize);

  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });

  if (entry.method === 0) return source; // stored, no compression
  if (entry.method === 8) return source.pipeThrough(new DecompressionStream("deflate-raw"));
  throw new Error(`Unsupported zip compression method: ${entry.method}`);
}

// --- Streaming fragment cutter -------------------------------------------------
// Splits the decompressed CSV stream into ~maxByte fragments cut at row
// boundaries, each PREPENDED with the header line so every fragment is a
// standalone CSV. Only ~maxByte (+ one row) is held in memory at a time, so
// arbitrarily large decompressed payloads never exceed the function memory
// limit. This is what makes compressed uploads feasible: extract once into
// seekable plain-CSV fragments, then route each without re-decompressing.

const concat = (a: Uint8Array, b: Uint8Array) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

// Byte offset just past the first newline outside quotes (end of header line),
// or -1 if not yet present.
function headerEndOffset(bytes: Uint8Array): number {
  let inQuotes = false;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (inQuotes) {
      if (b === 0x22) { if (bytes[i + 1] === 0x22) i++; else inQuotes = false; }
    } else if (b === 0x22) {
      inQuotes = true;
    } else if (b === 0x0a) {
      return i + 1;
    } else if (b === 0x0d) {
      return i + (bytes[i + 1] === 0x0a ? 2 : 1);
    }
  }
  return -1;
}

// Byte offset just past the last row boundary (newline outside quotes) within
// the buffer, or 0 if none found (a single row larger than the window).
function lastRowBoundary(bytes: Uint8Array): number {
  let inQuotes = false;
  let last = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (inQuotes) {
      if (b === 0x22) { if (bytes[i + 1] === 0x22) i++; else inQuotes = false; }
    } else if (b === 0x22) {
      inQuotes = true;
    } else if (b === 0x0a) {
      last = i + 1;
    } else if (b === 0x0d) {
      if (bytes[i + 1] !== 0x0a) last = i + 1;
    }
  }
  return last;
}

async function* fragmentDecompressedCsv(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number
): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let headerBytes: Uint8Array | null = null;

  const combine = (): Uint8Array => {
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;

      // Peel off the header line once we have it.
      if (!headerBytes) {
        const buf = combine();
        const he = headerEndOffset(buf);
        if (he !== -1) {
          headerBytes = buf.subarray(0, he);
          const rest = buf.subarray(he);
          chunks.length = 0;
          chunks.push(rest);
          total = rest.length;
        } else {
          continue; // header not complete yet; keep buffering (it's tiny)
        }
      }

      if (total >= maxBytes) {
        const buf = combine();
        const boundary = lastRowBoundary(buf);
        if (boundary === 0) continue; // a single row exceeds maxBytes; keep going
        const data = buf.subarray(0, boundary);
        const remainder = buf.subarray(boundary);
        yield concat(headerBytes!, data);
        chunks.length = 0;
        chunks.push(remainder);
        total = remainder.length;
      }
    }

    // Final fragment (whatever remains, header-prepended).
    if (total > 0 && headerBytes) {
      yield concat(headerBytes, combine());
    }
  } finally {
    reader.releaseLock?.();
  }
}

/**
 * Extract the CSV from a .gz / .zip archive into public storage ONCE, as a list
 * of ~10MB plain-CSV fragment files (each a standalone CSV with the header).
 * Streaming the decompressed payload keeps memory bounded (~10MB peak), and
 * because the fragments are plain CSV they can be routed with instant seek —
 * no re-decompression per chunk.
 */
export async function extractCompressedCsvToStorage(
  base44: any,
  url: string
): Promise<{ file_urls: string[] }> {
  const stream = await getDecompressedCsvStream(url);
  const baseName = (url.split("?")[0].split("#")[0].split("/").pop() || "upload")
    .replace(/\.(csv\.)?(gz|gzip|zip)$/i, "") || "extracted";
  const file_urls: string[] = [];
  let i = 0;
  for await (const frag of fragmentDecompressedCsv(stream, 10 * 1024 * 1024)) {
    const file = new File([frag], `${baseName}.part${i}.csv`, { type: "text/csv" });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    file_urls.push(file_url);
    i++;
  }
  return { file_urls };
}