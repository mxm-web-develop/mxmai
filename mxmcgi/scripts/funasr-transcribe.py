#!/usr/bin/env python3
"""
FunASR 口播转写（Paraformer + VAD + 标点），输出句级时间戳 JSON 到 stdout。

安装（主服务器 / Worker 宿主机）：
  pip install -U funasr modelscope

环境变量（可选）：
  FUNASR_MODEL=paraformer-zh
  FUNASR_MODEL_REVISION=v2.0.4
  FUNASR_VAD_MODEL=fsmn-vad
  FUNASR_PUNC_MODEL=ct-punc-c
  FUNASR_DISABLE_VAD=1   # 设为 1 则不用 VAD
  FUNASR_DISABLE_PUNC=1  # 设为 1 则不用标点模型

用法：
  python funasr-transcribe.py /path/to/audio.wav
"""
from __future__ import annotations

import json
import os
import sys


def _ms_to_sec(value: object) -> float:
    n = float(value)
    # FunASR sentence_info 的 start/end 均为毫秒
    return round(n / 1000.0, 3)


def _segments_from_sentence_info(items: list) -> list[dict]:
    segments: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        start = item.get("start", item.get("start_time", item.get("begin_time", 0)))
        end = item.get("end", item.get("end_time", item.get("finish_time", start)))
        segments.append(
            {
                "text": text,
                "startSeconds": _ms_to_sec(start),
                "endSeconds": _ms_to_sec(end),
            }
        )
    return segments


def _segments_from_timestamp(text: str, timestamp: list) -> list[dict]:
    """字符级 timestamp [[start_ms, end_ms], ...] → 整段单句（兜底）"""
    if not text.strip():
        return []
    if not timestamp:
        return [{"text": text.strip(), "startSeconds": 0.0, "endSeconds": 1.0}]
    try:
        start_ms = float(timestamp[0][0])
        end_ms = float(timestamp[-1][1])
    except (TypeError, IndexError, ValueError):
        return [{"text": text.strip(), "startSeconds": 0.0, "endSeconds": 1.0}]
    return [
        {
            "text": text.strip(),
            "startSeconds": _ms_to_sec(start_ms),
            "endSeconds": _ms_to_sec(max(end_ms, start_ms + 50)),
        }
    ]


def normalize_funasr_result(raw: object) -> dict:
    if isinstance(raw, list) and raw:
        raw = raw[0]
    if not isinstance(raw, dict):
        raise ValueError(f"FunASR 返回格式异常: {type(raw).__name__}")

    text = str(raw.get("text") or "").strip()
    sentence_info = raw.get("sentence_info")
    segments: list[dict] = []

    if isinstance(sentence_info, list) and sentence_info:
        segments = _segments_from_sentence_info(sentence_info)

    if not segments and text:
        timestamp = raw.get("timestamp")
        if isinstance(timestamp, list):
            segments = _segments_from_timestamp(text, timestamp)
        else:
            segments = [{"text": text, "startSeconds": 0.0, "endSeconds": 1.0}]

    if not segments:
        raise ValueError("FunASR 未识别到有效语音内容")

    full_text = text or "".join(s["text"] for s in segments)
    return {"text": full_text, "segments": segments}


def build_model():
    from funasr import AutoModel

    model = os.environ.get("FUNASR_MODEL", "paraformer-zh").strip() or "paraformer-zh"
    revision = os.environ.get("FUNASR_MODEL_REVISION", "v2.0.4").strip() or "v2.0.4"
    kwargs: dict = {
        "model": model,
        "model_revision": revision,
        "disable_update": True,
    }

    if os.environ.get("FUNASR_DISABLE_VAD", "").strip() != "1":
        vad = os.environ.get("FUNASR_VAD_MODEL", "fsmn-vad").strip() or "fsmn-vad"
        vad_rev = os.environ.get("FUNASR_VAD_MODEL_REVISION", "v2.0.4").strip() or "v2.0.4"
        kwargs["vad_model"] = vad
        kwargs["vad_model_revision"] = vad_rev

    if os.environ.get("FUNASR_DISABLE_PUNC", "").strip() != "1":
        punc = os.environ.get("FUNASR_PUNC_MODEL", "ct-punc-c").strip() or "ct-punc-c"
        punc_rev = os.environ.get("FUNASR_PUNC_MODEL_REVISION", "v2.0.4").strip() or "v2.0.4"
        kwargs["punc_model"] = punc
        kwargs["punc_model_revision"] = punc_rev

    return AutoModel(**kwargs)


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: funasr-transcribe.py <audio_path>", file=sys.stderr)
        return 2

    # 降低 FunASR / ModelScope 日志污染 stdout
    os.environ.setdefault("MODELSCOPE_LOG_LEVEL", "40")
    import logging

    logging.getLogger("funasr").setLevel(logging.ERROR)
    logging.getLogger("modelscope").setLevel(logging.ERROR)

    audio_path = sys.argv[1]
    if not os.path.isfile(audio_path):
        print(f"audio file not found: {audio_path}", file=sys.stderr)
        return 2

    try:
        model = build_model()
        batch_size_s = int(os.environ.get("FUNASR_BATCH_SIZE_S", "300") or "300")
        raw = model.generate(
            input=audio_path,
            batch_size_s=batch_size_s,
            sentence_timestamp=True,
        )
        payload = normalize_funasr_result(raw)
        print(json.dumps(payload, ensure_ascii=False))
        return 0
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
