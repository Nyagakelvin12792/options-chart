from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Iterator

from .events import MarketEventV1, MarketHealthEventV1, record_from_dict, serialize_record


def replay_events(
    path: str | Path,
    *,
    prefix: str | None = None,
    effective_at_ms: int | None = None,
) -> Iterator[dict]:
    for file_path in _input_files(Path(path), prefix=prefix):
        with file_path.open("r", encoding="utf-8") as handle:
            lines = handle.readlines()
            for index, line in enumerate(lines):
                line_number = index + 1
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    record = record_from_dict(json.loads(stripped))
                except Exception as exc:  # pragma: no cover - message path tested.
                    is_corrupt_tail = index == len(lines) - 1 and not line.endswith("\n")
                    if is_corrupt_tail:
                        break
                    raise ValueError(f"invalid event at {file_path}:{line_number}: {exc}") from exc
                if effective_at_ms is not None and _effective_time_ms(record) > effective_at_ms:
                    continue
                yield json.loads(serialize_record(record))


def replay_hash(
    path: str | Path,
    *,
    prefix: str | None = None,
    effective_at_ms: int | None = None,
) -> str:
    digest = hashlib.sha256()
    for event in replay_events(path, prefix=prefix, effective_at_ms=effective_at_ms):
        digest.update(json.dumps(event, sort_keys=True, separators=(",", ":")).encode("utf-8"))
        digest.update(b"\n")
    return digest.hexdigest()


def _input_files(path: Path, *, prefix: str | None) -> list[Path]:
    if path.is_file():
        return [path]
    pattern = f"{prefix}-*.ndjson" if prefix is not None else "*.ndjson"
    return sorted(p for p in path.glob(pattern) if p.is_file())


def _effective_time_ms(record: MarketEventV1 | MarketHealthEventV1) -> int:
    if isinstance(record, MarketEventV1):
        return record.receiptTimestampMs
    return record.detectedAtMs
