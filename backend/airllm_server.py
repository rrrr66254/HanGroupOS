#!/usr/bin/env python3
"""
AirLLM OpenAI-Compatible Server
================================
70B 이상의 대형 모델을 4~8GB VRAM으로 실행하는 독립 서버입니다.
레이어별 스트리밍 방식으로 VRAM 사용량을 97% 줄입니다.

⚠️  주의사항:
  - 레이어를 하나씩 로드/언로드하므로 응답 속도가 매우 느립니다 (수 분 소요 가능)
  - 실시간 대화보다 배치 처리나 비동기 작업에 적합합니다
  - 처음 실행 시 모델을 레이어로 분할 저장하므로 첫 로딩에 오래 걸립니다

설치:
  pip install airllm bitsandbytes uvicorn fastapi

실행 예시:
  # 70B 모델을 4bit 압축으로 실행 (VRAM 4GB 필요)
  python backend/airllm_server.py \\
    --model meta-llama/Meta-Llama-3-70B \\
    --compression 4bit \\
    --port 11435

  # Qwen 72B 8bit 압축 (VRAM 8GB 필요)
  python backend/airllm_server.py \\
    --model Qwen/Qwen2.5-72B-Instruct \\
    --compression 8bit \\
    --port 11435

  # 압축 없이 실행 (VRAM 충분한 경우)
  python backend/airllm_server.py \\
    --model meta-llama/Meta-Llama-3-8B-Instruct \\
    --port 11435

HAN Group OS 연결:
  AI 모델 관리 → provider: airllm
  base_url: http://localhost:11435/v1
  model: (위에서 지정한 모델명)

VRAM 요구사항:
  압축 없음  | 7B  ≈ 14GB | 13B ≈ 26GB | 70B ≈ 140GB
  8bit 압축  | 7B  ≈  7GB | 13B ≈ 13GB | 70B ≈  4GB
  4bit 압축  | 7B  ≈  4GB | 13B ≈  7GB | 70B ≈  4GB (최소)
"""
import argparse
import time
import uuid
import sys
from typing import List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# ── 전역 상태 ─────────────────────────────────────────────────────────────────
_model = None
_tokenizer = None
_model_name: str = ""
_compression: Optional[str] = None  # None | "4bit" | "8bit"
_max_length: int = 4096

app = FastAPI(
    title="AirLLM Server",
    description="AirLLM OpenAI-Compatible Inference Server (극저VRAM 모드)",
    version="1.0.0",
)


# ── 요청/응답 스키마 (OpenAI 호환) ──────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: str = "default"
    messages: List[ChatMessage]
    max_tokens: Optional[int] = 512
    temperature: Optional[float] = 0.7
    stream: bool = False


class UsageInfo(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class ChatCompletionChoice(BaseModel):
    index: int
    message: ChatMessage
    finish_reason: str


class ChatCompletionResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: List[ChatCompletionChoice]
    usage: UsageInfo


# ── 모델 로딩 ─────────────────────────────────────────────────────────────────
def _load_model_if_needed():
    global _model, _tokenizer
    if _model is not None:
        return

    print(f"\n[AirLLM] 모델 로딩 중: {_model_name}")
    print(f"[AirLLM] 압축 모드: {_compression or '없음 (전체 정밀도)'}")
    print("[AirLLM] 처음 실행 시 레이어 분할 저장으로 시간이 오래 걸릴 수 있습니다...")

    try:
        from airllm import AutoModel
        from transformers import AutoTokenizer

        kwargs = {}
        if _compression in ("4bit", "8bit"):
            kwargs["compression"] = _compression

        _model = AutoModel.from_pretrained(_model_name, **kwargs)
        _tokenizer = AutoTokenizer.from_pretrained(_model_name)

        if _tokenizer.pad_token is None:
            _tokenizer.pad_token = _tokenizer.eos_token

        print(f"[AirLLM] 모델 로딩 완료: {_model_name}")

    except ImportError:
        raise RuntimeError(
            "airllm 또는 transformers 패키지가 설치되지 않았습니다.\n"
            "설치: pip install airllm bitsandbytes transformers"
        )
    except Exception as e:
        raise RuntimeError(f"[AirLLM] 모델 로딩 실패: {e}")


def _format_prompt(messages: List[ChatMessage]) -> str:
    """
    Chat 메시지를 모델 입력 텍스트로 변환합니다.
    모델별 chat_template이 있으면 tokenizer가 자동 처리하고,
    없으면 단순 텍스트 포맷으로 fallback합니다.
    """
    # chat_template 사용 시도
    try:
        msg_dicts = [{"role": m.role, "content": m.content} for m in messages]
        prompt = _tokenizer.apply_chat_template(
            msg_dicts,
            tokenize=False,
            add_generation_prompt=True,
        )
        return prompt
    except Exception:
        pass

    # Fallback: 단순 텍스트 포맷
    parts = []
    for msg in messages:
        if msg.role == "system":
            parts.append(f"[SYSTEM]\n{msg.content}\n")
        elif msg.role == "user":
            parts.append(f"[USER]\n{msg.content}\n")
        elif msg.role == "assistant":
            parts.append(f"[ASSISTANT]\n{msg.content}\n")
    parts.append("[ASSISTANT]\n")
    return "".join(parts)


# ── API 엔드포인트 ─────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": _model_name,
        "compression": _compression,
        "model_loaded": _model is not None,
    }


