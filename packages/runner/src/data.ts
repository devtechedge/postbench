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

/** RFC 4180 CSV with quoted fields, escaped quotes and CRLF; first row is the header. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field === "") inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0] === ""));
  const [header, ...rest] = nonEmpty;
  if (!header) return [];
  return rest.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}
