#!/usr/bin/env python3
"""Scrape 52pojie reverse-resource forum data into local MySQL.

The script can store forum-list metadata and the first-post body for stored
threads. It does not download attachments.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from typing import Iterable
from urllib.parse import urljoin

import requests
from lxml import html


BASE_URL = "https://www.52pojie.cn/"
FORUM_ID = 4
FORUM_NAME = "逆向资源区"
# A very detailed browser UA can trigger the site's WAF challenge for plain
# requests. The compact UA matches the forum-list response reliably in testing.
USER_AGENT = "Mozilla/5.0"


@dataclass(frozen=True)
class ThreadRow:
    rank_no: int
    page_no: int
    forum_id: int
    forum_name: str
    thread_id: int
    type_id: int | None
    type_name: str | None
    title: str
    url: str
    author_name: str | None
    author_uid: int | None
    created_at_raw: str | None
    reply_count: int | None
    view_count: int | None
    last_author_name: str | None
    last_author_uid: int | None
    last_post_at_raw: str | None
    read_permission: int | None
    is_closed: bool
    has_attachment: bool
    has_image: bool
    is_recommended: bool
    recommend_score: int | None
    scraped_at: str


@dataclass(frozen=True)
class ThreadBodyRow:
    thread_id: int
    body_text: str | None
    body_links_json: str | None
    body_image_urls_json: str | None
    body_scrape_status: str
    body_error_message: str | None
    body_scraped_at: str


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()
    return text or None


def to_int(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"\d+", value.replace(",", ""))
    return int(match.group(0)) if match else None


def page_url(page_no: int) -> str:
    if page_no == 1:
        return urljoin(BASE_URL, "forum-4-1.html")
    return urljoin(BASE_URL, f"forum.php?mod=forumdisplay&fid={FORUM_ID}&page={page_no}")


def thread_url(thread_id: int) -> str:
    return urljoin(BASE_URL, f"thread-{thread_id}-1-1.html")


def fetch_html(session: requests.Session, target_url: str, label: str) -> str:
    response = session.get(target_url, timeout=30)
    response.raise_for_status()
    response.encoding = "gbk"
    if "wzws-waf-cgi" in response.text or "slidercaptcha" in response.text:
        raise RuntimeError(f"{label} returned a site security challenge instead of forum HTML.")
    return response.text


def fetch_page(session: requests.Session, page_no: int) -> str:
    return fetch_html(session, page_url(page_no), f"Page {page_no}")


def first_text(node, xpath: str) -> str | None:
    values = node.xpath(xpath)
    if not values:
        return None
    if hasattr(values[0], "text_content"):
        return clean_text(values[0].text_content())
    return clean_text(str(values[0]))


def first_attr(node, xpath: str) -> str | None:
    values = node.xpath(xpath)
    return clean_text(str(values[0])) if values else None


def parse_user_uid(href: str | None) -> int | None:
    if not href:
        return None
    uid = re.search(r"[?&]uid=(\d+)", href)
    return int(uid.group(1)) if uid else None


def parse_type_id(href: str | None) -> int | None:
    if not href:
        return None
    type_id = re.search(r"[?&]typeid=(\d+)", href)
    return int(type_id.group(1)) if type_id else None


def parse_thread_row(tbody, page_no: int, rank_no: int, scraped_at: str) -> ThreadRow | None:
    raw_id = tbody.get("id") or ""
    thread_id_match = re.match(r"normalthread_(\d+)", raw_id)
    if not thread_id_match:
        return None
    thread_id = int(thread_id_match.group(1))

    title_link = tbody.xpath('.//th//a[contains(concat(" ", normalize-space(@class), " "), " xst ")]')
    if not title_link:
        return None
    title_node = title_link[0]
    title = clean_text(title_node.text_content()) or ""
    url = urljoin(BASE_URL, title_node.get("href") or "")

    type_link = tbody.xpath('.//th//em/a[contains(@href, "typeid=")]')
    type_name = clean_text(type_link[0].text_content()) if type_link else None
    type_id = parse_type_id(type_link[0].get("href")) if type_link else None

    by_cells = tbody.xpath('.//td[contains(concat(" ", normalize-space(@class), " "), " by ")]')
    author_name = author_uid = created_at_raw = None
    last_author_name = last_author_uid = last_post_at_raw = None
    if by_cells:
        author_name = first_text(by_cells[0], ".//cite/a[1]")
        author_uid = parse_user_uid(first_attr(by_cells[0], ".//cite/a[1]/@href"))
        created_at_raw = first_text(by_cells[0], ".//em")
    if len(by_cells) > 1:
        last_author_name = first_text(by_cells[1], ".//cite/a[1]")
        last_author_uid = parse_user_uid(first_attr(by_cells[1], ".//cite/a[1]/@href"))
        last_post_at_raw = first_text(by_cells[1], ".//em")

    reply_count = to_int(first_text(tbody, './/td[contains(concat(" ", normalize-space(@class), " "), " num ")]/a[1]'))
    view_count = to_int(first_text(tbody, './/td[contains(concat(" ", normalize-space(@class), " "), " num ")]/em[1]'))

    row_text = clean_text(tbody.text_content()) or ""
    read_permission = None
    permission = re.search(r"阅读权限\s*(\d+)", row_text)
    if permission:
        read_permission = int(permission.group(1))

    icon_title = first_attr(tbody, './/td[contains(concat(" ", normalize-space(@class), " "), " icn ")]//a[1]/@title') or ""
    image_alts = " ".join(
        clean_text(v) or ""
        for v in tbody.xpath(".//img/@alt | .//img/@title")
    )
    recommend_score = None
    recommend = re.search(r"评价指数\s*(\d+)", image_alts)
    if recommend:
        recommend_score = int(recommend.group(1))

    return ThreadRow(
        rank_no=rank_no,
        page_no=page_no,
        forum_id=FORUM_ID,
        forum_name=FORUM_NAME,
        thread_id=thread_id,
        type_id=type_id,
        type_name=type_name,
        title=title,
        url=url,
        author_name=author_name,
        author_uid=author_uid,
        created_at_raw=created_at_raw,
        reply_count=reply_count,
        view_count=view_count,
        last_author_name=last_author_name,
        last_author_uid=last_author_uid,
        last_post_at_raw=last_post_at_raw,
        read_permission=read_permission,
        is_closed="关闭" in icon_title,
        has_attachment=("attachment" in image_alts) or ("附件" in image_alts),
        has_image=("attach_img" in image_alts) or ("图片附件" in image_alts),
        is_recommended=("recommend" in image_alts) or ("评价指数" in image_alts),
        recommend_score=recommend_score,
        scraped_at=scraped_at,
    )


def normalize_body_text(value: str | None) -> str | None:
    if value is None:
        return None
    lines = []
    for raw_line in value.replace("\r", "\n").replace("\xa0", " ").splitlines():
        line = re.sub(r"[ \t]+", " ", raw_line).strip()
        lines.append(line)

    compact_lines: list[str] = []
    blank_pending = False
    for line in lines:
        if line:
            compact_lines.append(line)
            blank_pending = False
        elif not blank_pending and compact_lines:
            compact_lines.append("")
            blank_pending = True

    while compact_lines and compact_lines[-1] == "":
        compact_lines.pop()
    return "\n".join(compact_lines) or None


def unique_strings(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            unique.append(value)
    return unique


def truncate(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    return value if len(value) <= limit else value[: limit - 3] + "..."


def extract_notice_text(document) -> str | None:
    xpaths = [
        '//*[@id="messagetext"]//text()',
        '//*[contains(concat(" ", normalize-space(@class), " "), " alert_info ")]//text()',
        '//*[contains(concat(" ", normalize-space(@class), " "), " alert_error ")]//text()',
        '//*[contains(concat(" ", normalize-space(@class), " "), " showmessage ")]//text()',
    ]
    for xpath in xpaths:
        parts = [clean_text(part) for part in document.xpath(xpath)]
        text = normalize_body_text("\n".join(part for part in parts if part))
        if text:
            return text
    body_text = normalize_body_text(document.text_content())
    return truncate(body_text, 512)


def parse_thread_body(document, thread_id: int) -> ThreadBodyRow:
    scraped_at = dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat()
    post_nodes = document.xpath('//*[starts-with(@id, "postmessage_")]')
    if not post_nodes:
        notice = extract_notice_text(document)
        if notice and ("抱歉" in notice or "阅读权限" in notice):
            status = "permission_denied"
        elif notice and "Please enable JavaScript and refresh the page." in notice:
            status = "challenge"
        else:
            status = "no_body"
        return ThreadBodyRow(
            thread_id=thread_id,
            body_text=None,
            body_links_json=None,
            body_image_urls_json=None,
            body_scrape_status=status,
            body_error_message=truncate(notice, 512),
            body_scraped_at=scraped_at,
        )

    post_node = post_nodes[0]
    body_text = normalize_body_text(post_node.text_content())
    links = unique_strings(
        urljoin(BASE_URL, href.strip())
        for href in post_node.xpath(".//a/@href")
        if href and not href.lower().startswith("javascript:")
    )
    image_urls = unique_strings(
        urljoin(BASE_URL, src.strip())
        for src in post_node.xpath(".//img/@src")
        if src
    )
    return ThreadBodyRow(
        thread_id=thread_id,
        body_text=body_text,
        body_links_json=json.dumps(links, ensure_ascii=False),
        body_image_urls_json=json.dumps(image_urls, ensure_ascii=False),
        body_scrape_status="ok",
        body_error_message=None,
        body_scraped_at=scraped_at,
    )


def scrape(limit: int, delay: float) -> list[ThreadRow]:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Referer": BASE_URL})
    scraped_at = dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat()
    rows: list[ThreadRow] = []
    seen: set[int] = set()
    page_no = 1

    while len(rows) < limit:
        document = html.fromstring(fetch_page(session, page_no))
        page_rows = document.xpath('//tbody[starts-with(@id, "normalthread_")]')
        if not page_rows:
            break
        for tbody in page_rows:
            parsed = parse_thread_row(tbody, page_no, len(rows) + 1, scraped_at)
            if parsed and parsed.thread_id not in seen:
                rows.append(parsed)
                seen.add(parsed.thread_id)
            if len(rows) >= limit:
                break
        page_no += 1
        if len(rows) < limit:
            time.sleep(delay)

    return rows


def ensure_table(database: str, table: str, mysql_user: str) -> None:
    schema_sql = f"""
