import {
  Environment,
  Html,
  Lightformer,
  OrbitControls,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { Leva } from "leva";
import {
  Component,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AgXToneMapping } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import Decor from "./Decor.tsx";
import Pebbles from "./Pebbles.tsx";
import Spill, { clearSpill } from "./Spill.tsx";
import Tank, { shakeTank } from "./Tank.tsx";
import Underwater from "./Underwater.tsx";
import { tankState, water, waveDepth } from "./tankState.ts";
import "./styles.scss";

class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="scene-message" role="alert">
        The aquarium couldn’t load. Please reload with WebGL enabled.
      </div>
    ) : (
      this.props.children
    );
  }
}

function Readout() {
  const [values, setValues] = useState({ level: 35, wave: 0, spilled: 0 });
  useEffect(() => {
    const timer = window.setInterval(() => {
      let peak = 0;
      for (const height of water.h) peak = Math.max(peak, Math.abs(height));
      setValues({
        level: water.level * 100,
        wave: peak * 100,
        spilled: water.spilled * 1000,
      });
    }, 200);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="readout" aria-label="Live water measurements">
      <div>
        <span>WATER LEVEL</span>
        <strong>
          {values.level.toFixed(1)} <small>cm</small>
        </strong>
      </div>
      <div>
        <span>WAVE AMPLITUDE</span>
        <strong>
          {values.wave.toFixed(1)} <small>cm</small>
        </strong>
      </div>
      <div>
        <span>SPILLED</span>
        <strong>
          {values.spilled.toFixed(2)} <small>L</small>
        </strong>
      </div>
    </div>
  );
}

export default function App() {
  const [epoch, setEpoch] = useState(0);
  const [damping, setDamping] = useState(1);
  const [announcement, setAnnouncement] = useState(
    "A small world. Ready to make waves.",
  );
  const controls = useRef<OrbitControlsImpl>(null);
  const reset = () => {
    for (const v of [
      tankState.pos,
      tankState.vel,
      tankState.acc,
      tankState.target,
    ])
      v.set(0, 0, 0);
    water.reset();
    water.depth = waveDepth(water.level);
    clearSpill();
    setDamping(1);
    setEpoch((e) => e + 1);
    document.body.style.cursor = "";
    if (controls.current) {
      controls.current.enabled = true;
      controls.current.reset();
    }
    setAnnouncement("A fresh start. Water refilled, everything back in place.");
  };
  const experiment = (strong: boolean) => {
    shakeTank(strong);
    setAnnouncement(
      strong
        ? "A little storm. Watch the water spill and the fish scatter."
        : "A gentle nudge. Watch the water keep moving after the tank stops.",
    );
  };

  return (
    <main className="page">
      <Leva hidden />
      <header className="masthead">
        <a className="wordmark" href="./" aria-label="A Little Current home">
          <span className="mark" aria-hidden="true">
            ≋
          </span>{" "}
          FIELD NOTES <span className="divider">/</span> PHYSICS PLAYGROUND
        </a>
        <span className="edition">
          EXPERIMENT <b>02</b>
        </span>
      </header>
      <section className="introduction" aria-labelledby="title">
        <div>
          <h1 id="title">
            <em>Fluid Motion</em>
          </h1>
          <p className="subtitle">
            A glass world. A gentle ripple.
            <br />
            Set things in motion. See what follows.
          </p>
        </div>
        <div className="intro-side">
          <span className="live-dot" /> REAL-TIME PHYSICS
          <span className="intro-note">
            by{" "}
            <a target="_blank" href="https://patrickbecker.work">
              Patrick Becker
            </a>
          </span>
        </div>
      </section>
      <section className="stage" aria-label="Interactive aquarium">
        <div className="scene">
          <SceneBoundary>
            <Canvas
              shadows="percentage"
              dpr={[1, 1.5]}
              gl={{ toneMapping: AgXToneMapping, toneMappingExposure: 1.15 }}
              camera={{
                position: [0.85, 0.72, 1.4],
                fov: 36,
                near: 0.01,
                far: 30,
              }}
              fallback={
                <div className="scene-message">
                  This experiment needs a browser with WebGL support.
                </div>
              }
            >
              <Underwater />
              <ambientLight intensity={0.65} />
              <hemisphereLight args={["#effaf5", "#9c9b80", 1.3]} />
              <directionalLight
                position={[-2, 4, 3]}
                intensity={2.2}
                castShadow
                shadow-mapSize={[2048, 2048]}
                shadow-camera-left={-2}
                shadow-camera-right={2}
                shadow-camera-top={2}
                shadow-camera-bottom={-2}
                shadow-normalBias={0.008}
              />
              <Environment resolution={128}>
                <Lightformer
                  position={[-2, 3, 2]}
                  scale={[4, 4, 1]}
                  intensity={2}
                />
                <Lightformer
                  position={[2, 1, -2]}
                  scale={[3, 2, 1]}
                  intensity={1.5}
                  color="#c0e1db"
                />
              </Environment>
              <mesh
                receiveShadow
                rotation-x={-Math.PI / 2}
                position={[0, -0.001, 0]}
              >
                <planeGeometry args={[200, 200]} />
                <shadowMaterial transparent opacity={0.16} />
              </mesh>
              <Suspense
                fallback={
                  <Html center>
                    <div className="loading" role="status">
                      Loading 3D-Scene…
                    </div>
                  </Html>
                }
              >
                <Spill />
                <Physics key={epoch} timeStep={1 / 120} lengthUnit={0.1}>
                  <Tank damping={damping} />
                  <Pebbles />
                  <Decor />
                </Physics>
              </Suspense>
              <OrbitControls
                ref={controls}
                makeDefault
                target={[0, 0.19, 0]}
                maxPolarAngle={Math.PI / 2 - 0.05}
                minDistance={0.8}
                maxDistance={3}
                enablePan={false}
              />
            </Canvas>
          </SceneBoundary>
        </div>
        <div className="stage-caption">
          <span /> A WORLD IN MOTION · 80 × 40 × 45 CM
        </div>
        <Readout />
        <div className="scene-tools">
          <button className="text-button" onClick={reset}>
            <span aria-hidden="true">↺</span> Reset
          </button>
          <button
            className="icon-button"
            onClick={() => controls.current?.reset()}
            aria-label="Reset camera view"
            title="Reset camera view"
          >
            ⌖
          </button>
        </div>
        <p className="interaction-hint">
          Drag the glass to make waves <span>·</span> Drag the background to
          orbit
        </p>
      </section>
      <section className="workbench" aria-label="Experiment controls">
        <div className="experiments">
          <div className="collection-title">
            <h2>Make a little movement</h2>
            <span>TRY AN EXPERIMENT</span>
          </div>
          <div className="experiment-buttons">
            <button onClick={() => experiment(false)}>
              <span className="wave-icon" aria-hidden="true">
                ∿
              </span>
              <span>
                A gentle nudge<small>Meet inertia.</small>
              </span>
              <span className="arrow">↗</span>
            </button>
            <button onClick={() => experiment(true)}>
              <span className="wave-icon storm" aria-hidden="true">
                ≋
              </span>
              <span>
                A little storm<small>Find the tipping point.</small>
              </span>
              <span className="arrow">↗</span>
            </button>
          </div>
        </div>
        <div className="water-control">
          <div className="collection-title">
            <h2>Let it settle</h2>
            <output htmlFor="damping">{damping.toFixed(1)} s⁻¹</output>
          </div>
          <label htmlFor="damping">Wave damping</label>
          <input
            id="damping"
            type="range"
            min="0"
            max="3"
            step="0.1"
            value={damping}
            onChange={(e) => setDamping(Number(e.target.value))}
          />
          <div className="range-labels">
            <span>Long, lingering ripples</span>
            <span>A quicker calm</span>
          </div>
        </div>
        <p className="experiment-note" role="status">
          <span className="live-dot" />
          {announcement}
        </p>
      </section>
      <footer className="bottom-bar">
        <p>
          BUOYANCY <span> / </span> INERTIA <span> / </span> COLLECTIVE MOTION
        </p>
        <span className="series-note">An invitation to play with physics.</span>
      </footer>
      <details className="about">
        <summary>
          What makes it move?<span aria-hidden="true">+</span>
        </summary>
        <div className="about-grid">
          <article>
            <span className="eyebrow">01 / THE WATER</span>
            <h2>Motion leaves a trace.</h2>
            <p>
              Move the glass and the water lags behind. Gravity pulls its
              surface back toward level, sending waves across the tank. Damping
              gradually takes energy out of those waves. Push hard enough and
              water spills over the rim.
            </p>
          </article>
          <article>
            <span className="eyebrow">02 / THE WORLD INSIDE</span>
            <h2>Everything responds.</h2>
            <p>
              Buoyancy lifts the boat; submerged objects feel drag from the
              moving water. Fish follow simple rules for separation, alignment
              and cohesion, creating a school that reacts to its surroundings.
            </p>
          </article>
          <article>
            <span className="eyebrow">03 / THE EXPERIMENT</span>
            <h2>A model, made playful.</h2>
            <p>
              The surface uses a linearized shallow-water model, calibrated to
              the tank’s main sloshing mode. Rigid bodies handle collisions.
              Plants and light add visual motion. This is an interactive
              approximation, not a full fluid solver.
            </p>
            <p>
              Use the experiment buttons and damping slider with touch or
              keyboard. Reset refills the tank and restores the view.
            </p>
          </article>
        </div>
      </details>
      <div className="colophon">
        <span>FIELD NOTES — PHYSICS PLAYGROUND</span>
        <span>02 / A LITTLE CURRENT</span>
      </div>
    </main>
  );
}
