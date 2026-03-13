"""그룹 설정 API 테스트."""


def test_get_default_settings(client, auth_headers):
    """기본 설정 조회 — 기본값 반환."""
    res = client.get("/api/group-settings", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "group_name" in data
    assert data["group_name"] == "Group"


def test_update_group_name(client, auth_headers):
    """그룹 이름 변경."""
    res = client.patch(
        "/api/group-settings",
        json={"group_name": "TestCorp", "group_name_ko": "테스트그룹"},
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["group_name"] == "TestCorp"
    assert data["group_name_ko"] == "테스트그룹"


def test_settings_persist(client, auth_headers):
    """설정이 영속적으로 저장되는지 확인."""
    client.patch(
        "/api/group-settings",
        json={"slogan": "We Build The Future"},
        headers=auth_headers,
    )
    res = client.get("/api/group-settings", headers=auth_headers)
    assert res.json()["slogan"] == "We Build The Future"


def test_health_check(client):
    """헬스체크 엔드포인트."""
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
