#!/usr/bin/env node
// Checks stages.html against stages.json, the lifecycle's stages written once
// as data in the reference repository (CommonAgent/adlc, standards/stages.json).
// The site, the auditor and the console all read that file, so this page may
// not say anything it does not.
//
//   node tools/check-stages.mjs                  reads stages.json from CommonAgent/adlc main
//   node tools/check-stages.mjs <stages.json>    reads a local copy
//
// For every stage card it compares the id, the number, the phase, the name,
// the reference agents, the line under the name, the role, what it is given,
// what it hands back, when it is done, and, for Architecture and Design, each
// part. The assets each stage makes come from assets.html. Any difference, or
// a stage on one side and not the other, fails, and the script exits 1 naming
// each one.
//
// Node 22, no dependencies.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "https://raw.githubusercontent.com/CommonAgent/adlc/main/standards/stages.json";

/** The words of a piece of the page: list items become "\n- " lines, tags go,
 *  and runs of spaces become one. */
export function text(html) {
  return html
    .replace(/<li[^>]*>/g, "\n- ")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l, i) => l || i === 0)
    .join("\n")
    .trim();
}

/** A <dl> of Role, Given, Hands back, Done when, as an object. */
function terms(dl) {
  const out = {};
  for (const [, dt, dd] of dl.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)) out[text(dt)] = text(dd);
  return out;
}

const FIELD = { Role: "role", Given: "given", "Hands back": "hands_back", "Done when": "done_when" };
const fields = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [FIELD[k] ?? k, v]));

/** The phases and stages as the pages say them. */
export function extract(stagesHtml, assetsHtml) {
  const phases = [];
  const stages = [];
  const parts = stagesHtml.split(/(?=<h2 class="phase-head")/).slice(1);
  for (const chunk of parts) {
    const [, pid, pname] = chunk.match(/<h2 class="phase-head" id="phase-([a-z]+)">([\s\S]*?)<\/h2>/);
    if (pid === "beside") continue; // the ledger is beside the stages, not one of them
    phases.push({ id: pid, name: text(pname) });
    for (const [, id, body] of chunk.matchAll(/<section class="stage[^"]*" id="([a-z-]+)">([\s\S]*?)<\/section>/g)) {
      const head = body.match(/<div class="head">([\s\S]*?)<\/div>/)[1];
      const holders = [...head.matchAll(/<a class="agent-on"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => text(m[1]));
      const stage = {
        id,
        number: Number(head.match(/<span class="num">(\d+)<\/span>/)[1]),
        phase: pid,
        name: text(head.match(/<h2>([\s\S]*?)<\/h2>/)[1]),
        reference_holder: holders[0] ?? null,
        reference_holders: holders,
        why: text(body.match(/<p class="why">([\s\S]*?)<\/p>/)[1]),
        aliases: [...body.matchAll(/<span id="([a-z-]+)" aria-hidden="true"><\/span>/g)].map((m) => m[1]),
      };
      const partBlocks = [...body.matchAll(/<div class="part">\s*<h3>([\s\S]*?)<\/h3>\s*(<dl>[\s\S]*?<\/dl>)\s*<\/div>/g)];
      if (partBlocks.length) {
        stage.parts = partBlocks.map(([, name, dl]) => ({ name: text(name), ...fields(terms(dl)) }));
        const { role, given, hands_back } = stage.parts[0];
        Object.assign(stage, { role, given, hands_back }, fields(terms(body.match(/<dl class="done">([\s\S]*?)<\/dl>/)[1])));
      } else {
        Object.assign(stage, fields(terms(body.match(/<dl>([\s\S]*?)<\/dl>/)[1])));
      }
      stages.push(stage);
    }
  }
  // The assets each stage makes, from the strip on assets.html, in its order.
  const byName = new Map(stages.map((s) => [s.name, s]));
  for (const s of stages) s.assets = [];
  for (const [, name, where] of assetsHtml.matchAll(/<span class="t-name">([\s\S]*?)<\/span><span class="t-stage">([\s\S]*?)<\/span><span class="t-tier">/g)) {
    const made = text(where.replace(/<span class="(onramp|golive)-tag">[\s\S]*?<\/span>/g, ""));
    for (const stageName of made.split(/,\s*/)) {
      const s = byName.get(stageName);
      if (!s) throw new Error(`assets.html: ${text(name)} is made at "${stageName}", which is no stage's name`);
      s.assets.push(text(name));
    }
  }
  for (const s of stages) s.asset = s.assets[0] ?? null;
  return { phases, stages };
}

const COMPARED = ["number", "phase", "name", "role", "reference_holder", "reference_holders", "given", "hands_back", "done_when", "asset", "assets", "why", "aliases", "parts"];

/** Every difference between what the pages say and what stages.json says. */
export function differences(page, data) {
  const out = [];
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if (!same(page.phases, (data.phases ?? []).map(({ id, name }) => ({ id, name })))) {
    out.push(`phases: the page has ${JSON.stringify(page.phases)}, stages.json has ${JSON.stringify(data.phases)}`);
  }
  const want = data.stages ?? [];
  const ids = (list) => list.map((s) => s.id).join(", ");
  if (ids(page.stages) !== ids(want)) out.push(`stages: the page has ${ids(page.stages)}; stages.json has ${ids(want)}`);
  const byId = new Map(want.map((s) => [s.id, s]));
  for (const s of page.stages) {
    const d = byId.get(s.id);
    if (!d) continue;
    for (const k of COMPARED) {
      if (!same(s[k], d[k])) out.push(`${s.id}.${k}: the page says ${JSON.stringify(s[k] ?? null)}, stages.json says ${JSON.stringify(d[k] ?? null)}`);
    }
  }
  return out;
}

async function main() {
  const arg = process.argv[2];
  let raw;
  if (arg) raw = readFileSync(arg, "utf8");
  else {
    const res = await fetch(SOURCE);
    if (!res.ok) throw new Error(`${SOURCE} answered ${res.status}`);
    raw = await res.text();
  }
  const data = JSON.parse(raw);
  const page = extract(readFileSync(join(root, "stages.html"), "utf8"), readFileSync(join(root, "assets.html"), "utf8"));
  const diffs = differences(page, data);
  if (diffs.length) {
    console.error(`stages.html and assets.html differ from stages.json (${arg ?? SOURCE}, version ${data.version}):`);
    for (const d of diffs) console.error(`  ${d}`);
    process.exit(1);
  }
  console.log(`stages.html matches stages.json version ${data.version}: ${page.phases.length} phases, ${page.stages.length} stages`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
