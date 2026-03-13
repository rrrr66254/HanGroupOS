"""회사 CRUD API 테스트."""


def test_create_company(client, auth_headers):
    """회사 생성."""
    res = client.post(
        "/api/companies?auto_org=false",
        json={"name": "테스트 AI", "industry": "AI", "description": "테스트용"},
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "테스트 AI"
    assert data["industry"] == "AI"


def test_list_companies(client, auth_headers):
    """회사 목록 조회."""
    res = client.get("/api/companies", headers=auth_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_get_company(client, auth_headers):
    """회사 상세 조회."""
    # 먼저 생성
    create = client.post(
        "/api/companies?auto_org=false",
        json={"name": "Get Test", "industry": "Tech"},
        headers=auth_headers,
    )
    cid = create.json()["id"]
    res = client.get(f"/api/companies/{cid}", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["name"] == "Get Test"


def test_update_company(client, auth_headers):
    """회사 정보 수정."""
    create = client.post(
        "/api/companies?auto_org=false",
        json={"name": "Update Test", "industry": "원본"},
        headers=auth_headers,
    )
    cid = create.json()["id"]
    res = client.patch(
        f"/api/companies/{cid}",
        json={"industry": "수정됨"},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json()["industry"] == "수정됨"


def test_delete_company(client, auth_headers):
    """회사 삭제."""
    create = client.post(
        "/api/companies?auto_org=false",
        json={"name": "Delete Test", "industry": "삭제대상"},
        headers=auth_headers,
    )
    cid = create.json()["id"]
    res = client.delete(f"/api/companies/{cid}", headers=auth_headers)
    assert res.status_code == 200
