// src/aiHelper.js
const fetch = require("node-fetch");
const { buildCardsFromCsvs } = require("./chatHelper.js");

// Cache: by reportId, and also a global "last uploaded" fallback
const latestVisualsByReport = new Map();
let lastUploadedSnapshot = null;

function cacheVisuals(reportId, workspaceId, visuals) {
    const snapshot = {
        at: new Date().toISOString(),
        workspaceId: workspaceId || "",
        visuals: visuals || []
    };
    latestVisualsByReport.set(reportId, snapshot);
    lastUploadedSnapshot = snapshot; // keep a fallback
}

function buildCsvContext(reportId, maxChars = 80_000) {
    let src = null;
    if (reportId && latestVisualsByReport.has(reportId)) {
        src = latestVisualsByReport.get(reportId);
    } else if (lastUploadedSnapshot) {
        src = lastUploadedSnapshot;
    }
    if (!src || !src.visuals?.length) return "(no synced visuals)";
    return buildCardsFromCsvs(src.visuals, maxChars);
}

async function callAzureOpenAI(messages) {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const key = process.env.AZURE_OPENAI_API_KEY;
    const dep = process.env.AZURE_OPENAI_DEPLOYMENT;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview";

    if (!endpoint || !key || !dep) {
        throw new Error("Azure OpenAI env vars missing: set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT");
    }

    const url = `${endpoint}/openai/deployments/${dep}/chat/completions?api-version=${apiVersion}`;

    // Build both header variants (APIM often uses Ocp-Apim-Subscription-Key)
    const isApim = /\.developer\.azure-api\.net$/i.test(new URL(endpoint).host);
    const headersList = isApim
        ? [
            { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/json" },
            { "api-key": key, "Content-Type": "application/json" },
        ]
        : [
            { "api-key": key, "Content-Type": "application/json" },
        ];

    const body = JSON.stringify({ messages, temperature: 0.2, max_tokens: 900 });

    let lastErr = null;
    for (const headers of headersList) {
        try {
            const r = await fetch(url, { method: "POST", headers, body });
            const text = await r.text();
            if (!r.ok) {
                lastErr = new Error(`Azure call failed [${r.status}]: ${text}`);
                continue;
            }
            const json = JSON.parse(text);
            return json?.choices?.[0]?.message?.content?.trim() || "No answer.";
        } catch (e) {
            lastErr = e;
            continue;
        }
    }
    throw lastErr || new Error("Azure call failed with unknown error.");
}

module.exports = { cacheVisuals, buildCsvContext, callAzureOpenAI };
