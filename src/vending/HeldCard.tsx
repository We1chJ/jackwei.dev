// The card in the visitor's hand. The 3D card flies up from the bin and lands; this takes over with the
// same printed art under HoloCard's foil, so it tilts with the pointer and flips over on a click.
import { useEffect, useState } from 'react';
import { EXPERIENCE } from '../data/experience';
import type { Rarity } from '../data/projects';
import { cardPictures } from './art';
import HoloCard from './HoloCard';

const FOIL: Record<Rarity, 'glitter' | 'bursts' | 'gold' | 'cosmos'> = { COMMON: 'glitter', RARE: 'bursts', LEGENDARY: 'gold', SHINY: 'cosmos' };
const CARD_RATIO = 512 / 716;

export default function HeldCard({ project }: { project: number }) {
  const [art, setArt] = useState<{ front: string; back: string } | null>(null);
  const card = EXPERIENCE[project];

  useEffect(() => {
    let alive = true;
    cardPictures(card, project, EXPERIENCE.length).then((pictures) => { if (alive) setArt(pictures); });
    return () => { alive = false; };
  }, [card, project]);

  if (!art) return null;
  return (
    <div className="held-card">
      <HoloCard
        image={art.front}
        backImage={art.back}
        alt={`${card.title} card. Click to flip it.`}
        preset={FOIL[card.rarity]}
        intensity={0.55}
        width={Math.round(Math.min(innerHeight * 0.62 * CARD_RATIO, innerWidth * 0.62))}
        radius={18}
      />
    </div>
  );
}
