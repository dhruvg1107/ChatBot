from __future__ import annotations

import json
import os
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"

FALLBACK_FREE_MODELS = [
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemini-2.5-flash:free",
    "qwen/qwen-2.5-72b-instruct:free",
    "microsoft/phi-3-medium-128k-instruct:free",
]

MODEL_CACHE = {"expires": 0.0, "models": []}


def send_json(handler, status: int, payload: dict) -> None:
    data = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def read_json_body(handler) -> dict:
    length = int(handler.headers.get("Content-Length", "0"))
    if not length:
        return {}
    try:
        return json.loads(handler.rfile.read(length).decode("utf-8"))
    except json.JSONDecodeError:
        return {}


def clean_messages(messages: list[dict], max_messages: int = 10) -> list[dict]:
    cleaned = []
    for item in messages[-max_messages:]:
        role = "assistant" if item.get("role") in {"assistant", "bot", "model"} else "user"
        content = str(item.get("content", "")).strip()
        if content:
            cleaned.append({"role": role, "content": content[:4000]})
    return cleaned


def parse_openrouter_error(status: int, payload: str) -> tuple[int, dict]:
    try:
        data = json.loads(payload)
        message = data.get("error", {}).get("message") or data.get("message") or payload
    except json.JSONDecodeError:
        message = payload

    if status in {401, 403}:
        friendly = "OpenRouter rejected the server API key. Check OPENROUTER_API_KEY in Vercel."
    elif status in {402, 429}:
        friendly = "OpenRouter free-model limit or rate limit was reached. Try another free model or wait before retrying."
    else:
        friendly = "OpenRouter returned an error."

    return status, {"error": f"{friendly} Details: {message}"}


def fetch_free_models() -> list[str]:
    now = time.time()
    if MODEL_CACHE["models"] and MODEL_CACHE["expires"] > now:
        return MODEL_CACHE["models"]

    req = Request(OPENROUTER_MODELS_URL, headers={"Accept": "application/json"}, method="GET")
    try:
        with urlopen(req, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8"))
        models = [
            item["id"]
            for item in data.get("data", [])
            if isinstance(item, dict) and str(item.get("id", "")).endswith(":free")
        ]
        if models:
            MODEL_CACHE["models"] = models
            MODEL_CACHE["expires"] = now + 15 * 60
            return models
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, KeyError):
        pass

    return FALLBACK_FREE_MODELS


def call_openrouter(body: dict) -> tuple[int, dict]:
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        return 500, {"error": "OPENROUTER_API_KEY is missing on the server. Add it in Vercel Environment Variables."}

    free_models = fetch_free_models()
    requested_model = body.get("model") or free_models[0]
    if requested_model not in free_models:
        requested_model = free_models[0]

    temperature = max(0, min(1, float(body.get("temperature") or 0.7)))
    system_prompt = (body.get("systemPrompt") or "You are a helpful AI assistant.").strip()
    messages = [{"role": "system", "content": system_prompt}, *clean_messages(body.get("messages") or [])]
    model_attempts = [requested_model, *[model for model in free_models if model != requested_model]][:6]

    last_status = 502
    last_error = {"error": "No OpenRouter free model route succeeded."}

    for model in model_attempts:
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": 1200,
        }
        req = Request(
            OPENROUTER_CHAT_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://vercel.app",
                "X-Title": "AetherAI Chatbot",
            },
            method="POST",
        )

        try:
            with urlopen(req, timeout=45) as response:
                data = json.loads(response.read().decode("utf-8"))
            text = data.get("choices", [{}])[0].get("message", {}).get("content")
            if text:
                return 200, {"reply": text, "model": model}
            last_status = 502
            last_error = {"error": "OpenRouter returned an empty response. Trying another free model failed."}
        except HTTPError as exc:
            last_status, last_error = parse_openrouter_error(
                exc.code,
                exc.read().decode("utf-8", errors="replace"),
            )
            if exc.code in {400, 402, 404, 429, 503}:
                continue
            return last_status, last_error
        except URLError as exc:
            return 502, {"error": f"Could not reach OpenRouter from Vercel: {exc.reason}"}
        except TimeoutError:
            last_status = 504
            last_error = {"error": "OpenRouter request timed out. Try again in a moment."}

    return last_status, last_error
