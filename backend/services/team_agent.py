"""
Team Agent — 동일 레벨 에이전트 공유 컨텍스트 협업
===================================================
하이브리드 구조:
  - 동일 레벨 (CEO↔CEO, 전문가↔전문가): Team Agent (병렬, 공유 컨텍스트)
  - 상하 레벨 (CEO→회장, 팀원→팀장): Sub Agent 유지 (계층 보고)

흐름:
1. 토픽 + 에이전트 목록으로 TeamSession 초기화
2. 각 라운드: asyncio.gather()로 모든 에이전트 병렬 응답
   - 각 에이전트는 다른 에이전트 발언이 포함된 공유 컨텍스트를 봄
3. max_rounds 완료 후 → 상위 계층으로 결과 보고 (Sub Agent 방식)
"""
import asyncio
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any


@dataclass
class TeamMessage:
    agent_name: str
    content: str
    round_num: int


@dataclass
class TeamSession:
    topic: str
    messages: List[TeamMessage] = field(default_factory=list)

    def get_shared_context_for(self, requesting_agent: str) -> List[Dict]:
        """요청 에이전트 입장의 공유 컨텍스트 구성.

        - 자신의 발언: role="assistant"
        - 다른 에이전트 발언: role="user", "[이름]: 내용" 형식으로 표시

        이를 통해 각 에이전트가 다른 에이전트의 발언을 볼 수 있음.
        """
        result = []
        for msg in self.messages:
            if msg.agent_name == requesting_agent:
                result.append({"role": "assistant", "content": msg.content})
            else:
                result.append({
                    "role": "user",
                    "content": f"[{msg.agent_name}]: {msg.content}",
                })
        return result


async def _agent_respond(
    agent: Dict,
    session: TeamSession,
    round_num: int,
    topic: str,
) -> Dict[str, Any]:
    """에이전트 하나의 비동기 응답 — 공유 컨텍스트 포함."""
    shared = session.get_shared_context_for(agent["name"])

    messages = [{"role": "user", "content": f"팀 토론 주제: {topic}"}]
    messages.extend(shared)

    if round_num > 1:
        messages.append({
            "role": "user",
            "content": "위 동료들의 의견을 참고하여 추가 의견이나 합의점을 말씀해주세요.",
        })
    else:
        messages.append({
            "role": "user",
            "content": "이 주제에 대한 의견을 말씀해주세요.",
        })

    loop = asyncio.get_event_loop()
    provider = agent["provider"]
    system = agent.get("system", "")

    response = await loop.run_in_executor(
        None, provider.chat, messages, system
    )

    # 응답을 공유 세션에 추가 (뮤텍스 없이 — asyncio는 단일 스레드 이벤트 루프)
    session.messages.append(TeamMessage(agent["name"], response, round_num))

    return {"agent": agent["name"], "response": response, "round": round_num}


async def run_team_discussion(
    agents: List[Dict],
    topic: str,
    max_rounds: int = 2,
) -> Dict[str, Any]:
    """동일 레벨 에이전트들의 팀 토론.

    Args:
        agents: 에이전트 목록. 각 항목은 {"name": str, "provider": AIProvider, "system": str}
        topic: 토론 주제
        max_rounds: 최대 라운드 수 (기본 2)

    Returns:
        {
            "topic": str,
            "rounds": [[{"agent": str, "response": str, "round": int}, ...], ...],
            "all_messages": [{"agent_name": str, "content": str, "round_num": int}, ...],
            "agent_count": int,
            "total_rounds": int,
        }

    중요: 각 라운드는 모든 에이전트가 병렬로 응답함.
    단, 같은 라운드 내 에이전트들은 다른 에이전트의 발언을 볼 수 없음
    (같은 라운드는 동시 실행). 이전 라운드 발언은 모두 공유됨.
    """
    session = TeamSession(topic=topic)
    rounds = []

    for round_num in range(1, max_rounds + 1):
        # 이 라운드의 모든 에이전트를 병렬 실행
        # 주의: 이전 라운드 발언은 공유되지만 같은 라운드는 동시 실행됨
        tasks = [_agent_respond(a, session, round_num, topic) for a in agents]
        round_results = await asyncio.gather(*tasks)
        rounds.append(list(round_results))

    return {
        "topic": topic,
        "rounds": rounds,
        "all_messages": [
            {"agent_name": m.agent_name, "content": m.content, "round_num": m.round_num}
            for m in session.messages
        ],
        "agent_count": len(agents),
        "total_rounds": max_rounds,
    }


def format_team_discussion(result: Dict[str, Any]) -> str:
    """팀 토론 결과를 상위 계층 보고용 텍스트로 포맷."""
    lines = [f"=== 팀 토론 결과 ===", f"주제: {result['topic']}", ""]
    for round_data in result["rounds"]:
        round_num = round_data[0]["round"] if round_data else "?"
        lines.append(f"【라운드 {round_num}】")
        for item in round_data:
            lines.append(f"\n[{item['agent']}]")
            lines.append(item["response"])
        lines.append("")
    return "\n".join(lines)
