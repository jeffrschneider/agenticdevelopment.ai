#!/usr/bin/env node
// Checks every agent link and every role link on the site, and every link
// from one page of the site to a section of another.
//
//   node tools/check-links.mjs
//
// An agent link (https://app.agentmesh.ai/a/<handle>/agentdoc) passes when it
// answers 200 with an HTML page whose title names an AgentDoc. An agent that
// has no AgentDoc of its own yet links to its catalog page
// (https://agentcatalog.com/a/<handle>), which passes when it answers 200
// with the catalog's page for that agent; the catalog answers 404 for an
// agent it does not list. A role link
// (https://agentroles.ai/...) passes when it answers 200 with an HTML page.
// A link to a section (stages.html#impact, #ledger) passes when the page it
// points at has an element with that id. Anything else fails, and the script
// exits 1 naming the link and the pages that carry it.
//
// Node 22, no dependencies.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pages = readdirSync(root).filter((f) => f.endsWith(".html")).sort();

const AGENTDOC = /^https:\/\/app\.agentmesh\.ai\/a\/[^/]+\/agentdoc$/;
const CATALOG = /^https:\/\/agentcatalog\.com\/a\/[^/]+$/;
const AGENT = { test: (url) => AGENTDOC.test(url) || CATALOG.test(url) };
const ROLE = /^https:\/\/agentroles\.ai\//;

const html = new Map(pages.map((p) => [p, readFileSync(join(root, p), "utf8")]));
const ids = new Map(
  pages.map((p) => [p, new Set([...html.get(p).matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))]),
);

// url -> pages that link to it
const external = new Map();
const failures = [];

for (const page of pages) {
  for (const [, href] of html.get(page).matchAll(/\bhref="([^"]+)"/g)) {
    if (AGENT.test(href) || ROLE.test(href)) {
      if (!external.has(href)) external.set(href, new Set());
      external.get(href).add(page);
      continue;
    }
    if (/^[a-z]+:/i.test(href)) continue; // other sites, not checked here
    const [file, frag] = href.split("#");
    const target = file === "" ? page : file;
    if (!html.has(target)) {
      if (target.endsWith(".html")) failures.push({ link: href, on: [page], why: `no page ${target}` });
      continue;
    }
    if (frag && !ids.get(target).has(frag)) {
      failures.push({ link: href, on: [page], why: `no id "${frag}" on ${target}` });
    }
  }
}

async function check(url) {
  const kind = AGENT.test(url) ? "agent" : "role";
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
    const type = res.headers.get("content-type") ?? "";
    const body = await res.text();
    if (res.status !== 200) return { kind, ok: false, why: `${res.status} ${body.replace(/\s+/g, " ").trim().slice(0, 120)}` };
    // A role's conformance check is a script, published beside its page.
    if (/^https:\/\/agentroles\.ai\/checks\/[^/]+\.mjs$/.test(url)) {
      return type.includes("javascript") ? { kind, ok: true, why: "conformance check script" } : { kind, ok: false, why: `answered ${type}, not a script` };
    }
    if (!type.includes("text/html")) return { kind, ok: false, why: `answered ${type}, not a page` };
    const title = (body.match(/<title>([^<]*)<\/title>/i) ?? [])[1] ?? "";
    if (AGENTDOC.test(url) && !/AgentDoc/.test(title)) return { kind, ok: false, why: `page title is "${title}", not an AgentDoc` };
    if (CATALOG.test(url) && !/\S.*·\s*AgentMesh Catalog/.test(title)) return { kind, ok: false, why: `page title is "${title}", not a catalog agent page` };
    if (!title) return { kind, ok: false, why: "page has no title" };
    return { kind, ok: true, why: title.trim() };
  } catch (err) {
    return { kind, ok: false, why: String(err?.message ?? err) };
  }
}

const urls = [...external.keys()].sort();
let passed = 0;
for (const url of urls) {
  const r = await check(url);
  const on = [...external.get(url)].join(", ");
  console.log(`${r.ok ? "ok  " : "FAIL"}  ${r.kind.padEnd(5)}  ${url}`);
  console.log(`              ${r.why}  (on ${on})`);
  if (r.ok) passed++;
  else failures.push({ link: url, on: [...external.get(url)], why: r.why });
}

const agents = urls.filter((u) => AGENT.test(u)).length;
console.log("");
console.log(`${pages.length} pages, ${agents} agent links, ${urls.length - agents} role links, ${passed} of ${urls.length} answered with a page.`);

const sectionFailures = failures.filter((f) => !external.has(f.link));
if (sectionFailures.length === 0) console.log("Every link to a section of the site lands on that section.");

if (failures.length) {
  console.log("");
  console.log(`${failures.length} failed:`);
  for (const f of failures) console.log(`  ${f.link}  (${f.why}; on ${f.on.join(", ")})`);
  process.exit(1);
}
