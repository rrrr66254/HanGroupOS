#!/usr/bin/env bash
cd "$(dirname "$0")"

[ ! -d "venv" ] && python3 -m venv venv
source venv/bin/activate
pip install -q -r requirements.txt

echo "✓ API: http://localhost:8000"
echo "✓ Docs: http://localhost:8000/docs"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
