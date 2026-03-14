"""승인 워크플로우 API 테스트."""


def test_create_approval(client, auth_headers):
    """승인 요청 생성."""
    res = client.post(
        "/api/approvals",
        json={
            "title": "테스트 승인 요청",
            "description": "테스트용 승인입니다",
            "request_type": "general",
            "requester": "AI CEO",
        },
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["title"] == "테스트 승인 요청"
    assert data["status"] == "pending"


def test_approval_inbox(client, auth_headers):
    """승인 대기 목록 조회."""
    res = client.get("/api/approvals/inbox", headers=auth_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_approve_request(client, auth_headers):
    """승인 처리."""
    create = client.post(
        "/api/approvals",
        json={
            "title": "승인할 요청",
            "request_type": "general",
            "requester": "Test",
        },
        headers=auth_headers,
    )
    aid = create.json()["id"]
    res = client.post(
        f"/api/approvals/{aid}/review",
        json={"status": "approved", "reviewer_note": "승인합니다"},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json()["status"] == "approved"


def test_reject_request(client, auth_headers):
    """반려 처리."""
    create = client.post(
        "/api/approvals",
        json={
            "title": "반려할 요청",
            "request_type": "general",
            "requester": "Test",
        },
        headers=auth_headers,
    )
    aid = create.json()["id"]
    res = client.post(
        f"/api/approvals/{aid}/review",
        json={"status": "rejected", "reviewer_note": "반려합니다"},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json()["status"] == "rejected"
