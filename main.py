import os, json, time
import streamlit as st

st.set_page_config(page_title="HarborGuide — PSA Insights Assistant", page_icon="🛳️", layout="wide")

# ---------- helpers ----------
def load_json(path, fallback=None):
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        return fallback or {}

def kpi_badge(kpi):
    if not kpi or "value" not in kpi: return ""
    val   = kpi["value"]
    unit  = kpi.get("unit","")
    delt  = kpi.get("delta")
    win   = kpi.get("window","")
    if delt is None:
        delta_str = ""
    else:
        arrow = "🔺" if delt > 0 else ("🔻" if delt < 0 else "➡️")
        # show + for positive delta
        delta_str = f" {arrow} {delt:+}"
    win_str = f" <span style='opacity:.65'>({win})</span>" if win else ""
    return f"<b>{val}</b> {unit}{delta_str}{win_str}"

# ---------- sidebar (mode toggle) ----------
st.sidebar.title("⚙️ Config")
mode = st.sidebar.radio("Mode", ["Mock (Day 1)", "Backend (Day 2+)"], index=0)
backend_url = st.sidebar.text_input("Backend URL (for /api/ask)", value="http://localhost:3000")

st.sidebar.markdown("---")
st.sidebar.caption("In Day 1, everything is local & mock; no secrets here. Backend mode comes later.")

# ---------- title ----------
st.markdown(
    "<h1 style='margin-bottom:0'>HarborGuide — PSA Insights Assistant</h1>"
    "<div style='color:#4b5563;margin:6px 0 18px'>Analytical dashboard with a conversational interface</div>",
    unsafe_allow_html=True
)

# ---------- KPI strip ----------
kpis = load_json("mock_kpis.json", {
    "arrival_accuracy": {"value": 0, "delta": 0, "unit": "%", "window": "WoW"},
    "within_4h":        {"value": 0, "delta": 0, "unit": "%", "window": "WoW"},
    "carbon_tonnes":    {"value": 0, "delta": 0, "unit": "t", "window": "MTD"},
    "avg_berth_h":      {"value": 0, "delta": 0, "unit": "h", "window": "WoW"}
})

c1, c2, c3, c4 = st.columns(4)
with c1:
    st.markdown("**Arrival Accuracy**")
    st.markdown(kpi_badge(kpis["arrival_accuracy"]), unsafe_allow_html=True)
with c2:
    st.markdown("**Within 4h Target**")
    st.markdown(kpi_badge(kpis["within_4h"]), unsafe_allow_html=True)
with c3:
    st.markdown("**Carbon Abatement**")
    st.markdown(kpi_badge(kpis["carbon_tonnes"]), unsafe_allow_html=True)
with c4:
    st.markdown("**Avg Berth Time**")
    st.markdown(kpi_badge(kpis["avg_berth_h"]), unsafe_allow_html=True)

st.markdown("---")

# ---------- layout: dashboard + chat ----------
left, right = st.columns([7,5], gap="large")

with left:
    st.subheader("Global Insights Dashboard")
    # Day 1: placeholder card (replace with actual embed/iframe on Day 3)
    st.markdown(
        """
        <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;height:520px;
                    display:flex;align-items:center;justify-content:center;background:#fafafa">
          <div style="text-align:center;color:#6b7280">
            <div style="font-size:15px;margin-bottom:8px;">Power BI Report Placeholder</div>
            <div style="font-size:13px">Embed with JS SDK later; for Day 1 this placeholder is fine.</div>
          </div>
        </div>
        """,
        unsafe_allow_html=True
    )

with right:
    st.subheader("Conversational Insights")
    st.caption("Try: *What changed this week?*, *Why did arrival accuracy drop?*, *Suggest next steps aligned to PSA strategy.*")

    if "messages" not in st.session_state:
        st.session_state.messages = [
            {"role": "assistant", "content": 
             "Hi! I’m **HarborGuide**. I read the KPI strip and turn it into actions. Ask me about changes, drivers, or next steps."}
        ]

    # show history
    for m in st.session_state.messages:
        with st.chat_message(m["role"]):
            st.markdown(m["content"])

    # input
    user_q = st.chat_input("Ask about the dashboard…")
    if user_q:
        st.session_state.messages.append({"role": "user", "content": user_q})
        with st.chat_message("user"): st.markdown(user_q)

        with st.chat_message("assistant"):
            with st.spinner("Generating insights…"):
                time.sleep(0.2)
                if mode.startswith("Mock"):
                    mock = load_json("mock_insights.json", {})
                    answer = mock.get("answer", "No mock answer available.")
                else:
                    # Day 2+: call your backend. For Day 1, we won’t actually hit it.
                    import requests
                    try:
                        r = requests.post(backend_url.rstrip("/") + "/api/ask",
                                          json={"question": user_q, "kpis": kpis}, timeout=15)
                        r.raise_for_status()
                        data = r.json()
                        answer = data.get("answer", "No answer from backend.")
                    except Exception as e:
                        answer = f"Backend error: {e}\n\nFalling back to mock.\n\n" + load_json("mock_insights.json", {}).get("answer","")
                st.markdown(answer)
                st.session_state.messages.append({"role": "assistant", "content": answer})

    st.button("Clear chat", on_click=lambda: st.session_state.update({"messages": []}))
