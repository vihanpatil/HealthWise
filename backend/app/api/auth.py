from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field, conint, confloat
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import User
from app.logic.auth import hash_password, verify_password, create_access_token
from app.logic.auth_deps import get_current_user_id
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[3]
load_dotenv(BASE_DIR / ".env")

router = APIRouter()


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    # NEW fields
    name: str = Field(min_length=1, max_length=100)
    gender: Literal["male", "female"]
    age: conint(ge=1, le=120)
    height_cm: confloat(gt=0, le=300)
    weight_kg: confloat(gt=0, le=500)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class AuthOut(BaseModel):
    token: str


class MeOut(BaseModel):
    id: str
    email: EmailStr


@router.post("/register", response_model=AuthOut)
def register(body: RegisterIn, db: Session = Depends(get_db)) -> AuthOut:
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already in use")

    u = User(
        email=body.email,
        name=body.name,
        gender=body.gender,
        age=int(body.age),
        height_cm=float(body.height_cm),
        weight_kg=float(body.weight_kg),
        password_hash=hash_password(body.password),
    )
    db.add(u)
    db.commit()
    db.refresh(u)

    token = create_access_token(user_id=str(u.id))
    return AuthOut(token=token)


@router.post("/login", response_model=AuthOut)
def login(body: LoginIn, db: Session = Depends(get_db)) -> AuthOut:
    u = db.query(User).filter(User.email == body.email).first()
    if not u or not getattr(u, "password_hash", None):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(body.password, u.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(user_id=str(u.id))
    return AuthOut(token=token)


@router.get("/me", response_model=MeOut)
def me(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> MeOut:
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return MeOut(id=str(u.id), email=u.email)
