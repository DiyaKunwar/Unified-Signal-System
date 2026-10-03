#!/usr/bin/env python3
"""
USS — Multi-Agent Orchestration Layer

Sequentially calls the Macro-Forecast Agent, the Micro-V2X Agent, and the
Supervisor Agent (see uss_agent_prompts.md for the finalized system
prompts), using direct HTTP calls to the Mistral API rather than the mistralai
SDK — consistent with the setup that already worked on this machine.

Env vars expected:
    MISTRAL_API_KEY        - required
    MACRO_AGENT_MODEL      - optional, defaults to mistral-large-latest
    V2X_AGENT_MODEL        - optional, defaults to mistral-large-latest
    SUPERVISOR_AGENT_MODEL - optional, defaults to mistral-large-latest

If you're calling actual Mistral Studio "agents" (not raw models), swap the
payload's "model" key for "agent_id" and POST to the /v1/agents/completions
endpoint instead — the JSON-retry and orchestration logic below is unchanged
either way.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import requests


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader (KEY=value lines); real env vars take precedence."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.partition("=")
        if sep and not key.strip().startswith("#"):
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(Path(__file__).parent / ".env")

MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions"
MISTRAL_API_KEY = os.environ.get("MISTRAL_API_KEY")

MACRO_MODEL = os.environ.get("MACRO_AGENT_MODEL", "mistral-large-latest")
V2X_MODEL = os.environ.get("V2X_AGENT_MODEL", "mistral-large-latest")
SUPERVISOR_MODEL = os.environ.get("SUPERVISOR_AGENT_MODEL", "mistral-large-latest")

MAX_JSON_RETRIES = 2


def _headers() -> dict[str, str]:
    if not MISTRAL_API_KEY:
        raise RuntimeError(
            "MISTRAL_API_KEY environment variable is not set. "
            "Export it before running this script."
        )
    return {
        "Authorization": f"Bearer {MISTRAL_API_KEY}",
        "Content-Type": "application/json",
    }


def call_mistral(system_prompt: str, user_content: str, model: str, temperature: float = 0.1,
                 history: list[dict[str, str]] | None = None) -> str:
    """Direct HTTP call to the Mistral chat completions endpoint."""
    payload = {
        "model": model,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system_prompt},
            *(history or []),
            {"role": "user", "content": user_content},
        ],
    }
    resp = requests.post(MISTRAL_API_URL, headers=_headers(), json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"]


def _strip_code_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
    return text.strip()


def call_mistral_json(system_prompt: str, user_content: str, model: str, temperature: float = 0.0) -> dict[str, Any]:
    """
    Calls an agent and enforces JSON-parseable output. If the model returns
    malformed JSON (common with structured-output prompts), retries with an
    explicit correction turn instead of failing the whole pipeline.
    """
    content = call_mistral(system_prompt, user_content, model, temperature)

    last_error: Exception | None = None
    for attempt in range(MAX_JSON_RETRIES + 1):
        try:
            return json.loads(_strip_code_fence(content))
        except json.JSONDecodeError as e:
            last_error = e
            if attempt == MAX_JSON_RETRIES:
                break
            correction_prompt = (
                "Your previous response was not valid JSON and could not be parsed. "
                f"Parse error: {e}. Re-output ONLY the corrected JSON object — no markdown "
                "fences, no commentary, no text outside the JSON."
            )
            # Keep the original data and the bad answer in context so the model fixes it
            # instead of regenerating from nothing.
            history = [
                {"role": "user", "content": user_content},
                {"role": "assistant", "content": content},
            ]
            content = call_mistral(system_prompt, correction_prompt, model, temperature, history)

    raise ValueError(
        f"Agent did not return valid JSON after {MAX_JSON_RETRIES} retries.\n"
        f"Last error: {last_error}\nLast raw output:\n{content}"
    )


def run_macro_agent(macro_system_prompt: str, prediction_rows_json: str) -> dict[str, Any]:
    user_content = (
        "Here is the current holdout prediction dataset (rows from "
        "predictions_train_2023_2024_test_2025.csv), as JSON records:\n\n"
        f"{prediction_rows_json}"
    )
    return call_mistral_json(macro_system_prompt, user_content, MACRO_MODEL, temperature=0.0)


def run_v2x_agent(v2x_system_prompt: str, telemetry_payload: dict[str, Any]) -> dict[str, Any]:
    user_content = f"Live RSU telemetry payload:\n\n{json.dumps(telemetry_payload, indent=2)}"
    return call_mistral_json(v2x_system_prompt, user_content, V2X_MODEL, temperature=0.0)


def run_supervisor_agent(
    supervisor_system_prompt: str,
    macro_output: dict[str, Any],
    v2x_output: dict[str, Any],
) -> str:
    """
    The Supervisor's output is human-readable markdown WITH a trailing JSON
    block (see prompts file), so we return the raw text rather than parsing
    it as pure JSON. Downstream code that needs the structured fields should
    extract the fenced ```json ... ``` block at the end of the response.
    """
    user_content = (
        f"[MACRO_INPUT]\n{json.dumps(macro_output, indent=2)}\n\n"
        f"[V2X_INPUT]\n{json.dumps(v2x_output, indent=2)}"
    )
    return call_mistral(supervisor_system_prompt, user_content, SUPERVISOR_MODEL, temperature=0.2)


def extract_supervisor_json(supervisor_response: str) -> dict[str, Any]:
    """Pulls the trailing ```json ... ``` block out of the Supervisor's markdown response."""
    marker = "```json"
    start = supervisor_response.rfind(marker)
    if start == -1:
        raise ValueError("No machine-readable JSON block found in Supervisor output.")
    start += len(marker)
    end = supervisor_response.find("```", start)
    if end == -1:
        raise ValueError("Unterminated JSON block in Supervisor output.")
    return json.loads(supervisor_response[start:end].strip())


