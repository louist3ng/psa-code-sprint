// config/config.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");

let config = {};

// Try loading the old config.json first
// try {
//     const jsonPath = path.join(__dirname, "config.json");
//     if (fs.existsSync(jsonPath)) {
//         config = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
//     }
// } catch (e) {
//     console.warn("[config] Could not read config.json:", e.message);
// }

// Override with .env values if they exist
config.clientId = process.env.CLIENT_ID || config.clientId;
config.clientSecret = process.env.CLIENT_SECRET || config.clientSecret;
config.tenantId = process.env.TENANT_ID || config.tenantId;
config.workspaceId = process.env.WORKSPACE_ID || config.workspaceId;
config.reportId = process.env.REPORT_ID || config.reportId;
config.powerBiApiUrl = process.env.POWER_BI_API_URL || config.powerBiApiUrl;
config.scopeBase = process.env.SCOPE_BASE || config.scopeBase;
config.authorityUrl = process.env.AUTHORITY_URL || config.authorityUrl;
config.authenticationMode = process.env.AUTHENTICATION_MODE || config.authenticationMode;

// Export unified config object
module.exports = config;
