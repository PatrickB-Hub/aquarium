# A Little Current — Physics Playground

Experiment 02: an interactive aquarium and a small study in fluid motion. The single-page layout shares the Field Notes identity of the neighbouring Weighing-Scale project.

**Live:** [aquarium.patrickbecker.work](https://aquarium.patrickbecker.work)

## Run

```sh
npm install
npm run dev
```

`npm run build` checks TypeScript and creates `dist/`. `npm run preview` serves that build. `npm test` runs ten checks covering water conservation, settling, buoyancy, drag and fish behaviour.

## Interact

- Drag the glass to move the aquarium; drag the background to orbit and scroll to zoom.
- **A gentle nudge** and **A little storm** provide touch- and keyboard-accessible experiments.
- **Wave damping** controls how quickly waves settle, in inverse seconds.
- Live measurements report rest water level, maximum absolute surface displacement and cumulative spilled volume.
- **Reset** refills the aquarium, respawns its contents, restores damping and resets the camera.

The water uses linearized shallow-water equations with a calibrated wave depth. Rapier handles rigid bodies, buoyancy and drag couple them to the water, and boids steer the fish. Plants and underwater light are visual effects. This is an exploratory simulation, not a full fluid solver.

Built with React, TypeScript, Three.js, React Three Fiber and Rapier. Lighting is generated locally; textures ship in `public/textures`. Google Fonts supplies the typography with local system-font fallbacks. WebGL is required.
