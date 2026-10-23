"""Shared LLM client used by every agent.

Reads per-agent model and token settings from config/llm.yaml and returns
the response text plus a usage record the dashboard uses to estimate spend.

When TARGET_URI and AZURE_OPENAI_API_KEY (or TARGET_KEY) are set, calls go
to that OpenAI-compatible endpoint. Otherwise the client uses the Anthropic
Messages API (ANTHROPIC_API_KEY, optional ANTHROPIC_BASE_URL). Credentials
come from the environment, never from a config file.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import anthropic
import yaml
from openai import OpenAI

CONFIG_PATH = Path(os.environ.get("LLM_CONFIG", "/app/config/llm.yaml"))


@dataclass
class AgentConfig:
    model: str
    max_tokens: int
    effort: str
    base_url: str = ""


@dataclass
class Usage:
    model: str
    input_tokens: int = 0
    output_tokens: int = 0

    def cost_usd(self, pricing: dict[str, dict[str, float]]) -> float:
        rate = pricing.get(self.model, {})
        return (
            self.input_tokens / 1_000_000 * rate.get("input", 0.0)
            + self.output_tokens / 1_000_000 * rate.get("output", 0.0)
        )


@dataclass
class LLMResult:
    text: str
    usage: Usage
    stop_reason: str | None = None
    refusal: str | None = None
    raw_content: list[Any] = field(default_factory=list)


@lru_cache(maxsize=1)
def _load_config() -> dict[str, Any]:
    with CONFIG_PATH.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def pricing() -> dict[str, dict[str, float]]:
    return _load_config().get("pricing", {})


def agent_config(agent: str) -> AgentConfig:
    cfg = _load_config()
    defaults = cfg.get("defaults", {})
    spec = cfg.get("agents", {}).get(agent, {})
    return AgentConfig(
        model=spec.get("model", defaults.get("model", "grok-4.7")),
        max_tokens=int(spec.get("max_tokens", defaults.get("max_tokens", 16000))),
        effort=spec.get("effort", defaults.get("effort", "high")),
        base_url=spec.get("base_url", defaults.get("base_url", "")) or "",
    )


def _azure_key() -> str:
    return os.environ.get("AZURE_OPENAI_API_KEY") or os.environ.get("TARGET_KEY") or ""


def _azure_base() -> str:
    return (os.environ.get("TARGET_URI") or os.environ.get("AZURE_OPENAI_ENDPOINT") or "").rstrip("/")


def _uses_azure(base_url: str) -> bool:
    return bool(_azure_key() and (base_url or _azure_base()))


@lru_cache(maxsize=8)
def _openai_client(base_url: str) -> OpenAI:
    return OpenAI(api_key=_azure_key(), base_url=base_url)


@lru_cache(maxsize=8)
def _anthropic_client(base_url: str) -> anthropic.Anthropic:
    # Credentials resolve from the environment; we only override base_url.
    if base_url:
        return anthropic.Anthropic(base_url=base_url)
    env_base = os.environ.get("ANTHROPIC_BASE_URL", "")
    if env_base:
        return anthropic.Anthropic(base_url=env_base)
    return anthropic.Anthropic()


def _run_azure(
    agent: str,
    conf: AgentConfig,
    system: str,
    user: str,
    output_schema: dict[str, Any] | None,
) -> LLMResult:
    client = _openai_client(conf.base_url or _azure_base())
    kwargs: dict[str, Any] = {
        "model": conf.model,
        "max_completion_tokens": conf.max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    if output_schema is not None:
        kwargs["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": f"{agent}_output",
                "strict": True,
                "schema": output_schema,
            },
        }

    response = client.chat.completions.create(**kwargs)
    choice = response.choices[0]
    message = choice.message
    usage_block = response.usage
    usage = Usage(
        model=conf.model,
        input_tokens=getattr(usage_block, "prompt_tokens", 0) or 0,
        output_tokens=getattr(usage_block, "completion_tokens", 0) or 0,
    )
    refusal = getattr(message, "refusal", None)
    if refusal:
        return LLMResult(text="", usage=usage, stop_reason="refusal", refusal=refusal)
    return LLMResult(
        text=message.content or "",
        usage=usage,
        stop_reason=choice.finish_reason,
    )


def _run_anthropic(
    conf: AgentConfig,
    system: str,
    user: str,
    output_schema: dict[str, Any] | None,
) -> LLMResult:
    client = _anthropic_client(conf.base_url)
    kwargs: dict[str, Any] = {
        "model": conf.model,
        "max_tokens": conf.max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
        "output_config": {"effort": conf.effort},
    }
    if output_schema is not None:
        kwargs["output_config"]["format"] = {
            "type": "json_schema",
            "schema": output_schema,
        }

    message = client.messages.create(**kwargs)

    usage = Usage(
        model=conf.model,
        input_tokens=getattr(message.usage, "input_tokens", 0) or 0,
        output_tokens=getattr(message.usage, "output_tokens", 0) or 0,
    )

    if message.stop_reason == "refusal":
        details = getattr(message, "stop_details", None)
        return LLMResult(
            text="",
            usage=usage,
            stop_reason="refusal",
            refusal=getattr(details, "explanation", "refused") if details else "refused",
            raw_content=list(message.content),
        )

    text = "".join(b.text for b in message.content if getattr(b, "type", None) == "text")
    return LLMResult(
        text=text,
        usage=usage,
        stop_reason=message.stop_reason,
        raw_content=list(message.content),
    )


def run_agent(
    agent: str,
    system: str,
    user: str,
    *,
    output_schema: dict[str, Any] | None = None,
) -> LLMResult:
    """Make one model call for the named agent.

    If output_schema is given, the model is constrained to return JSON
    matching that schema, so callers can json.loads the result safely.
    """
    conf = agent_config(agent)
    if _uses_azure(conf.base_url):
        return _run_azure(agent, conf, system, user, output_schema)
    return _run_anthropic(conf, system, user, output_schema)
