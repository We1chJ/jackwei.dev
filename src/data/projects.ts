export type Rarity = 'COMMON' | 'RARE' | 'LEGENDARY' | 'SHINY';

export interface Project {
  id: string;
  title: string;
  blurb: string;
  rarity: Rarity;
  tags: string[];
  url?: string;
  /** Left out of the Projects section (the pranks): false. */
  listed?: boolean;
}

// The gacha dispenses these (capsule index modulo the count); some are pranks.
export const PROJECTS: Project[] = [
  { id: 'truly', title: 'Truly', blurb: 'AI-native, behaviour-focused talent assessment, built and launched in 4 weeks. Top 3 at Ship Season 2026 Demo Day.', rarity: 'LEGENDARY', tags: ['Next.js', 'Supabase', 'LangChain'], url: 'https://trulyta.com' },
  { id: 'afora', title: 'Afora', blurb: 'Team matching and task splitting for student projects. 100+ users, Babson Foundry funded.', rarity: 'LEGENDARY', tags: ['Next.js', 'Firebase', 'Vercel'], url: 'https://afora1.vercel.app' },
  { id: 'factuality', title: 'Factuality', blurb: 'Chrome extension that fact-checks the page you are on. Won the Generator Buildathon.', rarity: 'LEGENDARY', tags: ['React', 'Perplexity API'], url: 'https://we1chj.github.io/FactualityPage' },
  { id: 'rehab-ar', title: 'Rehab AR app', blurb: 'iOS game that turns physical therapy into a game for seniors. 95% liked it.', rarity: 'RARE', tags: ['Swift', 'LiveKit', 'Vision'] },
  { id: 'radar', title: 'Radar back-projection', blurb: '12× faster SAR imaging with Pythran and C++.', rarity: 'RARE', tags: ['C++', 'NumPy'] },
  { id: 'net-ui', title: 'Network manager UI', blurb: 'Kotlin + Compose dashboard built for millions of users.', rarity: 'RARE', tags: ['Kotlin', 'Flask'] },
  { id: 'magnifier', title: 'Resume magnifier', blurb: 'A WebGL glass lens over a PDF. The old version of this site.', rarity: 'COMMON', tags: ['three.js'] },
  { id: 'sleep', title: "Jack's sleep schedule", blurb: '0 stars. Do not attempt.', rarity: 'SHINY', tags: ['Deprecated'], listed: false },
  { id: 'duck', title: 'Rubber duck', blurb: 'It is a rubber duck. It does nothing. Try again.', rarity: 'COMMON', tags: ['Prank'], listed: false },
  { id: 'this-site', title: 'This website, v7', blurb: 'A 3D gacha machine with a physics engine, because a PDF was not enough.', rarity: 'RARE', tags: ['React Three Fiber', 'Rapier'] },
  { id: 'icpc', title: 'ICPC top 5 in district', blurb: 'Competitive programming. The capsules are faster than the judge.', rarity: 'RARE', tags: ['C++', 'Algorithms'], listed: false },
];
