#!/usr/bin/env bash
# Verify Rust build prerequisites on a development machine.
# Usage: ./scripts/check-rust-prereqs.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

required_ok=0
required_fail=0
optional_ok=0
optional_fail=0

pass() {
  printf '  OK   %s\n' "$1"
  if [[ "${2:-required}" == required ]]; then
    required_ok=$((required_ok + 1))
  else
    optional_ok=$((optional_ok + 1))
  fi
}

fail() {
  printf '  FAIL %s\n' "$1"
  if [[ "${2:-required}" == required ]]; then
    required_fail=$((required_fail + 1))
  else
    optional_fail=$((optional_fail + 1))
  fi
}

check_cmd() {
  local label="$1"
  local cmd="$2"
  local kind="${3:-required}"
  if command -v "$cmd" >/dev/null 2>&1; then
    local detail
    detail="$("$cmd" --version 2>/dev/null | head -n1 || true)"
    if [[ -n "$detail" ]]; then
      pass "$label ($detail)" "$kind"
    else
      pass "$label (found: $(command -v "$cmd"))" "$kind"
    fi
  else
    fail "$label — command not found: $cmd" "$kind"
  fi
}

check_pkg_config() {
  local label="$1"
  local module="$2"
  local kind="${3:-required}"
  if ! command -v pkg-config >/dev/null 2>&1; then
    fail "$label — pkg-config not installed" "$kind"
    return
  fi
  if pkg-config --exists "$module" 2>/dev/null; then
    pass "$label ($(pkg-config --modversion "$module"))" "$kind"
  else
    fail "$label — pkg-config module '$module' not found (install dev package)" "$kind"
  fi
}

echo "=== FoldOps Rust build prerequisites ==="
echo "Repo: $ROOT"
echo

echo "Required — Rust toolchain"
check_cmd "rustc" rustc
check_cmd "cargo" cargo

if command -v rustup >/dev/null 2>&1; then
  target="$(rustup show active-toolchain 2>/dev/null | head -n1 || true)"
  if [[ -n "$target" ]]; then
    pass "rustup active toolchain ($target)"
  else
    pass "rustup (installed)"
  fi
else
  fail "rustup — not found (recommended install path)"
fi

echo
echo "Required — C toolchain and pkg-config"
check_cmd "cc (build-essential)" cc
check_cmd "gcc (build-essential)" gcc
check_cmd "pkg-config" pkg-config

echo
echo "Required — native libraries (compile-time)"
check_pkg_config "OpenSSL (libssl-dev)" openssl
check_pkg_config "SQLite (libsqlite3-dev)" sqlite3

echo
echo "Required for full FoldOps dev — Node.js dashboard"
check_cmd "node (>= 22)" node
check_cmd "npm" npm

if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [[ "$node_major" -ge 22 ]]; then
    pass "node version major >= 22"
  else
    fail "node version major >= 22 (got $(node --version 2>/dev/null || echo unknown))"
  fi
fi

echo
echo "Optional — agent development and debugging"
check_cmd "sensors (lm-sensors)" sensors optional
check_cmd "sqlite3 CLI" sqlite3 optional
if command -v cargo >/dev/null 2>&1 && cargo clippy --version >/dev/null 2>&1; then
  pass "cargo clippy component" optional
elif command -v cargo >/dev/null 2>&1; then
  fail "cargo clippy — run: rustup component add clippy" optional
else
  fail "cargo clippy — cargo not installed" optional
fi

echo
echo "Cargo workspace"
if [[ -f "$ROOT/Cargo.toml" ]]; then
  pass "Cargo.toml at repo root"
  if command -v cargo >/dev/null 2>&1; then
    if cargo metadata --no-deps --format-version 1 >/dev/null 2>&1; then
      pass "cargo metadata (workspace parses)"
    else
      fail "cargo metadata — workspace failed to parse"
    fi
  fi
else
  fail "Cargo.toml at repo root — missing from checkout"
fi

echo
echo "=== Summary ==="
printf 'Required: %d passed, %d failed\n' "$required_ok" "$required_fail"
printf 'Optional: %d passed, %d failed\n' "$optional_ok" "$optional_fail"

if [[ "$required_fail" -gt 0 ]]; then
  echo
  echo "Install missing required packages (Debian/Ubuntu):"
  echo "  sudo apt install build-essential pkg-config libssl-dev libsqlite3-dev"
  echo
  echo "Install Rust:"
  echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  echo "  source \"\$HOME/.cargo/env\""
  echo
  echo "See docs/installation.md#rust-development-prerequisites"
  exit 1
fi

echo
echo "Ready to build Rust FoldOps crates on this machine."
exit 0
