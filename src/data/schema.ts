// The shape of what the machines hold. Each machine reads one list from its own file in this folder
// (software.ts: the vending machine). The types catch a missing or misspelt field as you type; the rules
// types cannot (lengths that fit the card, unique ids, images that exist) are checked by
// scripts/check-data.ts, run with `npm run check` and before every build.

export type Rarity = 'COMMON' | 'RARE' | 'LEGENDARY' | 'SHINY';

export interface Link {
  kind: 'live' | 'code' | 'video';
  url: `https://${string}`;
}

/** A software project: one card in the vending machine, and one entry in the Projects section. */
export interface Software {
  /** Unique, lowercase-with-dashes. Names its image folder, public/software/<id>/, and its page anchor. */
  id: string;
  /** At most 28 characters. */
  title: string;
  /** At most 120 characters: four lines on the card's front. */
  blurb: string;
  rarity: Rarity;
  /** 1 to 6 tools. The front prints the first few that fit, the back all of them. */
  stack: string[];
  /** The result worth bragging about, in one line of at most 60 characters. */
  proof?: string;
  /** What you did on it, at most 40 characters. */
  role?: string;
  year?: number;
  links?: Link[];
  /** An image file in public/software/<id>/, about 3:2, shown on the card's front. The mascot if left out. */
  cover?: string;
}
