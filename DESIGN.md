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

## Avery's round-3 feedback (built)

| Feedback | In the game |
| --- | --- |
| Cokco-orbs — transform into an element/thing (slime, hammer, …) | `FORMS` + `cycleForm()` (`Q` / touch button). **slime** shrinks the body & skips `kind:'tight'` solids; **hammer** smashes `kind:'rock'` solids on `E`. `drawCokco()` branches per form. More orbs = add to `FORMS` + a `G.orbs` flag |
| Challenges/NPC problems that need the orbs | quests `hammer` (Boulda → Hammer Orb → smash the boulder) and `slime` (Nook → the sealed crack) |
| Swimming — press up to float up 5s, then left/right to swim | the `w.floaty` branch of `updatePlay()` — `P.floatT` buoyancy, wider horizontal control, gentle sink otherwise |
| NPC problem only solvable by swimming | quest `swim` (Marlo's Spyglass, atop a pillar higher than any jump) |
| Sea-Urchin Flattening Centre — enter, talk to a *moving* NPC named **Sxco**, he flattens urchins at his machine | new `flatten` world reached by a `target` door at Home; `npcs[].patrol` makes Sxco pace; `talkTo` `action:'flatten'` → `flattenUrchin()` (Sea Urchin → Flat Urchin) |
| Put the flat urchin in a card; scan the card at a special machine → a new orb | `RECIPES` `orb-card` (Flat Urchin + 2 coins); `machines` `kind:'scanner'` + `scanCard()` → unlocks the next orb (Slime first). Different scanners could grant different orbs later |

## Avery's round-4 feedback (built)

| Feedback | In the game |
| --- | --- |
| Sea Urchin Blocks you can *place*, jump on, and use to reach high places | `toggleBlock()` on `B` — grid-snapped block in front of Cokco, `kind:'placed'` solid, stored in `G.placed[world]`, `B` again picks it up. `drawUrchinBlock()` for the visual |
| NPC problem only solvable with a placed block | quest `block` — Curato in the Water-Works; stack blocks to a `ledge` at y496 (far above any jump) for the Urchin Fossil |
| Water-Works layer — a water museum + fun-park | `WORLDS.waterworks` (`bg:'waterworks'` — exhibit tanks, a spinning fun-park wheel); door from the Ocean layer |
| Dirt layer — a tunnel to shops; buy blocks with coins; a gold-mining shop | `WORLDS.dirt` (`bg:'dirt'` — a `kind:'dirt'` ceiling forms the low tunnel, torch glows in the cavern). **Blok** `action:'shop'` (`PANEL.shop` + `buyFromShop()`); **Nugget** `action:'mine'` → `goMining()` pays coins for `G.gold` |
| Machines that take a Cokco card for a random item; some need a battery | `machines` `kind:'gacha'` + `needsBattery` → `useMachine()` / `weightedPick()`. `battery` item (also drops from chests, sold by Blok). `grant()` routes prizes to the bag or a counter |

## Avery's round-5 feedback (built)

| Feedback | In the game |
| --- | --- |
| Secret Beach layer | `WORLDS.beach` (`bg:'beach'`) — reached by a `target` door at Home that only exists **behind the smashed boulder** (the boulder is now too tall to jump) |
| Snake orb from an orb-chest as soon as you enter | `orbChests: [{x,y,orb:'snake'}]` at the shore; `openChest()` handles `o.orbId` → `G.orbs[orb]=true`. `drawOrbChest()` (glowing) |
| Snake orb climbs walls | `FORMS.snake` (thin) + the `climbing` branch of `updatePlay()` — `P.touchWall` (set in `moveX`) + hold ↑/↓; tap jump to hop off. `drawCokco()` snake branch |
| NPC problem only solvable by climbing | quest `climb` — Sandy's kite on a `wall` + `ledge` 490px up the cliff |
| Two rewards on solving: 10 coins + a flying orb | `QUEST_HOOKS.climb.reward` — `G.coins += 10` **and** `G.orbs.fly = true`. `FORMS.fly` = hold ↑ to soar (reduced gravity); `drawCokco()` fly branch (wings) |

## Roadmap (not built yet)

- **Two-player** — split input (P2 on `IJKL` or a gamepad), shared screen or
  drop-in co-op. The blue page starts this thought but doesn't finish it.
- **More orbs** — the system takes a name in `FORMS` + a `G.orbs` flag + a
  `drawCokco` branch + (usually) a new solid `kind:`; add to `ORB_ORDER`.
- **More layers** — worlds go on forever. Add `WORLDS` entries + a drop-hole or a
  `target` door. Each new NPC adds a problem.
- **Deeper crafting chains** — recipes that need items from several challenges.
- **More challenge types** — timed platforming, find-the-thing, simple bosses.
- **Sound** — a few short blips (jump, collect, box-pop, win) via WebAudio.

## Shape of the code

`site/index.html` is one file. The `<script>` is in numbered sections; sections 5
(`WORLDS`) and 6 (`QUESTS`) are the data you edit to grow the game. `test/smoke.js`
boots it headlessly and drives the main flows so changes don't silently break it.
