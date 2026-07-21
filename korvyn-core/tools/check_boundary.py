#!/usr/bin/env python3
"""
Mechanically enforces the architectural rule, with no Node toolchain required.

  domain/  must NOT import from integration/
  domain/  must NOT mention any vendor's name

This is a stopgap. Once Node is installed, the eslint `import/no-restricted-paths`
rule in the README does the same job better and runs in your editor. Until then
this is the only thing standing between the rule and good intentions.

Run:  python tools/check_boundary.py
Exit: 0 clean, 1 violations found.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
DOMAIN = SRC / "domain"
INTEGRATION = SRC / "integration"

# Vendor vocabulary that must never appear in the canonical model.
VENDORS = ["netsuite", "intacct", "yardi", "procore", "quickbooks", "sage", "workday"]

IMPORT_RE = re.compile(r"""^\s*import\s+(?:type\s+)?.*?from\s+['"]([^'"]+)['"]""", re.M)


def ts_files(d: Path) -> list[Path]:
    return sorted(d.rglob("*.ts")) if d.exists() else []


def check_domain_imports() -> list[str]:
    out = []
    for f in ts_files(DOMAIN):
        for spec in IMPORT_RE.findall(f.read_text(encoding="utf-8")):
            if "integration" in spec:
                out.append(f"{f.relative_to(ROOT)}: imports '{spec}' — domain must not depend on integration")
            # any bare (non-relative) import is a third-party dependency
            if not spec.startswith("."):
                out.append(f"{f.relative_to(ROOT)}: imports external package '{spec}' — domain must stay dependency-free")
    return out


def strip_comments(text: str) -> str:
    """
    Blanks out // and /* */ comments, preserving line numbering.

    Vendor names ARE allowed in domain comments — "NetSuite calls these AcctType,
    none of that appears here" is useful documentation, not a leak. The rule is
    about code, so only code is scanned.
    """
    out = []
    i, n = 0, len(text)
    while i < n:
        if text.startswith("//", i):
            j = text.find("\n", i)
            j = n if j == -1 else j
            out.append(" " * (j - i))
            i = j
        elif text.startswith("/*", i):
            j = text.find("*/", i + 2)
            j = n if j == -1 else j + 2
            out.append("".join(c if c == "\n" else " " for c in text[i:j]))
            i = j
        else:
            out.append(text[i])
            i += 1
    return "".join(out)


def check_domain_vendor_words() -> list[str]:
    out = []
    for f in ts_files(DOMAIN):
        code = strip_comments(f.read_text(encoding="utf-8"))
        for ln, line in enumerate(code.splitlines(), 1):
            for v in VENDORS:
                # Must catch a camelCase leak like `netsuiteInternalId`, which a
                # plain \b misses because the following 'I' is a word character.
                # Must NOT fire on 'message'/'passage'/'usage' (all contain 'sage').
                # Rule: not preceded by a letter, not followed by a LOWERCASE
                # letter — so a new camel hump or a non-letter both terminate it.
                #
                # The scoped `(?i:...)` matters: a plain re.I flag would make the
                # `[a-z]` lookahead match uppercase too, which silently defeats
                # the camelCase case. Case-insensitivity applies to the vendor
                # name only; the lookarounds stay case-sensitive.
                if re.search(rf"(?<![A-Za-z])(?i:{re.escape(v)})(?![a-z])", line):
                    out.append(
                        f"{f.relative_to(ROOT)}:{ln}: code mentions vendor '{v}' "
                        f"— external vocabulary must stay in adapters"
                    )
    return out


def check_adapter_contract() -> list[str]:
    """Every member declared on `interface Adapter` should appear in the stub."""
    out = []
    adapter_f = INTEGRATION / "adapter.ts"
    stub_f = INTEGRATION / "adapters" / "procore.adapter.ts"
    if not adapter_f.exists() or not stub_f.exists():
        return ["adapter.ts or procore.adapter.ts missing"]

    text = adapter_f.read_text(encoding="utf-8")
    m = re.search(r"export interface Adapter\s*\{(.*?)\n\}", text, re.S)
    if not m:
        return ["could not locate `export interface Adapter` block"]

    members = set(re.findall(r"^\s*(?:readonly\s+)?(\w+)\s*[<(:]", m.group(1), re.M))
    stub = stub_f.read_text(encoding="utf-8")
    for mem in sorted(members):
        if not re.search(rf"\b{re.escape(mem)}\b", stub):
            out.append(f"ProcoreAdapter is missing Adapter member '{mem}'")
    return out


def check_braces() -> list[str]:
    """Crude balance check. Not a parser — catches truncated writes, nothing subtler."""
    out = []
    for f in ts_files(SRC):
        t = f.read_text(encoding="utf-8")
        for open_c, close_c in (("{", "}"), ("(", ")"), ("[", "]")):
            if t.count(open_c) != t.count(close_c):
                out.append(f"{f.relative_to(ROOT)}: unbalanced {open_c}{close_c} "
                           f"({t.count(open_c)} vs {t.count(close_c)})")
    return out


def main() -> int:
    checks = [
        ("domain -> integration imports", check_domain_imports),
        ("vendor vocabulary in domain", check_domain_vendor_words),
        ("stub implements Adapter", check_adapter_contract),
        ("bracket balance", check_braces),
    ]
    failures = 0
    for name, fn in checks:
        problems = fn()
        if problems:
            failures += len(problems)
            print(f"FAIL  {name}")
            for p in problems:
                print(f"      {p}")
        else:
            print(f"ok    {name}")

    files = ts_files(SRC)
    print(f"\n{len(files)} TypeScript files, "
          f"{sum(len(f.read_text(encoding='utf-8').splitlines()) for f in files)} lines")
    if failures:
        print(f"\n{failures} violation(s)")
        return 1
    print("\nBoundary intact.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
