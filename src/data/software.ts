// The vending machine's cards, one per project, filling the slots in order (A1, A2 … D4: sixteen at
// most). A slot with no project stays empty. The fields are described in schema.ts; to add one, copy
// an entry, give it a new id, and put any images in public/software/<id>/.
import type { Software } from './schema';

export const SOFTWARE: readonly Software[] = [
  {
    id: 'truly', title: 'Truly', rarity: 'LEGENDARY', year: 2026,
    blurb: 'AI-native, behaviour-focused talent assessment, built and launched in 4 weeks. Top 3 at Ship Season 2026 Demo Day.',
    stack: ['Next.js', 'Supabase', 'LangChain'],
    proof: 'Top 3 at Ship Season 2026 Demo Day',
    links: [{ kind: 'live', url: 'https://trulyta.com' }],
  },
  {
    id: 'afora', title: 'Afora', rarity: 'LEGENDARY',
    blurb: 'Team matching and task splitting for student projects. 100+ users, Babson Foundry funded.',
    stack: ['Next.js', 'Firebase', 'Vercel'],
    proof: '100+ users, Babson Foundry funded',
    links: [{ kind: 'live', url: 'https://afora1.vercel.app' }],
  },
  {
    id: 'factuality', title: 'Factuality', rarity: 'LEGENDARY',
    blurb: 'Chrome extension that fact-checks the page you are on. Won the Generator Buildathon.',
    stack: ['React', 'Perplexity API'],
    proof: 'Won the Generator Buildathon',
    links: [{ kind: 'live', url: 'https://we1chj.github.io/FactualityPage' }],
  },
  {
    id: 'rehab-ar', title: 'Rehab AR app', rarity: 'RARE',
    blurb: 'iOS game that turns physical therapy into a game for seniors. 95% liked it.',
    stack: ['Swift', 'LiveKit', 'Vision'],
    proof: '95% positive feedback at a senior centre',
  },
  {
    id: 'radar', title: 'Radar back-projection', rarity: 'RARE',
    blurb: '12× faster SAR imaging with Pythran and C++.',
    stack: ['C++', 'NumPy'],
    proof: '12× faster SAR imaging',
  },
  {
    id: 'net-ui', title: 'Network manager UI', rarity: 'RARE',
    blurb: 'Kotlin + Compose dashboard built for millions of users.',
    stack: ['Kotlin', 'Flask'],
    proof: 'Built for millions of users',
  },
  {
    id: 'this-site', title: 'This website, v7', rarity: 'RARE',
    blurb: 'A 3D gacha machine with a physics engine, because a PDF was not enough.',
    stack: ['React Three Fiber', 'Rapier'],
  },
  {
    id: 'magnifier', title: 'Resume magnifier', rarity: 'COMMON',
    blurb: 'A WebGL glass lens over a PDF. The old version of this site.',
    stack: ['three.js'],
  },
];
