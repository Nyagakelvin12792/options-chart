from __future__ import annotations

from collections import OrderedDict


class DuplicateSuppressor:
    def __init__(self, max_entries: int = 100_000) -> None:
        if max_entries <= 0:
            raise ValueError("max_entries must be positive")
        self._max_entries = max_entries
        self._seen: OrderedDict[str, int | None] = OrderedDict()

    def accept(self, event_id: str, *, first_seen_at_ms: int | None = None) -> bool:
        if event_id in self._seen:
            self._seen.move_to_end(event_id)
            return False
        self._seen[event_id] = first_seen_at_ms
        if len(self._seen) > self._max_entries:
            self._seen.popitem(last=False)
        return True

    def first_seen_at_ms(self, event_id: str) -> int | None:
        return self._seen.get(event_id)
