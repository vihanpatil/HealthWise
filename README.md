## Some Background
RootWise is a project that explores how AI can make food systems more accessible, sustainable, and human-centered. The goal is to experiment with traceable, transparent, and user-focused RAG AI that uses functional medicine to connect food choices with well-being, while supporting zero-waste habits and local food knowledge.

## Setup
### 1. Evironmental Variables
First create a .env file in your root directory
```
NGC_API_KEY="your-ngc-api-key"
OPENAI_API_KEY="your-openai-api-key"
DATABASE_URL=postgresql+psycopg2://postgres@localhost:5432/zonewise
```

### 2. Creating Virtual Environment
First, ensure python version is 3.9.6
```
python3 -m venv venv
source venv/bin/activate
python -m pip install -U pip setuptools wheel
pip install -r requirements.txt
```

## 3. Run the backend (Terminal 1):
```
cd backend
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

## 4. Run the frontend (Terminal 2):
```
cd frontend
npm ci
npm run dev
```
## Open this server
http://localhost:5173
