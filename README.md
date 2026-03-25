# Adidas F50 — Cinematic Scroll Experience

A scroll-driven, WebGL-enhanced single-page cinematic experience for the Adidas F50 football cleat.

## Quick Start

Open `index.html` in a browser (or serve locally):

```bash
# Python
python3 -m http.server 8080

# Node.js (npx)
npx serve .
```

Then visit `http://localhost:8080`.

## Tech Stack

| Library | Purpose |
|---|---|
| Three.js r128 | 3D shoe geometry, WebGL post-processing (film grain, chromatic aberration, vignette) |
| GSAP 3.12 + ScrollTrigger | Scroll-driven animation timelines |
| Lenis 1.0.29 | Smooth scroll physics |
| VanillaTilt 1.8 | 3D card tilt effects |

All dependencies are loaded via CDN — no build step required.

## Security Note (Production Deployment)

Before deploying, add **Subresource Integrity (SRI)** `integrity` attributes to each CDN `<script>` tag in `index.html`. Generate hashes via [srihash.org](https://www.srihash.org/) or the cdnjs API:

```
https://api.cdnjs.com/libraries/three.js/r128?fields=sri
https://api.cdnjs.com/libraries/gsap/3.12.2?fields=sri
```

## Sections

| # | Scene | Key Effects |
|---|---|---|
| 01 | Opening Sequence | Particle assembly, scan-line reveal, F50 fragmentation |
| 02 | Speed Field | Canvas speed lines reacting to scroll velocity, metrics counters |
| 03 | Interactive 3D Product | Orbit controls, hotspot energy nodes, HUD overlay |
| 04 | Tech HUD | Scanner animation, glitch numbers, animated spec bars |
| 05 | Impact Sequence | Particle burst, crack lines, slow-motion drama |
| 06 | Speed Film | Scanline overlay, distortion ripples |
| 07 | Colorways | Momentum drag slider, color-bleed transitions |
| 08 | Athlete Wall | Velocity-reactive marquee, cinematic lighting |
| 09 | Final CTA | Spotlight cleat, liquid-fill button, heartbeat pulse |
| 10 | Exit / Footer | Silhouette fade, yellow dim |

## Performance

- 60 FPS target with ACES filmic tone-mapping
- Respects `prefers-reduced-motion` — disables heavy animations on low-motion preference
- Pixel ratio capped at 2× to protect mobile GPU
