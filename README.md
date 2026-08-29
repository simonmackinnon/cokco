# Cokco

A 2D platformer designed by Avery (a kid) and built with AI from the drawings.
One HTML file, no build step.

Live: **https://cokco.theclouddevopslearningblog.com**

## Play it

Open **`site/index.html`** in a browser (double-click it, or drag it into a tab).
That's the whole game. Progress saves automatically in that browser.

## Controls

| Do this | Key |
| --- | --- |
| Walk | `←` `→` or `A` `D` |
| Jump | `↑` / `W` / `Space` (hold longer = jump higher) |
| Talk to a creature / open a box | `E` |
| Bag (inventory) | `I` |
| Problems (quest log) | `J` |
| Menu (Go Home, Map, Reset) | `Esc` |

On a phone/tablet, on-screen buttons appear automatically (move ◀ ▶, jump ▲,
talk **E**, and 🎒 📋 ☰). Add `?touch=1` to the URL to force them on a desktop.

## What's in this first version

- **Cokco** — a round, hairless made-up creature with stick arms and legs.
- **Two worlds ("layers")**: *Home* (grassy) and the *Ocean layer*, joined by
  **drop-holes** — fall through one and you land in the next layer.
- **Stairs** you walk straight up, and an **elevator** that rides up 5s then back
  down. When it reaches the top, **green stairs appear** to a high ledge with a reward.
- **Boxes with sea urchins inside** — bonk from below with a jump, or press `E`.
- **NPCs that stand still and give you problems to solve.** The goal is to solve
  every problem; there's no ending, new ones appear.
- **Sea-urchin catching minigame** (talk to Clawdia in the Ocean layer): fill the
  basket, bank at the bucket, watch for **x2** urchins and the rare **blue** one
  (a Blue Pearl). A green **+2** bubble grows the basket from 6 up to 10.
- **Bag**: 10 pockets, 20 of each item. **Craft-house**: 3 urchins → a Grabber.

See `DESIGN.md` for the original paper design and the roadmap.

## Repo layout

```
site/                the game — everything in here is what gets deployed
  index.html
test/smoke.js         headless smoke test (fake DOM) — node test/smoke.js
infra/                Terraform: S3 + CloudFront + ACM + Route53 for the subdomain
scripts/              one-time bootstrap + the CI IAM policy
.github/workflows/    deploy.yml (push to main), ci.yml (PRs)
```

## Test

```
node test/smoke.js
```

Boots the game with a fake browser and drives 27 checks — walking, jumping, every
panel, world travel, elevator → green stairs → reward, box-popping, dialogue, the
full minigame, and a quest turn-in. Runs on every PR via `ci.yml`.

## Hosting & deploy

Same shape as the other `*.theclouddevopslearningblog.com` sites (closest match:
`meme-generator`): a private S3 bucket, a CloudFront distribution (OAI) with an
ACM cert in `us-east-1`, and one Route53 A-alias record added to the **existing**
`theclouddevopslearningblog.com` hosted zone (owned by the `clouddevopslearningblog`
repo — this project only reads it). All of that is Terraform in `infra/`.

`.github/workflows/deploy.yml` runs on push to `main`:

- change under **`infra/**`** → `terraform apply`
- change under **`site/**`** → `aws s3 sync site/` + CloudFront invalidation
- `workflow_dispatch` runs both

### First-time setup (once)

1. **State bucket** — with admin AWS creds locally:
   ```
   ./scripts/bootstrap-state-bucket.sh
   ```
   It prints a bucket name like `cokco-terraform-state-<account-id>`.

2. **GitHub secrets** — repo → Settings → Secrets and variables → Actions:

   | Secret | Value |
   | --- | --- |
   | `TF_STATE_BUCKET` | the bucket name from step 1 |
   | `AWS_ACCESS_KEY_ID` | CI user key (perms: `scripts/iam-policy-github-actions.json`) |
   | `AWS_SECRET_ACCESS_KEY` | CI user secret |

3. **Deploy** — push to `main` (or run the workflow manually). First run takes
   ~15-25 min while CloudFront and the ACM cert come up; the site upload waits for
   the bucket and then syncs. DNS is automatic — the Route53 record lands in the
   zone that already serves the apex domain, so `cokco.` resolves as soon as
   CloudFront is ready.

### Local infra work

```
cd infra
terraform init -backend-config="bucket=<TF_STATE_BUCKET>"
terraform plan
```
