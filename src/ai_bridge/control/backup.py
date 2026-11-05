"""Offline SQLite backup/restore verification. Never replaces a live database.

Usage: python -m ai_bridge.control.backup SOURCE.db NEW_BACKUP.db
The source must exist. Destination must not exist. Protect both as credentials:
backups include password hashes, sessions and device token hashes.
"""
from __future__ import annotations

import argparse
import os
import sqlite3
from contextlib import closing
from pathlib import Path


def verified_backup(source: Path, destination: Path) -> None:
    source = source.resolve(strict=True)
    destination = destination.resolve()
    if source == destination:
        raise ValueError("Source and destination must differ.")
    # Exclusive creation avoids accidentally overwriting a database or backup.
    descriptor = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    try:
        with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as original:
            with closing(sqlite3.connect(destination)) as copy:
                original.backup(copy)
                check = copy.execute("PRAGMA integrity_check").fetchone()[0]
                if check != "ok":
                    raise ValueError("Backup integrity check failed.")
                copy.execute("SELECT COUNT(*) FROM users").fetchone()
                copy.execute("SELECT COUNT(*) FROM devices").fetchone()
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a new verified SQLite backup; never overwrite an existing file.")
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    verified_backup(args.source, args.destination)
    print("Backup created and integrity verified. Restrict access and store an encrypted off-host copy.")


if __name__ == "__main__":
    main()
