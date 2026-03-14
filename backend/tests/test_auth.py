"""인증 API 테스트."""


def test_login_success(client, auth_headers):
    """올바른 자격증명으로 로그인 성공."""
    res = client.post("/api/auth/login", data={"username": "testadmin", "password": "test1234"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["username"] == "testadmin"


def test_login_wrong_password(client, auth_headers):
    """잘못된 비밀번호로 로그인 실패."""
    res = client.post("/api/auth/login", data={"username": "testadmin", "password": "wrong"})
    assert res.status_code == 401


def test_me_unauthorized(client):
    """토큰 없이 /me 요청 시 401."""
    res = client.get("/api/auth/me")
    assert res.status_code == 401


def test_me_success(client, auth_headers):
    """유효한 토큰으로 /me 성공."""
    res = client.get("/api/auth/me", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["username"] == "testadmin"
