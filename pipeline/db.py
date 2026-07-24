"""
db.py — Supabase 연결 담당
=========================
.env에서 SUPABASE_URL, SUPABASE_SERVICE_KEY를 읽어 supabase 클라이언트를 만든다.
다른 load_*.py들은 이 파일의 get_client()만 호출하면 된다.
"""

import os

from dotenv import load_dotenv
from supabase import create_client, Client

# .env 파일을 한 번만 읽어 환경변수로 올린다.
load_dotenv()


def get_client() -> Client:
    """SUPABASE_URL / SUPABASE_SERVICE_KEY로 Supabase 클라이언트를 반환."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")

    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL 또는 SUPABASE_SERVICE_KEY가 비어 있습니다.\n"
            "   .env 파일에 두 값을 채워 넣으세요.\n"
            "   - SUPABASE_URL         : Project Settings → Data API → Project URL\n"
            "   - SUPABASE_SERVICE_KEY : Project Settings → API keys → service_role (secret)"
        )

    # supabase-py는 프로젝트 기본 URL(https://xxx.supabase.co)을 기대한다.
    # Data API 화면에서 복사하면 뒤에 '/rest/v1/'이 붙는 경우가 있어 떼어낸다.
    url = url.strip().rstrip("/")
    for suffix in ("/rest/v1", "/rest"):
        if url.endswith(suffix):
            url = url[: -len(suffix)]

    return create_client(url, key)
