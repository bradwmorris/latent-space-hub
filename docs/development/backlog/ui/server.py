#!/usr/bin/env python3
"""
Simple backlog server for Latent Space Hub development.

Setup:
  cd docs/development/backlog/ui
  python3 -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt

Run:
  source venv/bin/activate && python server.py
  Open http://localhost:5561
"""

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import json
from pathlib import Path
from datetime import date

app = Flask(__name__)
CORS(app)

DATA_FILE = Path(__file__).parent.parent / "backlog.json"
INDEX_FILE = Path(__file__).parent / "index.html"
PROJECT_ROOT = str(Path(__file__).parent.parent.parent.parent.parent)


def load_data():
    with open(DATA_FILE, "r") as f:
        return json.load(f)


def save_data(data):
    data["lastUpdated"] = date.today().isoformat()
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)


@app.route("/")
def index():
    return send_file(INDEX_FILE)


@app.route("/api/config", methods=["GET"])
def get_config():
    return jsonify({"root": PROJECT_ROOT})


@app.route("/api/data", methods=["GET"])
def get_data():
    return jsonify(load_data())


@app.route("/api/data", methods=["PUT"])
def update_data():
    data = request.json
    save_data(data)
    return jsonify({"status": "ok"})


@app.route("/api/project/<project_id>", methods=["GET"])
def get_project(project_id):
    data = load_data()
    project = data.get("projects", {}).get(project_id)
    if project:
        return jsonify(project)
    return jsonify({"error": "not found"}), 404


@app.route("/api/project/<project_id>", methods=["PUT"])
def update_project(project_id):
    data = load_data()
    if project_id not in data.get("projects", {}):
        return jsonify({"error": "not found"}), 404

    updates = request.json
    data["projects"][project_id].update(updates)
    save_data(data)
    return jsonify({"status": "ok"})


@app.route("/api/project/<project_id>/status", methods=["PUT"])
def update_project_status(project_id):
    data = load_data()
    if project_id not in data.get("projects", {}):
        return jsonify({"error": "not found"}), 404

    new_status = request.json.get("status")
    if new_status not in ["prd", "ready", "in_progress", "review", "blocked", "completed"]:
        return jsonify({"error": "invalid status"}), 400

    data["projects"][project_id]["status"] = new_status
    save_data(data)
    return jsonify({"status": "ok"})


@app.route("/api/queue", methods=["PUT"])
def update_queue():
    data = load_data()
    data["queue"] = request.json.get("queue", [])
    save_data(data)
    return jsonify({"status": "ok"})


@app.route("/api/prd/<path:prd_path>", methods=["GET"])
def get_prd(prd_path):
    """Fetch PRD markdown content."""
    ls_root = Path(__file__).parent.parent.parent.parent.parent
    prd_file = ls_root / prd_path

    if not prd_file.exists():
        return jsonify({"error": "PRD not found", "path": str(prd_file)}), 404

    with open(prd_file, "r") as f:
        content = f.read()

    return jsonify({"content": content, "path": prd_path})


if __name__ == "__main__":
    print(f"Data file: {DATA_FILE}")
    print("Starting server at http://localhost:5561")
    app.run(port=5561, debug=True)
