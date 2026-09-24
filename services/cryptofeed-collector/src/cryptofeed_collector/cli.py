from __future__ import annotations

import argparse

from .adapter import run_live
from .config import load_config
from .storage import RotatingNDJSONWriter


def main() -> int:
    parser = argparse.ArgumentParser(description="options-chart Cryptofeed shadow collector")
    parser.add_argument("--config", required=True)
    parser.add_argument("--live", action="store_true", help="Opt in to public live collection")
    args = parser.parse_args()

    config = load_config(args.config)
    if not args.live or not config.live_enabled:
        print("Config valid. Live collection is disabled; pass --live and enable liveCollection.enabled.")
        return 0

    with RotatingNDJSONWriter(
        config.storage.directory,
        prefix=config.storage.prefix,
        max_bytes=config.storage.max_bytes,
    ) as writer:
        run_live(config, writer)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
