// Memory-safe streaming CSV parser. Fetches the file as a stream and yields
// rows one at a time without loading the whole file into memory.
// Handles quoted fields, embedded commas, and newlines inside quotes.

export async function* parseCsvStream(
  body: ReadableStream<Uint8Array>,
  opts: { delimiter?: string; onChunk?: (bytes: number) => void } = {}
) {
  const delimiter = opts.delimiter || ",";
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");

  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let isFirstRow = true;
  let pending: string[][] = [];

  const consume = (text: string) => {
    pending = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          row.push(field);
          field = "";
        } else if (ch === "\n" || ch === "\r") {
          if (ch === "\r" && text[i + 1] === "\n") i++;
          row.push(field);
          field = "";
          // skip fully blank lines
          if (row.length > 1 || row[0] !== "") pending.push(row);
          row = [];
        } else {
          field += ch;
        }
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (opts.onChunk) opts.onChunk(value.byteLength);
    consume(decoder.decode(value, { stream: true }));
    for (const r of pending) yield r;
  }

  // Flush decoder + any trailing field/row.
  consume(decoder.decode());
  for (const r of pending) yield r;
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") yield row;
  }
}

// Strip a leading UTF-8 BOM if present.
export const stripBom = (s: string) => (s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

// Parse a complete text block (already cut at row boundaries) into rows.
function parseCsvText(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
  }
  // Trailing row without a final newline (eof case).
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

// Parse a bounded byte chunk that starts at a row boundary. Returns the
// complete rows it contains and the byte length consumed (up to and including
// the last complete row's terminator). Any trailing partial row is left for
// the next chunk. `eof` marks the final chunk of the file (its last row may
// have no terminator and is still emitted).
export function parseCsvBytes(
  bytes: Uint8Array,
  eof: boolean,
  opts: { delimiter?: string } = {}
): { rows: string[][]; consumed: number } {
  const delimiter = opts.delimiter || ",";
  // 1. Quote-aware byte scan for the boundary after the last complete row.
  // Newline (0x0A) and quote (0x22) are single-byte ASCII, never part of a
  // multibyte UTF-8 sequence, so a byte-level scan is safe for UTF-8 text.
  let inQuotes = false;
  let lastBoundary = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (inQuotes) {
      if (b === 0x22) {
        if (bytes[i + 1] === 0x22) i++;
        else inQuotes = false;
      }
    } else {
      if (b === 0x22) {
        inQuotes = true;
      } else if (b === 0x0a) {
        lastBoundary = i + 1;
      } else if (b === 0x0d) {
        if (bytes[i + 1] !== 0x0a) lastBoundary = i + 1;
      }
    }
  }
  let consumed = lastBoundary;
  if (eof && lastBoundary < bytes.length) {
    // final row with no trailing terminator — include it
    consumed = bytes.length;
  }
  if (consumed === 0 && bytes.length > 0 && !eof) {
    // No complete row fits in this chunk (a single row larger than the chunk).
    return { rows: [], consumed: 0 };
  }
  // 2. Decode the complete portion and parse rows.
  const text = new TextDecoder("utf-8").decode(bytes.subarray(0, consumed));
  return { rows: parseCsvText(text, delimiter), consumed };
}