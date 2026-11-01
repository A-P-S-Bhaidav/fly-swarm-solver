# FlySwarm Frontend — Spatial WebGL Connectome Laboratory

Interactive 3D laboratory interface for **FlySwarm**, built with **Next.js 16 (App Router)**, **React 19**, **Three.js / React Three Fiber**, and **Tailwind CSS v4**.

## Design System

* **Aesthetic**: Minimalism + Spatial UI + Subtle Brutalism (sharp `2px` architectural geometry, `1px` hairline frames, `4px` corner calibration reticles, tabular monospace telemetry, zero emojis).
* **Color Architecture**:
  * **Primary (Major)**: Charcoal Black (`#0B0C0E` void, `#121417` translucent spatial glass, `#181B1F` elevated controls)
  * **Secondary (2nd Major)**: Forest Green (`#1B4332` structural accents, `#2D6A4F` active borders, `#52B788` bioluminescent sensory pathways)
  * **Complementary (Minor)**: Crimson Red (`#B91C1C` / `#DC2626` action-potential spikes, *Drosophila* ommatidia, mismatch/abort states)

## Key Modules

* `app/page.tsx` — Spatial HUD orchestrating stimulus telemetry, `R1–R8` photoreceptor drive bars, ensemble consensus matrix, and session accuracy gain.
* `components/FlyArenaScene.tsx` — Full-viewport WebGL arena with smooth `ARENA / SWARM / BRAIN` camera rig transitions and leak-free GPU texture management.
* `components/FlyBrainHologram.tsx` — Renders 139,662 empirical MaleCNS v1.0 somatic coordinates with real-time per-agent and ensemble action-potential sparks.
* `components/FlyRubikActor.tsx` — Grounded 3D *Drosophila melanogaster* specimen kinematics.
* `components/ControlDrawer.tsx` — Accessible native `<dialog>` console for stimulus parameters and live WebSocket readout training (`/ws/train`).

## Development & Verification

```bash
npm install
npm run dev          # http://localhost:3000

# Quality gates
npm run lint
npx tsc --noEmit
npm run build
```

## Environment Variables

Configure in `.env.local` (or Vercel Project Settings):

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```
