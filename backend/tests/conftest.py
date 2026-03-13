"""pytest 공용 설정 — 테스트용 DB 및 FastAPI 클라이언트."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from core.database import Base, get_db

# 테스트용 인메모리 SQLite
TEST_DB_URL = "sqlite:///./test.db"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    """테스트 시작 시 테이블 생성, 종료 시 정리."""
    from models import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    if os.path.exists("./test.db"):
        os.remove("./test.db")


@pytest.fixture()
def db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def client():
    """FastAPI TestClient (DB를 테스트용으로 교체)."""
    from main import app
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def auth_headers(client):
    """admin 사용자 생성 + JWT 토큰 반환."""
    from core.security import get_password_hash
    from models.models import User
    db = TestSession()
    if not db.query(User).filter(User.username == "testadmin").first():
        db.add(User(
            username="testadmin",
            email="test@group.ai",
            hashed_password=get_password_hash("test1234"),
            role="admin",
        ))
        db.commit()
    db.close()

    res = client.post("/api/auth/login", data={"username": "testadmin", "password": "test1234"})
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
