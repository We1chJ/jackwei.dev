// Work, school and contests, from the résumé. The vending machine sells these as cards (so each is
// also a Project: title, blurb, rarity and tags print on the card), and the Experience section
// below the arcade lists them in full.
import type { Project } from './projects';

export interface Experience extends Project {
  role: string;
  dates: string;
  bullets: string[];
  /** Listed under About instead of Experience. */
  about?: boolean;
}

export const EXPERIENCE: Experience[] = [
  {
    id: 'bloomberg', title: 'Bloomberg', role: 'Software Engineer Intern', dates: 'Jun – Jul 2026',
    blurb: 'Software Engineer Intern · Summer 2026', rarity: 'LEGENDARY', tags: ['React', 'Spring Boot', 'Grafana'],
    bullets: [
      'Built a workflow orchestrator (React front end, Java and Spring Boot back end, deployed with Maven, monitored in Grafana) that cut the team’s time on quality-control processes.',
      'Researched and presented secure integration with Airflow on the team’s platform, using SSL certificates and authentication.',
    ],
  },
  {
    id: 'bbn-2025', title: 'Raytheon BBN ’25', role: 'Software Engineer Research Intern', dates: 'May – Aug 2025',
    blurb: 'Software Engineer Research Intern · Summer 2025', rarity: 'RARE', tags: ['Python', 'MATLAB', 'Signal processing'],
    bullets: [
      'Refined a Python data handler to process track quality, position error covariance and confidence level in real time over a custom message protocol.',
      'Implemented system calibration in MATLAB, computing offsets in signal frequency, amplitude and TDOA.',
      'Presented the software to 50+ stakeholders for a $1.5M funding opportunity.',
    ],
  },
  {
    id: 'plai', title: 'Olin PLai Lab', role: 'Mobile App Developer & Researcher', dates: 'Jan 2025 – present',
    blurb: 'Mobile App Developer & Researcher · 2025 –', rarity: 'RARE', tags: ['Swift', 'LiveKit', 'Computer vision'],
    bullets: [
      'Designed and built an iOS app in Swift that turns rehabilitation exercises into a game for chair- or bed-bound seniors, using computer vision and AR glasses.',
      '95% positive feedback at a local senior centre, with a multimodal AI voice agent (LiveKit) guiding the interface and the movements.',
      'Showed it to 3,000+ attendees at the Stanford Engineering Centennial.',
    ],
  },
  {
    id: 'bbn-2024', title: 'Raytheon BBN ’24', role: 'Software Development Research Intern', dates: 'Jun – Aug 2024',
    blurb: 'Software Development Research Intern · Summer 2024', rarity: 'RARE', tags: ['Kotlin', 'Jetpack Compose', 'Flask'],
    bullets: [
      'Independently built a distributed network-management UI for millions of government users in Kotlin and Jetpack Compose, with a Python Flask back end.',
      'Cut memory use by 56% and lookup time for network pairs by 84% by reworking the data architecture and the OpenAPI-defined endpoints.',
      'Led 5+ UI/UX design proposals and ran 3 team review meetings.',
    ],
  },
  {
    id: 'olin', title: 'Olin College', role: 'Computer Science', dates: 'Class of 2028', about: true,
    blurb: 'Computer Science · GPA 3.92', rarity: 'COMMON', tags: ['GPA 3.92', 'Merit scholarship'],
    bullets: [
      'Four-year merit-based 50% tuition scholarship.',
      'Data Structures & Algorithms, Software Systems, Computer Architecture, Machine Learning.',
    ],
  },
  {
    id: 'contests', title: 'Competitions', role: 'Competitive programming', dates: '2022 – 2025', about: true,
    blurb: 'ICPC, USACO Gold, ACSL finalist, Kickstart top 2%', rarity: 'SHINY', tags: ['ICPC', 'USACO Gold', 'ACSL'],
    bullets: [
      'ICPC 2025: top 5 in the district.',
      'USACO Gold division (2023): top 500 pre-college students nationally.',
      'ACSL: two-time national finalist (2023).',
      'Google Kickstart 2022 Round C: top 2% globally.',
    ],
  },
];

export const SKILLS: { group: string; items: string[] }[] = [
  { group: 'Frontend', items: ['JavaScript', 'TypeScript', 'React', 'Next.js', 'Jotai', 'Kotlin Multiplatform', 'Jetpack Compose', 'three.js'] },
  { group: 'Backend', items: ['C/C++', 'Python', 'Java', 'Kotlin', 'Flask', 'Firebase', 'Supabase', 'Spring Boot', 'PostgreSQL', 'MongoDB'] },
  { group: 'Deployment', items: ['Git', 'GitHub CI/CD', 'Vercel', 'Cloudflare', 'Trigger', 'Maven', 'Gradle', 'Jenkins'] },
  { group: 'ML / AI', items: ['Multimodal AI', 'RAG', 'LangChain', 'CV', 'OCR', 'RL', 'LiveKit', 'Vapi', 'Cursor', 'Claude Code', 'Codex'] },
  { group: 'Other', items: ['AWS', 'Docker', 'Kubernetes', 'Airflow', 'MATLAB', 'Swift', 'Grafana', 'Bash', 'OpenAPI', 'Linux', 'Unity', 'ROS2'] },
];
