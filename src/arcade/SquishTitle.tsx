// A section title in the name's recipe: warm white letters, black outline and depth, one soft surface
// you can press and pull (ElasticMesh). The canvas is wider and taller than the letters so a pulled
// letter has room to go.
import { useCallback, useEffect, useState } from 'react';
import ElasticMesh from './ElasticMesh';
import { useTheme } from './theme';

const INK = '#141414', PAPER = '#FFFDF6';
const FONT = "'Lilita One', 'Arial Black', sans-serif";
const INK_RGB: [number, number, number] = [0.078, 0.078, 0.078], NEON_RGB: [number, number, number] = [1, 0.31, 0.545];
const BOX_H = 1.75;         // the title's height, em
const PULL = 1.5;           // how far a letter pulls, em
const CLEAR = 2.4;          // canvas past each side of the title, em: the longest pull and its overshoot
const LEFT = 0.12, BASELINE = 1.22;   // where the letters start, em
const OUTLINE = 0.07;       // stroke width, em
const LAYERS = 7, LAYER_GAP = 0.018;  // the depth: copies, and em between them
const REST = { x: 1, y: 14 };

const fontSize = () => Math.min(84, Math.max(44, innerWidth * 0.07));   // same as the old CSS title

export default function SquishTitle({ text }: { text: string }) {
  const [size, setSize] = useState(fontSize);
  const dark = useTheme((s) => s.mode === 'dark');
  useEffect(() => {
    const on = () => setSize(fontSize());
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, []);

  const draw = useCallback((g: CanvasRenderingContext2D, outlined: boolean) => {
    g.font = `400 ${size}px ${FONT}`;
    g.lineJoin = 'round';
    g.lineWidth = size * OUTLINE;
    if (outlined) { g.strokeStyle = INK; g.strokeText(text, LEFT * size, BASELINE * size); }
    g.fillStyle = PAPER;
    g.fillText(text, LEFT * size, BASELINE * size);
  }, [size, text]);

  const h = BOX_H * size;
  return (
    <h2 className="section-title" style={{ height: h }}>
      <ElasticMesh
        aria-label={text}
        draw={draw}
        fontFamily="'Lilita One'"
        fontWeight={400}
        material="sticker"
        theme="light"
        inflate={0.6}
        stiffness={0.5}
        wobble={0.6}
        press={0.35}
        grabRadius={size * 0.45}
        shadow={0}
        intro={false}
        pull={PULL * size}
        bleed={[CLEAR * size, CLEAR * size, CLEAR * size, CLEAR * size]}
        style={{ pointerEvents: 'none' }}
        view={{
          layers: LAYERS,
          gap: LAYER_GAP * size,
          color: dark ? NEON_RGB : INK_RGB,
          rest: REST,
          tilt: 3,
          perspective: 800,
          pivot: { x: size * 2, y: h / 2 },
          reach: { x: size * 5, y: size },
        }}
      />
    </h2>
  );
}
