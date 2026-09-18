#!/usr/bin/env python3
"""Point the site at your real domain and email address.

    python3 tools/set-site-details.py givegetgrateful.com hello@givegetgrateful.com

Rewrites every placeholder occurrence across public/ and tools/. Safe to run
more than once, and it prints exactly what it changed. Run it from the repo
root. Uses only the standard library, so it works the same on macOS, Linux
and Windows.
"""
import pathlib
import sys

PLACEHOLDER_DOMAIN = "givegetgrateful.com"
PLACEHOLDER_EMAIL = "hello@givegetgrateful.com"

TARGETS = ["public", "tools"]
SUFFIXES = {".html", ".js", ".txt", ".xml", ".css"}


def main(argv):
    if len(argv) != 3:
        print(__doc__.strip())
        return 1

    domain = argv[1].strip().removeprefix("https://").removeprefix("http://").rstrip("/")
    email = argv[2].strip()

    if "@" not in email or "." not in email.split("@")[-1]:
        print(f"error: {email!r} does not look like an email address")
        return 1
    if "." not in domain or "/" in domain:
        print(f"error: {domain!r} does not look like a bare domain (no scheme, no path)")
        return 1

    root = pathlib.Path(__file__).resolve().parent.parent
    files = sorted(
        p for target in TARGETS for p in (root / target).rglob("*")
        if p.is_file() and p.suffix in SUFFIXES
    )

    total = 0
    for path in files:
        original = path.read_text(encoding="utf-8")
        # Email first: it contains the domain, so the other order would
        # rewrite half of it and leave a broken address behind. Counting
        # works the same way, or every address counts twice.
        after_email = original.replace(PLACEHOLDER_EMAIL, email)
        updated = after_email.replace(PLACEHOLDER_DOMAIN, domain)
        if updated == original:
            continue
        changed = (
            original.count(PLACEHOLDER_EMAIL)
            + after_email.count(PLACEHOLDER_DOMAIN)
        )
        path.write_text(updated, encoding="utf-8")
        print(f"  {path.relative_to(root)} — {changed} replaced")
        total += changed

    if total:
        print(f"\nDone: {total} replacements. Review with `git diff`, then commit.")
    else:
        print("Nothing to change — no placeholders left. Already done?")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
