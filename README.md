# 🚀 Full Project Setup & Startup Guide (Backend + Streamlit Frontend)

This project powers the **Power BI Insights Assistant** — a dual-stack system built with:
- **Backend:** Node.js + Express server for Power BI embedding and Azure OpenAI communication  
- **Frontend:** Streamlit app for conversational insights on Power BI data  

---

## Prerequisites

Before running the project, make sure you have:

| Requirement | Description |
|--------------|-------------|
| **Node.js** | Version 18 or newer |
| **npm** | Comes with Node (check with `npm -v`) |
| **Python 3.10+** | For Streamlit frontend |
| **Azure OpenAI access** | Endpoint, API key, deployment name, and API version |
| **Power BI Workspace access** | For embedding and exporting report visuals |
| **config.json** | Contains your Power BI workspace & report IDs |

---

## 1. Install dependencies

### Backend (Node.js)
```bash
cd backend
npm install
```

### Frontend (Streamlit)
```bash
pip install -r requirements.txt
```

> 💡 The `node_modules/` folder is excluded from Git via `.gitignore`. If missing, just run `npm install`.

---

## 🔑 2. Create a `.env` file (for backend)

Create a `.env` file inside the `backend` folder:

```bash
# Azure OpenAI setup
AZURE_OPENAI_ENDPOINT=<your-endpoint>
AZURE_OPENAI_API_KEY=<your-api-key>
AZURE_OPENAI_DEPLOYMENT=<your-deployment-name>
AZURE_OPENAI_API_VERSION=<your-api-version>

# (Optional) Power BI configuration
WORKSPACE_ID=<your-workspace-id>
REPORT_ID=<your-report-id>
```

> **Note** The endpoint must only contain the base URL — no `/openai/deployments/...` in it.

---

## 3. Run both servers

### Start backend:
```bash
cd backend
npm start
```
Backend runs by default on **http://localhost:5300**.

### Start Streamlit frontend:
```bash
cd streamlit_app
streamlit run main.py
```
Frontend runs on **http://localhost:8501**.

---

## 4. Verify backend connection

Check these endpoints in your browser:

```
http://localhost:5300/debug/azure/env
http://localhost:5300/debug/azure/deployments
```
✅ If they respond with JSON, your backend and Azure connection are working.

---

## 💬 5. How it works

1. **Frontend (Streamlit)** embeds your Power BI report inside a dashboard panel.  
2. When Power BI loads or filters change, the frontend **exports all visuals as CSV**.  
3. The frontend auto-sends them to the backend:  
   ```
   POST /api/visual-data/upload
   ```
4. When the user asks a question (e.g., *“Why did arrivals drop this week?”*), Streamlit calls:  
   ```
   POST /api/ask
   ```
5. The backend:
   - Retrieves cached CSVs
   - Summarizes them via `chatHelper.js`
   - Calls **Azure OpenAI** using your `.env` credentials
   - Returns a concise, data-grounded answer

---

## 📂 Project structure

```

├─ backend/
│  ├─ src/
│  │  ├─ server.js             # Main Express server
│  │  ├─ aiHelper.js           # Azure OpenAI integration + caching
│  │  ├─ chatHelper.js         # CSV summarization logic
│  │  ├─ embedConfigService.js # Power BI embed config
│  │  └─ utils.js              # Helper utilities
│  ├─ public/                  # Static JS/CSS for embedding
│  ├─ package.json             # Backend dependencies
│  ├─ .env.example             # Example Azure OpenAI vars
│  └─ .gitignore               # Ignores node_modules, env, logs
│
├
│─ main.py                  # Streamlit entrypoint  
│─ mockinsights.json        # Fallback mock data (if backend offline)
│─ requirements.txt         # Python dependencies
│  
│
├─ .gitignore
└─ README.md                   # (This file)
```

---

## 6. Useful commands

| Command | Description |
|----------|-------------|
| `npm install` | Install backend dependencies |
| `npm start` | Run backend server |
| `pip install -r requirements.txt` | Install Streamlit dependencies |
| `streamlit run main.py` | Run Streamlit frontend |
| `git rm -r --cached node_modules` | Remove tracked node_modules |
| `nodemon src/server.js` | Auto-reload backend on change |

---

## Common issues

| Symptom | Cause | Fix |
|----------|--------|----|
| `Error: Azure call failed [404]` | Endpoint includes `/openai/deployments/...` | Use only base URL in `.env` |
| `Error: Azure OpenAI env vars missing` | `.env` not found | Restart after adding `.env` |
| `401 Unauthorized` | Wrong header type for API Management | Use `Ocp-Apim-Subscription-Key` (auto-handled) |
| `Cannot find module 'node-fetch'` | Dependency missing | Run `npm install node-fetch@2` |
| Streamlit shows “Backend error” | Backend not running or port mismatch | Check backend logs and `backend_url` in frontend |

---

## Development tips

- **Auto-restart backend:**  
  ```bash
  npm i -g nodemon
  nodemon src/server.js
  ```
- **Test Azure call manually:**  
  ```bash
  curl -i -X POST "$AZURE_OPENAI_ENDPOINT/openai/deployments/$AZURE_OPENAI_DEPLOYMENT/chat/completions?api-version=$AZURE_OPENAI_API_VERSION"     -H "Ocp-Apim-Subscription-Key: $AZURE_OPENAI_API_KEY"     -H "Content-Type: application/json"     -d '{ "messages": [{"role":"user","content":"ping"}] }'
  ```

---

## ✅ Summary

1. `cd backend && npm install`  
2. Add `.env` with Azure credentials  
3. `npm start`  
4. `cd streamlit_app && pip install -r requirements.txt`  
5. `streamlit run main.py`  
6. Visit **http://localhost:8501** and chat with your Power BI dashboard 🚀


