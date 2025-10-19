import os, json, time
import streamlit as st
import requests
import pandas as pd

st.set_page_config(
    page_title="HarborGuide — PSA Insights Assistant", page_icon="🛳️", layout="wide"
)


# ---------- helpers ----------
def load_json(path, fallback=None):
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        return fallback or {}


def kpi_badge(kpi):
    if not kpi or "value" not in kpi:
        return ""
    val = kpi["value"]
    unit = kpi.get("unit", "")
    delt = kpi.get("delta")
    win = kpi.get("window", "")
    if delt is None:
        delta_str = ""
    else:
        arrow = "🔺" if delt > 0 else ("🔻" if delt < 0 else "➡️")
        delta_str = f" {arrow} {delt:+}"
    win_str = f" <span style='opacity:.65'>({win})</span>" if win else ""
    return f"<b>{val}</b> {unit}{delta_str}{win_str}"


@st.cache_data(ttl=60)
def fetch_kpis(backend_url: str):
    r = requests.get(f"{backend_url.rstrip('/')}/api/kpis", timeout=20)
    r.raise_for_status()
    return r.json()  # { kpis: {...}, topVessels: [...] }


def health(backend_url: str) -> bool:
    try:
        r = requests.get(f"{backend_url.rstrip('/')}/health", timeout=5)
        return r.ok and r.json().get("ok") is True
    except Exception:
        return False



# ---------- sidebar ----------
st.sidebar.title("⚙️ Config")

# Single backend URL input
backend_url = st.sidebar.text_input(
    "Backend URL", value="http://localhost:5300"
).strip()

# Health check
ok = health(backend_url)

if ok:
    st.sidebar.success("Backend connected")
else:
    st.sidebar.error("Backend unreachable — using local mock data")

st.sidebar.markdown("---")
st.sidebar.caption(
    "The app will automatically use the backend when available, "
    "and fall back to local mock JSON files when it isn’t."
)

# ---------- title ----------
st.markdown(
    "<h1 style='margin-bottom:0'>HarborGuide — PSA Insights Assistant</h1>"
    "<div style='color:#4b5563;margin:6px 0 18px'>Analytical dashboard with a conversational interface</div>",
    unsafe_allow_html=True,
)

# ---------- layout: dashboard + chat ----------
left, right = st.columns([9, 6], gap="large")

with left:
    st.subheader("Global Insights Dashboard")
    # Power BI embed (optional). If you want to embed now, uncomment this block:
    import json

    try:
        resp = requests.get(f"{backend_url.rstrip('/')}/getEmbedToken", timeout=20)
        resp.raise_for_status()
        cfg = resp.json()

        # Backend shape: { accessToken, embedUrl: [ { id, embedUrl, ... } ], ... }
        reports = cfg.get("embedUrl") or []                      # it's an array
        first   = reports[0] if isinstance(reports, list) and reports else {}

        embed_url    = first.get("embedUrl", "")
        access_token = cfg.get("accessToken", "")

        # Guard missing fields (frontend-only, no backend change)
        missing = [k for k, v in {
            "embedUrl": embed_url, "accessToken": access_token
        }.items() if not v]
        if missing:
            st.error(f"Backend missing fields: {', '.join(missing)}")
            st.stop()

        # Build config via json.dumps to avoid brace/quote issues
        safe_config = {
            "type": "report",
            "embedUrl": embed_url,
            "accessToken": access_token,
            "settings": {"panes": {"filters": {"visible": False}}}
        }
        config_json = json.dumps(safe_config)

        embed_html = f"""
        <div id="reportContainer" style="height:600px;border:1px solid #e5e7eb;border-radius:12px"></div>
        <script src="https://cdn.jsdelivr.net/npm/powerbi-client/dist/powerbi.min.js"></script>
        <script>
        (function(){{
            const models = window['powerbi-client'].models;
            const config = {config_json};
            config.tokenType = models.TokenType.Embed;  // set enum after JSON parse

            const el = document.getElementById('reportContainer');
            if (window.powerbi) {{
            try {{ window.powerbi.reset(el); }} catch (e) {{}}
            window.powerbi.embed(el, config);
            }}
        }})();
        </script>
        """
        st.components.v1.html(embed_html, height=560, scrolling=False)

    except Exception as e:
        st.info(f"Power BI embed not available: {e}")


    with right:
        st.subheader("Conversational Insights")
        st.caption(
            "Try: *What changed this week?*, *Why did arrival accuracy drop?*, *Suggest next steps aligned to PSA strategy.*"
        )

        if "messages" not in st.session_state:
            st.session_state.messages = []

        # input
        user_q = st.chat_input("Ask about the dashboard…")

        if user_q:
            st.session_state.messages.append({"role": "user", "content": user_q})
            try:
                if ok:
                    r = requests.post(f"{backend_url.rstrip('/')}/api/ask",
                                    json={"question": user_q}, timeout=40)
                    r.raise_for_status()
                    answer = r.json().get("answer", "No answer.")
                else:
                    mock = load_json("mockinsights.json", {})
                    answer = mock.get("answer", "No mock answer available.")
            except Exception as e:
                answer = f"Backend error: {e}\n\nTry refresh KPIs or switch to Mock."
            st.session_state.messages.append({"role": "assistant", "content": answer})

        # Now render everything once (oldest →   newest)
        for m in reversed(st.session_state.messages):
            with st.chat_message(m["role"]):
                st.markdown(m["content"])

        st.button("Clear chat", on_click=lambda: st.session_state.update({"messages": []}))
