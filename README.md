# agenticdevelopment.ai

The software lifecycle, written for work that agents do.

The stages are the ordinary ones. What changes when an agent holds a stage is
that the handoff has to become an artifact rather than a conversation, and that
a stage held without approval needs a check the agent does not control.

The site is five pages:

- `index.html`: the argument, the map of twenty-four stages, and the ledger beside them
- `stages.html`: each stage: role, given, hands back, done when
- `handoffs.html`: the artifact chain, and why it breaks where it does
- `processes.html`: the processes that run the lifecycle, kept at agentprocesses.ai
- `implementations.html`: what holds each stage today

Static HTML with one stylesheet, in the same family as agentmesh.ai,
agentroles.ai, agentdoc.net, agentsow.com and agentmandate.net: Space Grotesk
display, IBM Plex body and mono, blueprint grid. This surface's ink is a
graphite with a faint green cast and its lead accent is lime.

Nothing on the site carries meaning in hue alone. Every level and every gap is
marked with a word as well as a color.

`tools/check-links.mjs` opens every agent link and every role link on the site
and fails on any that does not answer with a page (node 22, no dependencies):
`node tools/check-links.mjs`. Run it before pushing.

Published by GitHub Pages from `main`, at agenticdevelopment.ai (see `CNAME`).
A push to `main` publishes.

A working draft, v0.3.0-draft, developed alongside AgentMesh.