MACRO_COLUMNS = [
    "year_month", "location_id", "road_code", "direction", "hour",
    "pred_later_anpr_passage_mean", "pred_congestion_probability", "risk_band",
]


def load_prediction_rows(csv_path: str, year_month: str, hour: int) -> str:
    """All corridors for one month and hour (every risk tier, not just the top rows) as JSON for Agent 1."""
    import pandas as pd

    df = pd.read_csv(csv_path)
    df = df[(df["year_month"] == year_month) & (df["hour"] == hour)]
    if df.empty:
        raise ValueError(f"No prediction rows for {year_month} hour {hour} in {csv_path}")
    return df[MACRO_COLUMNS].to_json(orient="records")


def load_prompts(prompts_md_path: str) -> dict[str, str]:
    """
    Extracts the three fenced ```markdown ... ``` system prompt blocks from
    uss_agent_prompts.md, in the order they appear (Macro, V2X, Supervisor).
    Sections are separated by '---' lines; each block runs to the LAST fence in
    its section, because the Supervisor prompt itself contains a nested ```json block.
    """
    text = Path(prompts_md_path).read_text(encoding="utf-8")
    marker = "```markdown"
    blocks: list[str] = []
    for section in text.split("\n---\n"):
        start = section.find(marker)
        end = section.rfind("```")
        if start != -1 and end > start:
            blocks.append(section[start + len(marker):end].strip())
    if len(blocks) < 3:
        raise ValueError(
            f"Expected 3 system prompt blocks in {prompts_md_path}, found {len(blocks)}. "
            "Check the file hasn't been edited in a way that breaks the fenced blocks."
        )
    return {"macro": blocks[0], "v2x": blocks[1], "supervisor": blocks[2]}


def main() -> None:
    prompts_path = Path(__file__).parent / "uss_agent_prompts.md"
    prompts = load_prompts(str(prompts_path))

    # --- Example run (replace paths/payload with your real hackathon data) ---
    predictions_csv = str(Path(__file__).parent / "data/anpr_synthetic_accuracy_results/predictions_train_2023_2024_test_2025.csv")
    year_month, hour = "2025-10", 8
    # Telemetry is a hand-written sample: there is no live RSU feed in this project.
    sample_telemetry = {
        "timestamp": "2025-10-15 08:14:32",
        "rsu_id": "RSU-SZR-N1-01",
        "location_id": "SZR_N1",
        "current_avg_speed_kmh": 12.5,
        "spatial_queue_meters": 260,
        "emergency_vehicle_in_bound": False,
        "free_flow_speed_kmh": 60.0,
    }

    if not Path(predictions_csv).exists():
        print(
            f"[info] '{predictions_csv}' not found in the current directory — "
            "run run_accuracy_evaluation.py first to generate the holdout predictions."
        )
        return

    macro_rows_json = load_prediction_rows(predictions_csv, year_month, hour)
    macro_out = run_macro_agent(prompts["macro"], macro_rows_json)
    v2x_out = run_v2x_agent(prompts["v2x"], sample_telemetry)
    supervisor_text = run_supervisor_agent(prompts["supervisor"], macro_out, v2x_out)

    print(supervisor_text)
    print("\n--- Machine-readable Supervisor output ---")
    print(json.dumps(extract_supervisor_json(supervisor_text), indent=2))


if __name__ == "__main__":
    main()