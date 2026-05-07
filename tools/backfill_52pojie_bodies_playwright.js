#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const { chromium } = require("playwright");

const BASE_URL = "https://www.52pojie.cn/";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function parseArgs(argv) {
  const options = {
    database: "reverse_learning",
    table: "pojie_reverse_threads",
    mysqlUser: "root",
    limit: 100,
    delayMs: 1800,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--database" && next) {
      options.database = next;
      i += 1;
    } else if (arg === "--table" && next) {
      options.table = next;
      i += 1;
    } else if (arg === "--mysql-user" && next) {
      options.mysqlUser = next;
      i += 1;
    } else if (arg === "--limit" && next) {
      options.limit = Number(next);
      i += 1;
    } else if (arg === "--delay-ms" && next) {
      options.delayMs = Number(next);
      i += 1;
    }
  }

  if (!Number.isFinite(options.limit) || options.limit < 1) {
    throw new Error("--limit must be a positive integer");
  }
  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) {
    throw new Error("--delay-ms must be zero or greater");
  }
  if (!process.env.MYSQL_PWD) {
    throw new Error("Set MYSQL_PWD before running.");
  }
  return options;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  const text = String(value).replace(/\u0000/g, "").replace(/\\/g, "\\\\").replace(/'/g, "''");
  return `'${text}'`;
}

function normalizeBodyText(value) {
  const lines = String(value || "")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim());

  const compact = [];
  let blankPending = false;
  for (const line of lines) {
    if (line) {
      compact.push(line);
      blankPending = false;
    } else if (!blankPending && compact.length > 0) {
      compact.push("");
      blankPending = true;
    }
  }
  while (compact.length > 0 && compact[compact.length - 1] === "") {
    compact.pop();
  }
  return compact.join("\n") || null;
}

function truncate(value, limit) {
  if (!value) {
    return null;
  }
  return value.length <= limit ? value : `${value.slice(0, limit - 3)}...`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function threadUrl(threadId) {
  return `${BASE_URL}thread-${threadId}-1-1.html`;
}

function runMysql(mysqlUser, sql) {
  const result = spawnSync(
    "mysql",
    [`-u${mysqlUser}`, "--default-character-set=utf8mb4", "-N", "-e", sql],
    { encoding: "utf8", env: process.env }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || "mysql command failed");
  }
  return result.stdout;
}

function fetchThreadIds({ database, table, mysqlUser, limit }) {
  const sql =
    `SELECT thread_id FROM \`${database}\`.\`${table}\` ` +
    "WHERE body_scrape_status IS NULL " +
    "OR body_scrape_status IN ('no_body','challenge','request_error') " +
    `ORDER BY rank_no LIMIT ${limit};`;
  return runMysql(mysqlUser, sql)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => Number(line));
}

function updateRows({ database, table, mysqlUser, rows }) {
  if (rows.length === 0) {
    return;
  }
  const statements = [`USE \`${database}\`;`];
  for (const row of rows) {
    statements.push(
      `UPDATE \`${table}\` SET
  \`body_text\` = ${sqlLiteral(row.bodyText)},
  \`body_links_json\` = ${sqlLiteral(row.bodyLinksJson)},
  \`body_image_urls_json\` = ${sqlLiteral(row.bodyImageUrlsJson)},
  \`body_scrape_status\` = ${sqlLiteral(row.bodyScrapeStatus)},
  \`body_error_message\` = ${sqlLiteral(row.bodyErrorMessage)},
  \`body_scraped_at\` = ${sqlLiteral(row.bodyScrapedAt)}
WHERE \`thread_id\` = ${row.threadId};`
    );
  }

  const result = spawnSync(
    "mysql",
    [`-u${mysqlUser}`, "--default-character-set=utf8mb4"],
    { input: statements.join("\n"), encoding: "utf8", env: process.env }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || "mysql update failed");
  }
}

async function extractRow(page, threadId) {
  const pageBody = page.locator("body");
  const bodyText = await pageBody.innerText().catch(() => "");
  const postLocator = page.locator('[id^="postmessage_"]').first();
  const postCount = await page.locator('[id^="postmessage_"]').count().catch(() => 0);

  if (postCount > 0) {
    const text = normalizeBodyText(await postLocator.innerText().catch(() => ""));
    const links = unique(
      await postLocator.locator("a[href]").evaluateAll((nodes) =>
        nodes.map((node) => node.href).filter(Boolean)
      )
    );
    const images = unique(
      await postLocator.locator("img[src]").evaluateAll((nodes) =>
        nodes.map((node) => node.src).filter(Boolean)
      )
    );
    return {
      threadId,
      bodyText: text,
      bodyLinksJson: JSON.stringify(links),
      bodyImageUrlsJson: JSON.stringify(images),
      bodyScrapeStatus: "ok",
      bodyErrorMessage: null,
      bodyScrapedAt: isoNow(),
    };
  }

  const normalizedPageText = normalizeBodyText(bodyText) || "";
  let status = "no_body";
  if (normalizedPageText.includes("抱歉，本帖要求阅读权限高于")) {
    status = "permission_denied";
  } else if (normalizedPageText.includes("Please enable JavaScript and refresh the page.")) {
    status = "challenge";
  }
  return {
    threadId,
    bodyText: null,
    bodyLinksJson: null,
    bodyImageUrlsJson: null,
    bodyScrapeStatus: status,
    bodyErrorMessage: truncate(normalizedPageText, 512),
    bodyScrapedAt: isoNow(),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const threadIds = fetchThreadIds(options);
  if (threadIds.length === 0) {
    console.log("body_updates=0 statuses={}");
    return;
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
  });
  const page = await browser.newPage();
  const rows = [];
  const statusCounts = {};

  try {
    for (let index = 0; index < threadIds.length; index += 1) {
      const threadId = threadIds[index];
      try {
        await page.goto(threadUrl(threadId), {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        await page
          .waitForFunction(
            () => {
              const hasPost = document.querySelector('[id^="postmessage_"]');
              const text = document.body ? document.body.innerText : "";
              return (
                !!hasPost ||
                text.includes("抱歉，本帖要求阅读权限高于") ||
                text.includes("Please enable JavaScript and refresh the page.")
              );
            },
            { timeout: 5000 }
          )
          .catch(() => {});
        const row = await extractRow(page, threadId);
        rows.push(row);
        statusCounts[row.bodyScrapeStatus] = (statusCounts[row.bodyScrapeStatus] || 0) + 1;
      } catch (error) {
        const row = {
          threadId,
          bodyText: null,
          bodyLinksJson: null,
          bodyImageUrlsJson: null,
          bodyScrapeStatus: "request_error",
          bodyErrorMessage: truncate(String(error), 512),
          bodyScrapedAt: isoNow(),
        };
        rows.push(row);
        statusCounts[row.bodyScrapeStatus] = (statusCounts[row.bodyScrapeStatus] || 0) + 1;
      }

      if (index + 1 < threadIds.length && options.delayMs > 0) {
        await page.waitForTimeout(options.delayMs);
      }
    }
  } finally {
    await browser.close();
  }

  updateRows({ ...options, rows });
  console.log(`body_updates=${rows.length} statuses=${JSON.stringify(statusCounts)}`);
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
