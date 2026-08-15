"""画作记录持久化（多用户：按 nickname 分目录）"""

import json
from config import user_records_file


def load_records(nickname: str = "default") -> list[dict]:
    _path = user_records_file(nickname)
    if _path.exists():
        with open(_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_records(nickname: str, records: list[dict]):
    with open(user_records_file(nickname), "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
