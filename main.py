import os, json
import streamlit as st
import requests

st.set_page_config(
    page_title="HarborGuide — PSA Insights Assistant",
    page_icon="🛳️",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ---------- config (deploy-friendly) ----------
# In Streamlit Cloud: set Secrets -> BACKEND_URL="https://your-backend.tld"
backend_url = (
    st.secrets.get("BACKEND_URL")
    or os.getenv("BACKEND_URL")
    or "http://localhost:5300"   # dev fallback
).strip()

# Optional tiny settings popover (handy in dev; remove if you want a perfectly clean header)
# try:
#     with st.popover("⚙️ Settings"):
#         backend_url = st.text_input("Backend URL", value=backend_url).strip()
#         st.caption("Tip: set BACKEND_URL in Streamlit Secrets for production.")
# except Exception:
#     pass  # older Streamlit versions without popover

# ---------- helpers ----------
def load_json(path, fallback=None):
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        return fallback or {}

# ---------- title ----------
st.markdown(
    "<h1 style='margin-bottom:0'>HarborGuide — PSA Insights Assistant</h1>"
    "<div style='color:#4b5563;margin:6px 0 18px'>AI-powered conversational interface that interprets the dashboard and delivers actionable insights</div>",
    unsafe_allow_html=True,
)

# ---------- layout: dashboard + chat ----------
left, right = st.columns([9, 6], gap="large")

# -------- LEFT --------
with left:
    st.subheader("Global Insights Dashboard")
    try:
        resp = requests.get(f"{backend_url.rstrip('/')}/getEmbedToken", timeout=20)
        resp.raise_for_status()
        cfg = resp.json()

        reports = cfg.get("embedUrl") or []
        first = reports[0] if isinstance(reports, list) and reports else {}
        embed_url = first.get("embedUrl", "")
        access_token = cfg.get("accessToken", "")

        missing = [k for k, v in {"embedUrl": embed_url, "accessToken": access_token}.items() if not v]
        if missing:
            st.error(f"Backend missing fields: {', '.join(missing)}")
            st.stop()

        safe_config = {
            "type": "report",
            "embedUrl": embed_url,
            "accessToken": access_token,
            "settings": {"panes": {"filters": {"visible": True, "expanded": False}}},  # your choice
        }
        config_json = json.dumps(safe_config)

        embed_html = f"""
        <div id="reportContainer" style="height:600px;border:1px solid #e5e7eb;border-radius:12px"></div>
        <script src="https://cdn.jsdelivr.net/npm/powerbi-client/dist/powerbi.min.js"></script>
        <script>
        (function(){{
            const models = window['powerbi-client'].models;
            const config = {config_json};
            config.tokenType = models.TokenType.Embed;
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

# -------- RIGHT --------
with right:
    st.subheader("Conversational Insights")
    st.caption("Try: *What changed this week?*, *Suggest next steps aligned to PSA strategy.*")

    if "messages" not in st.session_state:
        st.session_state.messages = []

    user_q = st.chat_input("Ask about the dashboard…")

    if user_q:
        st.session_state.messages.append({"role": "user", "content": user_q})
        try:
            with st.spinner("Thinking…"):
                r = requests.post(
                    f"{backend_url.rstrip('/')}/api/ask",
                    json={"question": user_q},
                    timeout=60
                )
                data = r.json() if r.headers.get("content-type","").startswith("application/json") else {}
                answer = data.get("answer", r.text or "No answer.")
        except Exception as e:
            answer = f"Backend error: {e}"
        st.session_state.messages.append({"role": "assistant", "content": answer})

    # Render chat (newest → oldest)
    for m in reversed(st.session_state.messages):
        with st.chat_message(m["role"]):
            st.markdown(m["content"])

    st.button("Clear chat", on_click=lambda: st.session_state.update({"messages": []}))
