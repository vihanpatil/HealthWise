# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.health import router as health_router
from app.api.rootwise import router as rootwise_router
from app.api.zonewise import router as zonewise_router
from app.logic.rootwise import initialize_rootwise_rag
from app.logic.zonewise import initialize_zonewise_rag

app = FastAPI(title="RootWise API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    print("Initializing RAG...")
    print("RootWise:", initialize_rootwise_rag())
    print("ZoneWise:", initialize_zonewise_rag())
    print("Startup complete.")

app.include_router(rootwise_router, prefix="/api/rootwise", tags=["rootwise"])
app.include_router(zonewise_router, prefix="/api/zonewise", tags=["zonewise"])
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(health_router, prefix="/api/health", tags=["health"])
