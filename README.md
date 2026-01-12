## Some Background
RootWise is a project that explores how AI can make food systems more accessible, sustainable, and human-centered. The goal is to experiment with traceable, transparent, and user-focused RAG AI that uses functional medicine to connect food choices with well-being, while supporting zero-waste habits and local food knowledge.

## Setup
### 1. Evironmental Variables
First create a .env file in your root directory
```
NGC_API_KEY="your-ngc-api-key"
OPENAI_API_KEY="your-openai-api-key"
```

## Files

Ensure the following files are included in your repo before building the Docker image:

### app/main.py
Main function, all logic is imported. 

### rootwise.py
The meat and potatoes, this is where the query engine and completions model are initialized and accessed. 

### vis-transformer.py
Modular implementation of the vision transformer.

### best.pt 
YOLOv8 weights for vegetable detection.

### requirements.txt
A file to track dependencies. 

## Run the backend (Terminal 1):
```
cd backend
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

## Run the frontend (Terminal 2):
```
cd frontend
npm ci
npm run dev
```
## Open this server
http://localhost:5173
