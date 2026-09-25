"""Print every leaf of a JulesOps config file as `dotted.key=value` lines.

Uses the same parser as the installed `.github/resolve-config.py`, so the kit
scripts and the workflows always agree on how a config file is read.

Usage: python3 scripts/lib/config_dump.py path/to/julesops.yml
"""

import importlib.util
import os
import sys

# Importing the resolver must not leave a __pycache__ in templates/ (it would get installed).
sys.dont_write_bytecode = True

RESOLVER_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "templates", "resolve-config.py"
)


def load_resolver():
    spec = importlib.util.spec_from_file_location("resolve_config", RESOLVER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def flatten(node, prefix=""):
    for key, value in node.items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            yield from flatten(value, path)
        else:
            yield path, value


def main():
    if len(sys.argv) != 2:
        print("usage: config_dump.py CONFIG_PATH", file=sys.stderr)
        raise SystemExit(2)

    try:
        config = load_resolver().parse_simple_yaml(sys.argv[1])
    except (OSError, ValueError) as error:
        print(f"Unable to parse {sys.argv[1]}: {error}", file=sys.stderr)
        raise SystemExit(1)

    for path, value in flatten(config):
        print(f"{path}={value}")


if __name__ == "__main__":
    main()
