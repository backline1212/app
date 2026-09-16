#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$DIR/data/mongo"
LOG_DIR="$DIR/logs"
PID_FILE="$DIR/mongod.pid"

mkdir -p "$DATA_DIR" "$LOG_DIR"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "mongod already running (pid $(cat "$PID_FILE"))"
  exit 0
fi

# --replSet: multi-document transactions (pages/service.py's delete_page,
# assets/service.py's upload_asset - both need an atomic check-then-write across more
# than one collection) only work against a replica set, never a standalone mongod.
# MongoDB Atlas, the real deployment target (18-Storage-Deployment.md), is always at
# least a single-node replica set - this matches production instead of diverging from
# it. Safe to add to a data directory from before this flag existed: MongoDB builds the
# oplog on first start with --replSet, no migration needed.
mongod --dbpath "$DATA_DIR" --port 27017 --bind_ip 127.0.0.1 --replSet rs0 \
  --logpath "$LOG_DIR/mongod.log" --fork --pidfilepath "$PID_FILE"

echo "mongod started on port 27017 (pid $(cat "$PID_FILE"))"

# One-time replica set initiation - a data directory from a prior run already has one,
# and re-initiating errors, so this is expected to no-op on every start after the first.
BACKEND_PYTHON="$DIR/../../backend/.venv/bin/python"
if [ ! -x "$BACKEND_PYTHON" ]; then
  BACKEND_PYTHON="$DIR/../../backend/.venv/Scripts/python.exe"
fi
if [ ! -x "$BACKEND_PYTHON" ]; then
  echo "Skipping replica-set initiation: backend/.venv not found yet (run 'uv sync' in" \
    "backend/ first, then re-run this script once to initiate rs0)."
  exit 0
fi

"$BACKEND_PYTHON" - <<'PYEOF'
from pymongo import MongoClient
from pymongo.errors import OperationFailure

client = MongoClient(
    "mongodb://127.0.0.1:27017", directConnection=True, serverSelectionTimeoutMS=15000
)
try:
    status = client.admin.command("replSetGetStatus")
    print(f"Replica set already initiated (state: {status.get('myState')}).")
except OperationFailure as exc:
    # Code 94 = NotYetInitialized - the expected case on a brand-new data directory.
    if exc.code != 94:
        raise
    client.admin.command(
        "replSetInitiate", {"_id": "rs0", "members": [{"_id": 0, "host": "127.0.0.1:27017"}]}
    )
    print("Replica set 'rs0' initiated.")
finally:
    client.close()
PYEOF
