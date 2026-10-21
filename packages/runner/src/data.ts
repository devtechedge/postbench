/** Parses an iteration data file (JSON array of objects or CSV with a header row). */
export function parseDataFile(text: string, hint?: string): Record<string, unknown>[] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const trimmed = body.trim();
  if (hint?.endsWith(".json") || (!hint?.endsWith(".csv") && (trimmed.startsWith("[") || trimmed.startsWith("{")))) {
    const data = JSON.parse(trimmed);
    if (!Array.isArray(data)) throw new Error("JSON data file must contain an array of objects");
    return data;
  }
  return parseCsv(body);
}

/**
 * CSV with a header row, following the options newman passes to csv-parse:
 * quoted fields may contain commas, newlines and doubled quotes; unquoted
 * fields are trimmed, keep stray quotes literally and are cast to numbers
 * when they look numeric; quoted fields always stay strings.
 */
export function parseCsv(text: string): Record<string, unknown>[] {
  type Field = { v: string; quoted: boolean };
  const rows: Field[][] = [];
  let row: Field[] = [];
  let i = 0;
  const n = text.length;
  const endRow = () => {
    rows.push(row);
    row = [];
  };
  while (i <= n) {
    // Parse one field starting at i.
    let j = i;
    while (j < n && (text[j] === " " || text[j] === "\t")) j++;
    if (text[j] === '"') {
      let v = "";
      j++;
      for (;;) {
        if (j >= n) break;
        if (text[j] === '"') {
          if (text[j + 1] === '"') {
            v += '"';
            j += 2;
            continue;
          }
          j++;
          break;
        }
        v += text[j++];
      }
      while (j < n && text[j] !== "," && text[j] !== "\n" && text[j] !== "\r") j++;
      row.push({ v, quoted: true });
    } else {
      let k = i;
      while (k < n && text[k] !== "," && text[k] !== "\n" && text[k] !== "\r") k++;
      row.push({ v: text.slice(i, k).trim(), quoted: false });
      j = k;
    }
    if (j >= n) {
      endRow();
      break;
    }
    if (text[j] === ",") {
      i = j + 1;
      continue;
    }
    if (text[j] === "\r" && text[j + 1] === "\n") j++;
    endRow();
    i = j + 1;
    if (i >= n) break;
  }
  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0]!.v === "" && !r[0]!.quoted));
  const [header, ...rest] = nonEmpty;
  if (!header) return [];
  const cast = (f: Field | undefined): unknown => {
    if (!f) return "";
    if (!f.quoted && /^-?\d+(\.\d+)?$/.test(f.v) && Number.isSafeInteger(Math.trunc(Number(f.v)))) return Number(f.v);
    return f.v;
  };
  return rest.map((r) => Object.fromEntries(header.map((h, idx) => [h.v.trim(), cast(r[idx])])));
}
