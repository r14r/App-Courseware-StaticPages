#!/usr/bin/env python3
import json
import os
import re

skip = {"topics.json", "course.json", "index.json", "quiz.json"}

files = sorted(
    name for name in os.listdir(".")
    if name.endswith(".json") and name not in skip
)

for filename in files:
    with open(filename, "r", encoding="utf-8") as f:
        raw = f.read()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        continue
    content = data.get("content")
    if not isinstance(content, list):
        continue

    search_start = 0
    for part in content:
        if not isinstance(part, str):
            continue
        if "<pre><code" not in part:
            continue

        idx = raw.find(part, search_start)
        pos = idx if idx != -1 else raw.find(part)
        line_number = 1
        if pos != -1:
            line_number += raw.count("\n", 0, pos)
            search_start = pos + len(part)

        match = re.search(r'<pre><code class="language-bash">([\s\S]*?)</code></pre>', part)
        if not match:
            continue
        block = match.group(1)
        first_cmd = next((line for line in block.split("\n") if line.strip().startswith("❯")), None)
        if not first_cmd:
            continue
        command = re.sub(r"^\s*❯\s*", "", first_cmd).strip()

        rel_path = os.path.join(os.path.basename(os.getcwd()), filename)
        print(f"#  {rel_path}: {line_number}")
        print(command)
        print("")
