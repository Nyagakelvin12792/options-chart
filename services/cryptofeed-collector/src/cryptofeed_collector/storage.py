from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Iterable

from .dedupe import DuplicateSuppressor
from .events import CollectorRecord, MarketEventV1, record_from_dict, serialize_record
from .health import build_duplicate_event


class RotatingNDJSONWriter:
    """Thread-safe append-only NDJSON writer with exact SQLite dedupe.

    Callback threads and the stale monitor share one lock for dedupe, rotation,
    and file writes. SQLite stores every market event ID plus original
    firstSeenAtMs, so restart and LRU eviction cannot admit older duplicates.
    The in-memory LRU remains a hot-path cache; SQLite is the exact source of
    truth and is rebuilt from strict `<prefix>-*.ndjson` archives on startup.
    """

    def __init__(
        self,
        directory: str | Path,
        *,
        prefix: str,
        max_bytes: int,
        duplicate_suppressor: DuplicateSuppressor | None = None,
    ) -> None:
        if max_bytes <= 0:
            raise ValueError("max_bytes must be positive")
        self.directory = Path(directory)
        self.prefix = prefix
        self.max_bytes = max_bytes
        self._dedupe = duplicate_suppressor or DuplicateSuppressor()
        self._current_path: Path | None = None
        self._current_file = None
        self._lock = threading.RLock()
        self._closed = False
        self.directory.mkdir(parents=True, exist_ok=True)
        self._index_path = self.directory / f"{self.prefix}.dedupe.sqlite3"
        self._conn = sqlite3.connect(self._index_path, check_same_thread=False)
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS event_dedupe (
              event_id TEXT PRIMARY KEY,
              first_seen_at_ms INTEGER NOT NULL
            )
            """
        )
        self._conn.commit()
        self._rebuild_index_from_logs()

    def write(self, record: CollectorRecord) -> bool:
        with self._lock:
            if self._closed:
                raise RuntimeError("cannot write to closed RotatingNDJSONWriter")
            if isinstance(record, MarketEventV1):
                first_seen_at_ms = self._first_seen_at_ms(record)
                if first_seen_at_ms is not None:
                    self._write_duplicate(record, first_seen_at_ms)
                    return False
                self._remember_event(record)
            self._write_record(record)
            return True

    def _first_seen_at_ms(self, record: MarketEventV1) -> int | None:
        hot_seen_at_ms = self._dedupe.first_seen_at_ms(record.eventId)
        if hot_seen_at_ms is not None:
            return hot_seen_at_ms
        row = self._conn.execute(
            "SELECT first_seen_at_ms FROM event_dedupe WHERE event_id = ?",
            (record.eventId,),
        ).fetchone()
        return int(row[0]) if row is not None else None

    def _remember_event(self, record: MarketEventV1) -> None:
        self._dedupe.accept(record.eventId, first_seen_at_ms=record.receiptTimestampMs)
        self._conn.execute(
            "INSERT OR IGNORE INTO event_dedupe(event_id, first_seen_at_ms) VALUES (?, ?)",
            (record.eventId, record.receiptTimestampMs),
        )
        self._conn.commit()

    def _write_duplicate(self, record: MarketEventV1, first_seen_at_ms: int | None) -> None:
        self._write_record(
            build_duplicate_event(
                venue=record.venue,
                symbol=record.symbol,
                channel=record.channel,
                detected_at_ms=record.receiptTimestampMs,
                connection_id=record.provenance.connectionId,
                duplicate_event_id=record.eventId,
                first_seen_at_ms=first_seen_at_ms,
            )
        )

    def _write_record(self, record: CollectorRecord) -> None:
        line = serialize_record(record) + "\n"
        encoded_size = len(line.encode("utf-8"))
        self._ensure_file(encoded_size)
        assert self._current_file is not None
        self._current_file.write(line)
        self._current_file.flush()

    def write_many(self, events: Iterable[CollectorRecord]) -> int:
        written = 0
        for event in events:
            if self.write(event):
                written += 1
        return written

    def close(self) -> None:
        with self._lock:
            if self._closed:
                return
            if self._current_file is not None:
                self._current_file.close()
                self._current_file = None
            self._conn.close()
            self._closed = True

    def __enter__(self) -> "RotatingNDJSONWriter":
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def _ensure_file(self, next_size: int) -> None:
        if self._current_path is None:
            self._open_new_file()
            return
        current_size = self._current_path.stat().st_size
        if current_size > 0 and current_size + next_size > self.max_bytes:
            if self._current_file is not None:
                self._current_file.close()
            self._open_new_file()

    def _open_new_file(self) -> None:
        index = 0
        while True:
            candidate = self.directory / f"{self.prefix}-{index:06d}.ndjson"
            if not candidate.exists():
                self._current_path = candidate
                self._current_file = candidate.open("a", encoding="utf-8", newline="\n")
                return
            index += 1

    def _rebuild_index_from_logs(self) -> None:
        self._conn.execute("DELETE FROM event_dedupe")
        for path in self._log_files():
            with path.open("r", encoding="utf-8") as handle:
                lines = handle.readlines()
            for index, line in enumerate(lines):
                if not line.strip():
                    continue
                try:
                    record = record_from_dict(json.loads(line))
                except Exception:
                    is_corrupt_tail = index == len(lines) - 1 and not line.endswith("\n")
                    if is_corrupt_tail:
                        break
                    raise
                if isinstance(record, MarketEventV1):
                    self._conn.execute(
                        """
                        INSERT OR IGNORE INTO event_dedupe(event_id, first_seen_at_ms)
                        VALUES (?, ?)
                        """,
                        (record.eventId, record.receiptTimestampMs),
                    )
                    self._dedupe.accept(record.eventId, first_seen_at_ms=record.receiptTimestampMs)
        self._conn.commit()

    def _log_files(self) -> list[Path]:
        return sorted(self.directory.glob(f"{self.prefix}-*.ndjson"))
