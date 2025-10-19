// src/xlsxHelper.js
const XLSX = require("xlsx");

const MAX_ROWS = 10; // keep prompts small
const MAX_COLS = 8;

function summarizeSheet(ws, name) {
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
    if (!rows.length) return `\n=== Sheet: ${name} ===\n(empty)`;

    const cols = Object.keys(rows[0]).slice(0, MAX_COLS);
    const sample = rows.slice(0, MAX_ROWS).map((r, i) => {
        const o = {};
        cols.forEach(c => (o[c] = r[c]));
        return `${i + 1}. ${JSON.stringify(o)}`;
    });

    // very light numeric aggregates
    const numCols = cols.filter(c => rows.every(r => r[c] == null || typeof r[c] === "number"));
    const aggs = numCols.map(c => {
        const vals = rows.map(r => r[c]).filter(v => typeof v === "number");
        const n = vals.length;
        const sum = vals.reduce((a, b) => a + b, 0);
        const mean = n ? sum / n : null;
        return `${c}{n=${n}, sum=${sum}, mean=${mean == null ? "NA" : mean.toFixed(3)}}`;
    });

    return [
        `\n=== Sheet: ${name} ===`,
        `Columns: ${cols.join(", ")}`,
        aggs.length ? `Aggregates: ${aggs.join(" | ")}` : "Aggregates: (none)",
        "Sample (first 10 rows):",
        ...sample
    ].join("\n");
}

function buildCardsFromXlsxFile(filepath, maxChars = 80_000) {
    const wb = XLSX.readFile(filepath); // reads from disk
    let out = "";
    for (const name of wb.SheetNames) {
        const card = summarizeSheet(wb.Sheets[name], name);
        if (out.length + card.length > maxChars) break;
        out += card + "\n";
    }
    return out || "(workbook empty)";
}

module.exports = { buildCardsFromXlsxFile };
