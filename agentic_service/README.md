## RootWise Agentic Service

This is a separate Python service for RootWise `agentic` mode.

It exists to avoid dependency conflicts between the main RootWise backend and `google-adk`.

### Local run

```bash
cd agentic_service
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip setuptools wheel
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8100 --reload
```

### Environment

The service loads the repo root `.env` by default.

Optional overrides:

```bash
ROOTWISE_BACKEND_URL=http://127.0.0.1:8000
ROOTWISE_AGENTIC_MODEL=gpt-4.1-mini
```

### Expected local setup

- Main RootWise backend on `127.0.0.1:8000`
- Agentic service on `127.0.0.1:8100`
- Frontend on `127.0.0.1:5173`