@app.get("/v1/models")
def list_models():
    """OpenAI 호환 모델 목록 엔드포인트."""
    return {
        "object": "list",
        "data": [
            {
                "id": _model_name or "airllm-model",
                "object": "model",
                "created": int(time.time()),
                "owned_by": "airllm",
            }
        ],
    }


@app.post("/v1/chat/completions", response_model=ChatCompletionResponse)
def chat_completions(req: ChatCompletionRequest):
    """
    OpenAI 호환 Chat Completions 엔드포인트.
    AirLLM의 레이어별 추론을 사용합니다 (속도 느림, VRAM 최소).
    """
    _load_model_if_needed()

    if not req.messages:
        raise HTTPException(400, "messages 필드가 비어 있습니다.")

    t_start = time.time()

    # 프롬프트 생성
    prompt = _format_prompt(req.messages)

    # 토크나이즈
    inputs = _tokenizer(
        prompt,
        return_tensors="pt",
        truncation=True,
        max_length=_max_length,
        padding=False,
    )
    prompt_len = inputs.input_ids.shape[1]

    # AirLLM 생성
    try:
        import torch
        output_ids = _model.generate(
            inputs.input_ids,
            max_new_tokens=req.max_tokens or 512,
            do_sample=req.temperature and req.temperature > 0,
            temperature=req.temperature if req.temperature and req.temperature > 0 else None,
            pad_token_id=_tokenizer.pad_token_id,
        )
    except Exception as e:
        raise HTTPException(500, f"AirLLM 추론 오류: {e}")

    # 새로 생성된 토큰만 디코딩
    new_ids = output_ids[0][prompt_len:]
    text = _tokenizer.decode(new_ids, skip_special_tokens=True).strip()

    elapsed = round(time.time() - t_start, 2)
    print(f"[AirLLM] 생성 완료: {len(new_ids)} 토큰, {elapsed}초 소요")

    return ChatCompletionResponse(
        id=f"chatcmpl-{uuid.uuid4().hex[:12]}",
        created=int(time.time()),
        model=_model_name,
        choices=[
            ChatCompletionChoice(
                index=0,
                message=ChatMessage(role="assistant", content=text),
                finish_reason="stop",
            )
        ],
        usage=UsageInfo(
            prompt_tokens=prompt_len,
            completion_tokens=len(new_ids),
            total_tokens=prompt_len + len(new_ids),
        ),
    )


# ── 엔트리포인트 ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="AirLLM OpenAI-Compatible Server",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--model",
        required=True,
        help="HuggingFace 모델 ID (예: meta-llama/Meta-Llama-3-70B)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=11435,
        help="서버 포트 (기본값: 11435)",
    )
    parser.add_argument(
        "--compression",
        choices=["4bit", "8bit", "none"],
        default="4bit",
        help="압축 모드 (기본값: 4bit). none = 압축 없음",
    )
    parser.add_argument(
        "--max-length",
        type=int,
        default=4096,
        help="최대 입력 토큰 길이 (기본값: 4096)",
    )
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="서버 호스트 (기본값: 0.0.0.0)",
    )
    args = parser.parse_args()

    _model_name = args.model
    _compression = None if args.compression == "none" else args.compression
    _max_length = args.max_length

    print("=" * 60)
    print("AirLLM OpenAI-Compatible Server")
    print("=" * 60)
    print(f"  모델    : {_model_name}")
    print(f"  압축    : {_compression or '없음'}")
    print(f"  포트    : {args.port}")
    print(f"  API URL : http://localhost:{args.port}/v1")
    print("=" * 60)
    print("HAN Group OS 연결 방법:")
    print("  provider: airllm")
    print(f"  base_url: http://localhost:{args.port}/v1")
    print(f"  model: {_model_name}")
    print("=" * 60)
    print("⚠️  첫 요청 시 모델을 레이어로 분할합니다. 시간이 걸릴 수 있습니다.")
    print()

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
