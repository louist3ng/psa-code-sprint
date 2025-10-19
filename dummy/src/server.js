import "dotenv/config";
import express from "express";
import cors from "cors";
import { OpenAIClient, AzureKeyCredential } from "@azure/openai";

import {
    getAadToken,
    getReport,
    generateEmbedToken,
    executeDax,
    rowObjectFromExecuteQueries,
    rowsFromExecuteQueries
} from "./pbi.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import {
    daxBundleKpisWoW,
    daxBundleKpisMTD,
    daxTopVesselsByVarianceWoW
} from "./dax.js";

const app = express();
app.use(express.json());

// ---- CORS (safe default if env missing) ----
const ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:8501";
app.use(
    cors({
        origin: ORIGIN,
        credentials: true,
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

// ---- Simple request logger ----
app.use((req, _res, next) => {
    console.log(`[REQ] ${req.method} ${req.originalUrl}`);
    next();
});


// ---- AAD token cache ----
let aad = { token: null, exp: 0 };
async function ensureAadToken() {
    const now = Date.now() / 1000;
    if (!aad.token || now > aad.exp - 60) {
        const t = await getAadToken();
        aad.token = t.access_token;
        aad.exp = now + (t.expires_in || 3600);
    }
    return aad.token;
}

async function getDatasetId() {
    const accessToken = await ensureAadToken();
    const r = await getReport({
        accessToken,
        groupId: process.env.WORKSPACE_ID,
        reportId: process.env.REPORT_ID,
    });
    return r.datasetId;
}

// ---- Health ----
app.get("/health", (_req, res) => res.json({ ok: true }));

// ---- Embed config ----
app.get("/api/pbi/embed-config", async (_req, res) => {
    try {
        const accessToken = await ensureAadToken();
        const r = await getReport({
            accessToken,
            groupId: process.env.WORKSPACE_ID,
            reportId: process.env.REPORT_ID,
        });
        const tok = await generateEmbedToken({
            accessToken,
            groupId: process.env.WORKSPACE_ID,
            reportId: process.env.REPORT_ID,
        });
        res.json({ embedUrl: r.embedUrl, embedToken: tok.token, reportId: r.id });
    } catch (e) {
        console.error("embed-config error:", e);
        res.status(500).json({ error: String(e) });
    }
});

// ---- KPIs (Power BI DAX) ----
app.get("/api/kpis", async (_req, res) => {
    try {
        const accessToken = await ensureAadToken();
        const datasetId = await getDatasetId();

        const wowResp = await executeDax({
            accessToken,
            datasetId,
            dax: daxBundleKpisWoW(),
        });
        const wow = rowObjectFromExecuteQueries(wowResp);

        const mtdResp = await executeDax({
            accessToken,
            datasetId,
            dax: daxBundleKpisMTD(),
        });
        const mtd = rowObjectFromExecuteQueries(mtdResp);

        const pack = (cur, prev, unit, window) => ({
            value: cur == null ? null : round(cur),
            delta: cur != null && prev != null ? round(cur - prev) : null,
            unit,
            window,
        });

        const kpis = {
            arrival_accuracy: pack(
                wow.arrival_accuracy_cur,
                wow.arrival_accuracy_prev,
                "%",
                "WoW"
            ),
            within_4h: pack(wow.within4h_cur, wow.within4h_prev, "%", "WoW"),
            avg_berth_h: pack(wow.avg_berth_cur, wow.avg_berth_prev, "h", "WoW"),
            carbon_tonnes: pack(mtd.carbon_cur, mtd.carbon_prev, "t", "MTD"),
        };

        const topResp = await executeDax({
            accessToken,
            datasetId,
            dax: daxTopVesselsByVarianceWoW(5),
        });
        const topVessels = rowsFromExecuteQueries(topResp);

        res.json({ kpis, topVessels });
    } catch (e) {
        console.error("KPI error:", e);
        res.status(500).json({ error: String(e) });
    }
});

// ---- Conversational insights ----
app.post("/api/ask", async (req, res) => {
    try {
        const question = String(req.body?.question || "").trim().slice(0, 2000);
        if (!question) return res.status(400).json({ error: "Missing 'question' in JSON body" });

        const MODE = (process.env.ASK_MODE || "llm_only").toLowerCase();

        // --- Mode: stub (no OpenAI, no Power BI) ---
        if (MODE === "stub") {
            const answer =
                `### Executive Summary
- I don’t have live KPIs loaded, but here’s a concise readout and suggested actions based on PSA’s global strategy.

### What I’d look at
- Arrival accuracy trend (WoW/MTD), within-4h rate, avg berth time, and carbon abatement.
- Top vessels / lanes with schedule variance; terminals with recurring delays.

### Likely drivers (hypotheses)
- Berth conflicts and tidal clustering causing crane idling.
- Bunker delays or weather around key straits.
- Yard imbalance increasing horizontal transport cycle times.

### Recommended next steps
1) **Tactical**: Nudge ETA updates from carriers with low accuracy; tighten cut-off rules on lanes >4h variance.
2) **Ops**: Rebalance yard blocks and assign extra AGVs on the two highest-pressure berths during peaks.
3) **Network**: Suggest alternative transhipment windows to smooth arrival banks (within 24–48h).
4) **Sustainability**: Offer slow-steaming windows that preserve on-time arrival and carbon targets.

> Set \`ASK_MODE=powerbi\` later to ground answers in live KPIs.`;
            return res.json({ answer });
        }

        // --- Mode: llm_only (OpenAI, no Power BI) ---
        if (MODE === "llm_only") {
            if (!process.env.OPENAI_API_KEY) {
                // Fallback to stub if key is missing
                return res.redirect(307, "/api/ask-stub");
            }
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const SYSTEM_PROMPT_LIGHT =
                "You are HarborGuide, a PSA insights assistant. You do NOT have live KPIs in this mode. " +
                "Answer clearly and actionably using PSA’s strategy: visibility, agility, efficiency, sustainability. " +
                "Offer hypotheses, ask 1 follow-up if truly necessary, and finish with next steps.";

            const userContent = [
                `Question: ${question}`,
                `Context: No live KPIs are available in this mode. Provide general guidance and concrete actions.`,
            ].join("\n\n");

            const out = await openai.chat.completions.create({
                model: "gpt-4o",
                temperature: 0.2,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT_LIGHT },
                    { role: "user", content: userContent }
                ],
            });

            const answer = out.choices?.[0]?.message?.content?.trim() || "No answer.";
            return res.json({ answer });
        }

    } catch (e) {
        console.error("ask error:", e);
        res.status(500).json({ error: String(e) });
    }
});

// helper route so llm_only falls back gracefully if no key
app.post("/api/ask-stub", (_req, res) => {
    const answer =
        `### HarborGuide (No live KPIs)
- I’m operating without Power BI data. Here’s a structured response you can use for decisions.

**What to review next:** arrival accuracy, within-4h rate, avg berth, carbon.
**Likely drivers:** berth conflicts, weather, port congestion, yard imbalance, data latency.
**Actions:** tighten ETA governance; smooth arrival banks; rebalance yard/AGVs; propose slow-steaming slots; track impact weekly.`;
    res.json({ answer });
});

// Temporary dummy KPIs to keep UI alive during DAX fixes
app.get("/api/kpis/dummy", (_req, res) => {
    res.json({
        kpis: {
            arrival_accuracy: { value: 72.3, delta: -1.7, unit: "%", window: "WoW" },
            within_4h: { value: 68.9, delta: -0.9, unit: "%", window: "WoW" },
            avg_berth_h: { value: 36.4, delta: 1.2, unit: "h", window: "WoW" },
            carbon_tonnes: { value: 61.1, delta: 2.2, unit: "t", window: "MTD" },
        },
        topVessels: [
            { vessel: "A", bu: "APAC", variance_h: 6.2, accuracy: "N", atb: "2025-10-12" },
            { vessel: "B", bu: "EMEA", variance_h: 5.8, accuracy: "N", atb: "2025-10-11" },
        ],
    });
});

// ---- helpers & start ----
function round(x, d = 2) {
    return x == null || Number.isNaN(Number(x)) ? null : Number(Number(x).toFixed(d));
}

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Server listening on :${port} (CORS origin: ${ORIGIN})`));
