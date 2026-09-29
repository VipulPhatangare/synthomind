import { format } from "fast-csv";

function flattenValue(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

/** Streams an array of Mongo docs as CSV directly onto an Express response. */
export function streamDocsAsCsv(res, filename, docs) {
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  if (docs.length === 0) {
    res.end("");
    return;
  }
  const keys = new Set();
  for (const d of docs) for (const k of Object.keys(d)) if (k !== "_id") keys.add(k);
  const columns = Array.from(keys);

  const stream = format({ headers: columns });
  stream.pipe(res);
  for (const d of docs) {
    const row = {};
    for (const k of columns) row[k] = flattenValue(d[k]);
    stream.write(row);
  }
  stream.end();
}