CREATE DATABASE IF NOT EXISTS `{database}`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;
USE `{database}`;
CREATE TABLE IF NOT EXISTS `{table}` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `rank_no` INT NOT NULL,
  `page_no` INT NOT NULL,
  `forum_id` INT NOT NULL,
  `forum_name` VARCHAR(64) NOT NULL,
  `thread_id` BIGINT NOT NULL,
  `type_id` INT NULL,
  `type_name` VARCHAR(64) NULL,
  `title` VARCHAR(512) NOT NULL,
  `url` VARCHAR(512) NOT NULL,
  `author_name` VARCHAR(128) NULL,
  `author_uid` BIGINT NULL,
  `created_at_raw` VARCHAR(64) NULL,
  `reply_count` INT NULL,
  `view_count` INT NULL,
  `last_author_name` VARCHAR(128) NULL,
  `last_author_uid` BIGINT NULL,
  `last_post_at_raw` VARCHAR(64) NULL,
  `read_permission` INT NULL,
  `is_closed` TINYINT(1) NOT NULL DEFAULT 0,
  `has_attachment` TINYINT(1) NOT NULL DEFAULT 0,
  `has_image` TINYINT(1) NOT NULL DEFAULT 0,
  `is_recommended` TINYINT(1) NOT NULL DEFAULT 0,
  `recommend_score` INT NULL,
  `scraped_at` VARCHAR(32) NOT NULL,
  `body_text` LONGTEXT NULL,
  `body_links_json` LONGTEXT NULL,
  `body_image_urls_json` LONGTEXT NULL,
  `body_scrape_status` VARCHAR(32) NULL,
  `body_error_message` VARCHAR(512) NULL,
  `body_scraped_at` VARCHAR(32) NULL,
  `created_in_db_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_in_db_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_thread_id` (`thread_id`),
  KEY `idx_rank_no` (`rank_no`),
  KEY `idx_type_id` (`type_id`),
  KEY `idx_reply_view` (`reply_count`, `view_count`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""
    subprocess.run(
        ["mysql", f"-u{mysql_user}", "--default-character-set=utf8mb4"],
        input=schema_sql,
        text=True,
        check=True,
    )
    existing_columns = set(
        subprocess.run(
            [
                "mysql",
                f"-u{mysql_user}",
                "--default-character-set=utf8mb4",
                "-N",
                "-e",
                f"SELECT COLUMN_NAME FROM information_schema.COLUMNS "
                f"WHERE TABLE_SCHEMA = '{database}' AND TABLE_NAME = '{table}';",
            ],
            text=True,
            capture_output=True,
            check=True,
        ).stdout.splitlines()
    )
    alter_specs = [
        ("body_text", "LONGTEXT NULL"),
        ("body_links_json", "LONGTEXT NULL"),
        ("body_image_urls_json", "LONGTEXT NULL"),
        ("body_scrape_status", "VARCHAR(32) NULL"),
        ("body_error_message", "VARCHAR(512) NULL"),
        ("body_scraped_at", "VARCHAR(32) NULL"),
    ]
    missing = [f"ADD COLUMN `{name}` {definition}" for name, definition in alter_specs if name not in existing_columns]
    if missing:
        alter_sql = f"USE `{database}`;\nALTER TABLE `{table}`\n  " + ",\n  ".join(missing) + ";"
        subprocess.run(
            ["mysql", f"-u{mysql_user}", "--default-character-set=utf8mb4"],
            input=alter_sql,
            text=True,
            check=True,
        )


def sql_literal(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, int):
        return str(value)
    text = str(value).replace("\x00", "")
    text = text.replace("\\", "\\\\").replace("'", "''")
    return f"'{text}'"


def insert_rows(rows: Iterable[ThreadRow], database: str, table: str, mysql_user: str) -> None:
    rows = list(rows)
    if not rows:
        raise RuntimeError("No rows scraped; refusing to write an empty import.")
    ensure_table(database, table, mysql_user)

    columns = [
        "rank_no",
        "page_no",
        "forum_id",
        "forum_name",
        "thread_id",
        "type_id",
        "type_name",
        "title",
        "url",
        "author_name",
        "author_uid",
        "created_at_raw",
        "reply_count",
        "view_count",
        "last_author_name",
        "last_author_uid",
        "last_post_at_raw",
        "read_permission",
        "is_closed",
        "has_attachment",
        "has_image",
        "is_recommended",
        "recommend_score",
        "scraped_at",
    ]
    values = []
    for row in rows:
        values.append("(" + ", ".join(sql_literal(getattr(row, col)) for col in columns) + ")")

    assignments = ",\n        ".join(
        f"`{col}` = VALUES(`{col}`)"
        for col in columns
        if col != "thread_id"
    )
    upsert_sql = f"""
USE `{database}`;
INSERT INTO `{table}` ({", ".join(f"`{col}`" for col in columns)})
VALUES
{",\n".join(values)}
ON DUPLICATE KEY UPDATE
        {assignments};
"""
    subprocess.run(
        ["mysql", f"-u{mysql_user}", "--default-character-set=utf8mb4"],
        input=upsert_sql,
        text=True,
        check=True,
    )


def fetch_thread_ids_for_body(database: str, table: str, mysql_user: str, limit: int) -> list[int]:
    sql = (
        f"SELECT thread_id FROM `{database}`.`{table}` "
        "WHERE body_scrape_status IS NULL OR body_scrape_status <> 'ok' "
        f"ORDER BY rank_no LIMIT {limit};"
    )
    result = subprocess.run(
        ["mysql", f"-u{mysql_user}", "--default-character-set=utf8mb4", "-N", "-e", sql],
        text=True,
        capture_output=True,
        check=True,
    )
    thread_ids = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if line:
            thread_ids.append(int(line))
    return thread_ids


def update_body_rows(rows: Iterable[ThreadBodyRow], database: str, table: str, mysql_user: str) -> None:
    rows = list(rows)
    if not rows:
        return
    ensure_table(database, table, mysql_user)
    sql_parts = [f"USE `{database}`;"]
    for row in rows:
        sql_parts.append(
            f"""UPDATE `{table}` SET
  `body_text` = {sql_literal(row.body_text)},
  `body_links_json` = {sql_literal(row.body_links_json)},
  `body_image_urls_json` = {sql_literal(row.body_image_urls_json)},
  `body_scrape_status` = {sql_literal(row.body_scrape_status)},
  `body_error_message` = {sql_literal(row.body_error_message)},
  `body_scraped_at` = {sql_literal(row.body_scraped_at)}
WHERE `thread_id` = {row.thread_id};"""
        )
    subprocess.run(
        ["mysql", f"-u{mysql_user}", "--default-character-set=utf8mb4"],
        input="\n".join(sql_parts),
        text=True,
        check=True,
    )


def scrape_bodies(database: str, table: str, mysql_user: str, limit: int, delay: float) -> list[ThreadBodyRow]:
    ensure_table(database, table, mysql_user)
    thread_ids = fetch_thread_ids_for_body(database, table, mysql_user, limit)
    if not thread_ids:
        return []

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Referer": BASE_URL})
    body_rows: list[ThreadBodyRow] = []

    for index, thread_id in enumerate(thread_ids):
        try:
            document = html.fromstring(fetch_html(session, thread_url(thread_id), f"Thread {thread_id}"))
            body_rows.append(parse_thread_body(document, thread_id))
        except requests.RequestException as exc:
            body_rows.append(
                ThreadBodyRow(
                    thread_id=thread_id,
                    body_text=None,
                    body_links_json=None,
                    body_image_urls_json=None,
                    body_scrape_status="request_error",
                    body_error_message=truncate(str(exc), 512),
                    body_scraped_at=dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat(),
                )
            )
        except RuntimeError as exc:
            body_rows.append(
                ThreadBodyRow(
                    thread_id=thread_id,
                    body_text=None,
                    body_links_json=None,
                    body_image_urls_json=None,
                    body_scrape_status="challenge",
                    body_error_message=truncate(str(exc), 512),
                    body_scraped_at=dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat(),
                )
            )

        if index + 1 < len(thread_ids):
            time.sleep(delay)

    update_body_rows(body_rows, database, table, mysql_user)
    return body_rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["list", "bodies", "both"], default="list")
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--delay", type=float, default=0.5)
    parser.add_argument("--database", default="reverse_learning")
    parser.add_argument("--table", default="pojie_reverse_threads")
    parser.add_argument("--mysql-user", default="root")
    args = parser.parse_args()

    if args.limit < 1:
        raise SystemExit("--limit must be positive")
    if not os.environ.get("MYSQL_PWD"):
        raise SystemExit("Set MYSQL_PWD before running so the password is not stored in the script.")

    if args.mode in {"list", "both"}:
        rows = scrape(limit=args.limit, delay=args.delay)
        insert_rows(rows, database=args.database, table=args.table, mysql_user=args.mysql_user)
        print(f"imported={len(rows)} database={args.database} table={args.table}")
        print(f"first_thread_id={rows[0].thread_id} first_title={rows[0].title}")
        print(f"last_thread_id={rows[-1].thread_id} last_title={rows[-1].title}")

    if args.mode in {"bodies", "both"}:
        body_rows = scrape_bodies(
            database=args.database,
            table=args.table,
            mysql_user=args.mysql_user,
            limit=args.limit,
            delay=args.delay,
        )
        status_counts: dict[str, int] = {}
        for row in body_rows:
            status_counts[row.body_scrape_status] = status_counts.get(row.body_scrape_status, 0) + 1
        print(
            "body_updates="
            f"{len(body_rows)} statuses={json.dumps(status_counts, ensure_ascii=False, sort_keys=True)}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
