from sqlalchemy import Column, DateTime, Float, Integer, String, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base
import uuid

Base = declarative_base()

class Metric(Base):
    __tablename__ = "metrics"
    __table_args__ = {"schema": "public"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("public.users.id"), nullable=False)
    metric_type = Column(String, nullable=False)
    ts = Column(DateTime, nullable=False)
    value = Column(Float, nullable=False)
    unit = Column(String)

class User(Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "public"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    gender = Column(String, nullable=False)           # "male" | "female"
    weight_kg = Column(Float, nullable=False)         # store kg
    height_cm = Column(Float, nullable=False)         # store cm
    age = Column(Integer, nullable=False)