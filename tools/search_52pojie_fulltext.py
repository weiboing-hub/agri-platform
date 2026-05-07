#!/usr/bin/env python3
"""Search 52pojie thread title/body data stored in local MySQL."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from typing import Any


FULLTEXT_INDEX_NAME = "ft_title_body"


def sql_literal(value: str) -> str:
    text = value.replace("\x00", "").replace("\\", "\\\\").replace("'", "''")
    return f"'{text}'"


def run_mysql(mysql_user: str, sql: str, batch: bool = True) -> str:
    cmd = ["mysql", f"-u{mysql_user}", "--default-character-set=utf8mb4"]
    if batch:
        cmd.extend(["--batch", "--raw", "--skip-column-names"])
    result = subprocess.run(
        cmd + ["-e", sql],
        text=True,
        capture_output=True,
        check=True,
        env=os.environ.copy(),
    )
    return result.stdout


def ensure_fulltext_index(database: str, table: str, mysql_user: str) -> None:
    sql = (
        "SELECT COUNT(*) FROM information_schema.STATISTICS "
        f"WHERE TABLE_SCHEMA = {sql_literal(database)} "
        f"AND TABLE_NAME = {sql_literal(table)} "
        f"AND INDEX_NAME = {sql_literal(FULLTEXT_INDEX_NAME)};"
    )
    count = int(run_mysql(mysql_user, sql).strip() or "0")
    if count:
        return

    create_sql = (
        f"ALTER TABLE `{database}`.`{table}` "
        f"ADD FULLTEXT KEY `{FULLTEXT_INDEX_NAME}` (`title`, `body_text`) WITH PARSER ngram;"
    )
    run_mysql(mysql_user, create_sql, batch=False)


def normalize_boolean_query(query: str) -> str:
    tokens = [token.strip() for token in query.split() if token.strip()]
    if not tokens:
        return query
    return " ".join(token if token.startswith(("+", "-", '"')) else f"+{token}" for token in tokens)


def build_search_sql(
    database: str,
    table: str,
    query: str,
    limit: int,
    mode: str,
    include_permission_denied: bool,
) -> str:
    query_literal = sql_literal(query)
    like_literal = sql_literal(f"%{query}%")
    if mode == "boolean":
        against_expr = f"MATCH(title, body_text) AGAINST({sql_literal(normalize_boolean_query(query))} IN BOOLEAN MODE)"
    else:
        against_expr = f"MATCH(title, body_text) AGAINST({query_literal})"

    status_predicate = (
        "body_scrape_status IN ('ok', 'permission_denied')"
        if include_permission_denied
        else "body_scrape_status = 'ok'"
    )
    return f"""
SELECT
  rank_no,
  thread_id,
  type_name,
  title,
  url,
  body_scrape_status,
  CASE WHEN title LIKE {like_literal} OR body_text LIKE {like_literal} THEN 1 ELSE 0 END AS exact_hit,
  ROUND(COALESCE({against_expr}, 0), 6) AS score,
  body_text
FROM `{database}`.`{table}`
WHERE {status_predicate}
  AND (
    {against_expr}
    OR title LIKE {like_literal}
    OR body_text LIKE {like_literal}
  )
ORDER BY exact_hit DESC, score DESC, rank_no ASC
LIMIT {limit};
"""


def snippet_from_text(text: str | None, query: str, width: int) -> str:
    if not text:
        return ""
    source = text.replace("\n", " ").strip()
    if not source:
        return ""
    lower_source = source.lower()
    lower_query = query.lower()
    pos = lower_source.find(lower_query)
    if pos < 0:
        return source[:width]
    start = max(0, pos - width // 3)
    end = min(len(source), pos + len(query) + (width * 2 // 3))
    prefix = "..." if start > 0 else ""
    suffix = "..." if end < len(source) else ""
    return prefix + source[start:end] + suffix


def parse_rows(raw: str, query: str, snippet_width: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line in raw.splitlines():
        parts = line.split("\t")
        if len(parts) != 9:
            continue
        rank_no, thread_id, type_name, title, url, status, exact_hit, score, body_text = parts
        rows.append(
            {
                "rank_no": int(rank_no),
                "thread_id": int(thread_id),
                "type_name": type_name or None,
                "title": title,
                "url": url,
                "body_scrape_status": status,
                "exact_hit": int(exact_hit),
                "score": float(score),
                "snippet": snippet_from_text(body_text, query, snippet_width),
            }
        )
    return rows


def print_results(rows: list[dict[str, Any]], query: str) -> None:
    print(f"query={query} hits={len(rows)}")
    for row in rows:
        type_name = row["type_name"] or "-"
        print(
            f"[{row['rank_no']:>3}] score={row['score']:.4f} type={type_name} "
            f"thread_id={row['thread_id']} title={row['title']}"
        )
        print(f"      url={row['url']}")
        if row["snippet"]:
            print(f"      snippet={row['snippet']}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("query")
    parser.add_argument("--database", default="reverse_learning")
    parser.add_argument("--table", default="pojie_reverse_threads")
    parser.add_argument("--mysql-user", default="root")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--mode", choices=["natural", "boolean"], default="natural")
    parser.add_argument("--include-permission-denied", action="store_true")
    parser.add_argument("--snippet-width", type=int, default=140)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    if args.limit < 1:
        raise SystemExit("--limit must be positive")
    if args.snippet_width < 40:
        raise SystemExit("--snippet-width must be at least 40")
    if not os.environ.get("MYSQL_PWD"):
        raise SystemExit("Set MYSQL_PWD before running.")

    ensure_fulltext_index(args.database, args.table, args.mysql_user)
    raw = run_mysql(
        args.mysql_user,
        build_search_sql(
            database=args.database,
            table=args.table,
            query=args.query,
            limit=args.limit,
            mode=args.mode,
            include_permission_denied=args.include_permission_denied,
        ),
    )
    rows = parse_rows(raw, args.query, args.snippet_width)
    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
    else:
        print_results(rows, args.query)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
