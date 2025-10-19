// src/chatHelper.js
// Build compact cards from raw CSV strings (first 12 lines per visual)
function takeFirstLines(csv, n) {
    if (!csv) return "";
    const lines = csv.split(/\r?\n/);
    return lines.slice(0, n).join("\n");
}

function buildCardsFromCsvs(visuals, maxChars = 80_000) {
    let out = "";
    for (const v of visuals) {
        const snippet = takeFirstLines(v.csv || "", 12);
        const card = [
            `\n=== ${v.pageName} / ${v.visualName} ===`,
            "CSV (first 12 lines):",
            snippet
        ].join("\n");
        if (out.length + card.length > maxChars) break;
        out += card + "\n";
    }
    return out || "(no synced visuals)";
}

module.exports = { buildCardsFromCsvs };
