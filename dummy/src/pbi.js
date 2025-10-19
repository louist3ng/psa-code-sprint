import "dotenv/config";

async function readBodyIfError(res, label) {
    if (res.ok) return;
    const text = await res.text().catch(() => "<no-body>");
    throw new Error(`${label} ${res.status}: ${text}`);
}

async function getAadToken() {
    const url = `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: "client_credentials",
        scope: "https://analysis.windows.net/powerbi/api/.default"
    });
    const r = await fetch(url, { method: "POST", body });
    if (!r.ok) throw new Error(`AAD token error ${r.status}`);
    return r.json(); // { access_token, expires_in, ... }   
}

async function getReport({ accessToken, groupId, reportId }) {
    const r = await fetch(
        `https://api.powerbi.com/v1.0/myorg/groups/${groupId}/reports/${reportId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!r.ok) throw new Error(`Get report error ${r.status}`);
    return r.json(); // { id, name, embedUrl, datasetId, ... }
}

async function generateEmbedToken({ accessToken, groupId, reportId }) {
    const r = await fetch(
        `https://api.powerbi.com/v1.0/myorg/groups/${groupId}/reports/${reportId}/GenerateToken`,
        {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ accessLevel: "View" })
        }
    );
    if (!r.ok) throw new Error(`Generate token error ${r.status}`);
    return r.json(); // { token, expiration, ... }
}

async function executeDax({ accessToken, datasetId, dax }) {
    const r = await fetch(
        `https://api.powerbi.com/v1.0/myorg/datasets/${datasetId}/executeQueries`,
        {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                queries: [{ query: dax }],
                serializerSettings: { includeNulls: true }
            })
        }
    );
    if (!r.ok) throw new Error(`DAX error ${r.status}`);
    return r.json(); // Power BI executeQueries result
}

/** Utility: read single-row result of EVALUATE ROW(...) into a plain object */
function rowObjectFromExecuteQueries(json) {
    const tables = json?.results?.[0]?.tables;
    if (!tables?.length) return {};
    const t = tables[0];
    const { columns, rows } = t;
    if (!rows?.length) return {};
    const row = rows[0];
    const obj = {};
    columns.forEach((col, i) => { obj[col.name] = row[i]; });
    return obj;
}

/** Utility: read tabular result (for top vessels, etc.) */
function rowsFromExecuteQueries(json) {
    const tables = json?.results?.[0]?.tables;
    if (!tables?.length) return [];
    const t = tables[0];
    const { columns, rows } = t;
    return rows.map(r => {
        const o = {};
        columns.forEach((c, i) => o[c.name] = r[i]);
        return o;
    });
}

export {
    readBodyIfError,
    getAadToken,
    getReport,
    generateEmbedToken,
    executeDax,
    rowObjectFromExecuteQueries,
    rowsFromExecuteQueries
};
