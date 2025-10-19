// ----------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
// ----------------------------------------------------------------------------

require('dotenv').config();
let path = require('path');
let embedToken = require(__dirname + '/embedConfigService.js');
const utils = require(__dirname + "/utils.js");
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const cors = require("cors");
const fs = require("fs");
const { cacheVisuals, buildCsvContext, callAzureOpenAI } = require("./aiHelper.js");
const { buildCardsFromXlsxFile } = require("./xlsxHelper.js");


// Prepare server for Bootstrap, jQuery and PowerBI files
app.use('/js', express.static('./node_modules/bootstrap/dist/js/')); // Redirect bootstrap JS
app.use('/js', express.static('./node_modules/jquery/dist/')); // Redirect JS jQuery
app.use('/js', express.static('./node_modules/powerbi-client/dist/')) // Redirect JS PowerBI
app.use('/css', express.static('./node_modules/bootstrap/dist/css/')); // Redirect CSS bootstrap
app.use('/public', express.static('./public/')); // Use custom JS and CSS files
app.use(require("cors")({ origin: true })); // Enable CORS for local Streamlit app
app.use(bodyParser.json({ limit: "10mb" }));

const port = process.env.PORT || 5300;

const DATA_XLSX_PATH = process.env.DATA_XLSX_PATH
    ? path.resolve(process.env.DATA_XLSX_PATH)
    : path.join(__dirname, "..", "data", "report.xlsx");

app.use(bodyParser.json());

app.use(bodyParser.urlencoded({
    extended: true
}));

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname + '/../views/index.html'));
});

app.get('/getEmbedToken', async function (req, res) {

    // Validate whether all the required configurations are provided in config.json
    configCheckResult = utils.validateConfig();
    if (configCheckResult) {
        return res.status(400).send({
            "error": configCheckResult
        });
    }
    // Get the details like Embed URL, Access token and Expiry
    let result = await embedToken.getEmbedInfo();

    // result.status specified the statusCode that will be sent along with the result object
    res.status(result.status).send(result);
});

// POST /api/visual-data/upload
app.post("/api/visual-data/upload", (req, res) => {
    const { reportId, workspaceId, visuals } = req.body || {};
    if (!reportId || !Array.isArray(visuals)) {
        return res.status(400).json({ error: "reportId and visuals[] required" });
    }
    cacheVisuals(reportId, workspaceId, visuals);
    return res.json({ ok: true, count: visuals.length });
});

app.post("/api/ask", async (req, res) => {
    try {
        const question = String(req.body?.question || "").trim();

        if (!fs.existsSync(DATA_XLSX_PATH)) {
            return res.status(200).json({
                answer:
                    `Data file not found at: ${DATA_XLSX_PATH}\n` +
                    `Place your Excel at that path or set DATA_XLSX_PATH in .env.`
            });
        }

        const cards = buildCardsFromXlsxFile(DATA_XLSX_PATH, 80_000);

        const system = `
            You are a KPI/operations analyst. Use the provided data cards (from a fixed Excel workbook).
            Be quantitative and concise. If data is partial or ambiguous, say so and state assumptions.
            Suggest brief, actionable next steps when relevant.
            `.trim();

        const user = `
            [QUESTION]
            ${question}

            [DATA CARDS]
            ${cards}
            `.trim();

        const answer = await callAzureOpenAI([
            { role: "system", content: system },
            { role: "user", content: user }
        ]);

        return res.json({ answer });
    } catch (e) {
        console.error("ask error:", e);
        return res.status(200).json({
            answer:
                "Setup issue calling AI or reading the Excel:\n" +
                String(e) +
                "\n\nTips: Check DATA_XLSX_PATH, file format, and AZURE_* env vars."
        });
    }
});

app.listen(port, () => console.log(`Listening on port ${port}`));