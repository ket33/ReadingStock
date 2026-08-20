"""
generate.py — 해설자 AI 호출 (지시서 §5)
========================================
claude -p (헤드리스 Claude Code)로 해설 기사를 생성한다.
→ API 과금이 아니라 사용자의 클로드 구독으로 돌아간다.
출력 형식: 첫 줄 = 헤드라인, 빈 줄, 본문 문단들.
"""
import glob
import os
import shutil
import subprocess

PROMPT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prompt_system.md")
MODEL = os.environ.get("NEWS_CLAUDE_MODEL", "sonnet")  # 워크플로 기본값과 같게 (news.yml)
TIMEOUT = 420  # 초

# 직전 호출의 실패 사유 — run.py가 company_news.fallback_reason에 남긴다.
# (호출부가 None만 받으면 '생성 실패'라는 사실 외에 아무것도 모른다)
LAST_ERROR = {"reason": None}


def _claude_bin() -> str:
    """claude CLI 경로 — PATH → 환경변수 → VSCode 확장 번들 순으로 찾는다."""
    path = os.environ.get("NEWS_CLAUDE_BIN") or shutil.which("claude")
    if path and os.path.exists(path):
        return path
    # VSCode 확장에 번들된 실행 파일 (버전이 바뀌어도 최신 것을 집는다)
    candidates = glob.glob(os.path.join(
        os.path.expanduser("~"), ".vscode", "extensions",
        "anthropic.claude-code-*", "resources", "native-binary", "claude.exe"))
    if candidates:
        return max(candidates)  # 버전 문자열 최대 = 최신
    raise RuntimeError("claude CLI를 찾을 수 없습니다 (PATH 또는 NEWS_CLAUDE_BIN 확인)")


def _load_system_prompt() -> str:
    with open(PROMPT_PATH, encoding="utf-8") as f:
        return f.read()


def write_article(company_name: str, market: str, sector: str | None,
                  report_nm: str, type_key: str, facts: str,
                  media_context: str = "", report_summary: str = "") -> tuple[str, str] | None:
    """해설 기사 생성 → (헤드라인, 본문). 실패하면 None.

    report_summary: 리딩스톡 분석 리포트의 핵심 요약(있으면).
    공시가 리포트에서 짚은 흐름과 닿아 있을 때만 자연스럽게 연결된다.
    """
    user_prompt = f"""<회사_정보>
회사명: {company_name}
시장: {market}
업종: {sector or "미상"}
공시 보고서명: {report_nm}
공시 유형 키: {type_key}
</회사_정보>

<공시_사실>
{facts}
</공시_사실>

<기사_맥락>
{media_context.strip() or "(없음)"}
</기사_맥락>

<리포트_요약>
{report_summary.strip() or "(없음)"}
</리포트_요약>

위 공시에 대한 해설 기사를 출력 형식 그대로 작성하라."""

    full_prompt = _load_system_prompt() + "\n\n---\n\n" + user_prompt
    try:
        r = subprocess.run(
            [_claude_bin(), "-p", "--output-format", "text", "--model", MODEL],
            input=full_prompt, capture_output=True, text=True,
            encoding="utf-8", timeout=TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        print(f"  ⚠ claude -p 시간 초과 ({TIMEOUT}초)")
        LAST_ERROR["reason"] = f"claude -p 시간 초과({TIMEOUT}초)"
        return None
    if r.returncode != 0:
        # 한도 초과·인증 만료는 stderr가 비고 stdout에만 메시지가 오는 경우가 있다.
        # 사유가 안 남으면 '왜 폴백했는지'를 다시 재현해서 알아내야 한다 — 둘 다 남긴다.
        detail = ((r.stderr or "").strip() or (r.stdout or "").strip() or "(출력 없음)")[:200]
        print(f"  ⚠ claude -p 실패 (rc={r.returncode}): {detail}")
        LAST_ERROR["reason"] = f"claude -p rc={r.returncode}: {detail}"
        return None

    lines = [ln.rstrip() for ln in (r.stdout or "").strip().split("\n")]
    lines = [ln for i, ln in enumerate(lines) if ln or i > 0]  # 앞쪽 공백 제거
    if not lines:
        LAST_ERROR["reason"] = "출력 없음(빈 응답)"
        return None
    title = lines[0].strip().lstrip("#").strip()
    body = "\n".join(lines[1:]).strip()
    if not title or not body or len(body) < 50:
        LAST_ERROR["reason"] = f"출력 부실(제목 {len(title)}자 · 본문 {len(body)}자)"
        return None
    return title, body
