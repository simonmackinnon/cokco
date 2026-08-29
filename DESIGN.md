# Cokco — design notes

This is a game designed by Avery (a kid) on three sheets of paper — a blue rules
page, a grid-paper level map, and a pink note about the catching minigame. The
code was built with AI from those drawings. This file writes down that vision and
tracks what the code does so far.

## The original idea (from the drawings)

- A **2D platformer**. You explore with **stairs**, **elevators**, and **blocks**
  — the blocks are boxes with **sea urchins inside**.
- **Drop-holes**: the player drops through a hole in the floor to go to the next
  **"world" / "layer"** (one of them is the *Ocean layer*).
- The player is **Cokco** — a made-up creature. Round. No hair. Colour doesn't
  matter. Medium-length lines for arms and legs.
- Cokco **walks around and talks to things** — other characters (NPCs) that
  **don't move**.
- **No end to the game.** The goal is to **solve all the problems** the NPCs tell
  you about. Example: a **worm NPC** asks you to investigate the next world; there
  is a **challenge you have to beat** down there.
- Beating some challenges lets an NPC in a **craft-house** craft something for you.
- **Inventory**: 10 different items, up to 20 of each.
- From the blue page: a **"go home"** button; **"if stood on → go to house"**; a
  **map** screen; the elevator note **"5 seconds up and then go down"**; and
  **"green stairs will appear when you get the elevator to the top"**; a mention of
  **two-player** ("if the game is two player…").
- From the pink note — the **sea-urchin catching** minigame: a timer, catch
  urchins, some are **x2**, one is **blue** and special, and an **"incris max"**
  pickup that raises your max from **6** toward **10**.

## What the code does now (vertical slice)

| From the drawing | In the game |
| --- | --- |
| Round hairless creature, line limbs | `drawCokco()` — circle body, cream belly, two dot eyes, stick arms/legs, squash on landing |
| Walk + talk to still NPCs | Full platformer movement; press `E` near an NPC for a dialogue box |
| Stairs | Step-shaped solids; Cokco auto-steps up ledges ≤ 16px |
| Elevator, "5 seconds up then down" | `elevators` — rides bottom→top→bottom, 5s each way, carries Cokco |
| "green stairs appear at the top" | `kind:'green'` solids stay hidden until the elevator touches its top |
| Blocks = boxes with sea urchins | `boxes` — bonk from below or press `E`; urchins scatter as pickups |
| Drop-holes to the next world | `holes` — fall in → travel to another world's arrival point |
| Two worlds incl. "Ocean layer" | `WORLDS.home` and `WORLDS.ocean` (floatier gravity, bubbles, coral) |
| NPCs give problems; worm sends you to the next world | `QUESTS.ocean` from Wriggo the worm; goal text = "solve every problem" |
| Craft-house crafts you something | Crafto turns 3 sea urchins into a Grabber |
| Inventory 10 × 20 | `invAdd` / bag panel, 10 slots, 20 per slot |
| "go home" button + map | Menu (`Esc`) → Go Home, Map |
| Sea-urchin catching: timer, x2, blue, raise max 6→10 | `startMinigame()` — 34s timer, target 8, bank at the bucket, x2 urchins, rare blue drops a Blue Pearl, green **+2** bubble grows the basket to 10 |

## Avery's round-2 feedback (built)

| Feedback | In the game |
| --- | --- |
| Sea urchin blocks are a *crafted* item, from collected urchins | `RECIPES` — Sea Urchin Block = 5 urchins, at a crafting table |
| Sea urchins should look like a spiky ball | `drawSpikeBall()` — used for pickups, loose urchins, the minigame, and the bag icon |
| Crafting tables (fixed spots for now) | `tables` in `WORLDS`; `E` opens the `craft` panel. Later: bootstrap-craft / buy / find one |
| Doors that travel between points in a level; choose by number | `doors` in `WORLDS`; `E` → `door` panel, pick by number key or tap; numbers match the in-world signs. Intra-world only for now |
| Grass/ground more block-style (2D Minecraft) | `drawSolid()` — tiled dirt/stone blocks + a grass cap with blades |
| Chests with Cokco-coins / rarely gems; rare gem boxes always gems | `chests` + `gemBoxes` in `WORLDS`; `G.coins` / `G.gems` counters, HUD-shown |
| Day & night on the user's real system time | `dayFactor()` off `new Date()`; `drawNightTint()` + sky blend + moon/stars; a Lantern softens it |

## Roadmap (not built yet)

- **Two-player** — split input (P2 on `IJKL` or a gamepad), shared screen or
  drop-in co-op. The blue page starts this thought but doesn't finish it.
- **Enterable houses** — "if stood on → go to house": step onto a doorway and load
  a small interior scene (shops, the craft-house inside).
- **Placing blocks** — the Sea Urchin Block is craftable but can't be placed yet;
  a place/pick-up mechanic would make it a real building block.
- **Inter-world doors** and **bootstrap-obtained crafting tables** (craft / buy / find).
- **More layers** — the design says the worlds go on forever. Add `WORLDS` entries
  and chain drop-holes. Each new worm/NPC adds a problem.
- **Deeper crafting chains** — recipes that need items from several challenges;
  a "keep" / storage NPC (the pink/grid notes hint at "sell" and "make ticks").
- **More challenge types** — not just catching; timed platforming, find-the-thing,
  simple boss patterns.
- **Sound** — a few short blips (jump, collect, box-pop, win) via WebAudio.

## Shape of the code

`site/index.html` is one file. The `<script>` is in numbered sections; sections 5
(`WORLDS`) and 6 (`QUESTS`) are the data you edit to grow the game. `test/smoke.js`
boots it headlessly and drives the main flows so changes don't silently break it.
