/**
 * Static community snapshot.
 * Numbers mirror the live Kracked Devs showcase so the page reads as a real mirror
 * of the community rather than lorem ipsum.
 */

export interface Member {
  handle: string;
  name: string;
  role: string;
  stack: string[];
  pwr: number;
  shipped: number;
  status: 'online' | 'building' | 'away';
  bio: string;
  links: { label: string; href: string }[];
}

export interface Bounty {
  id: string;
  title: string;
  reward: string;
  deadline: string;
  slots: number;
  tags: string[];
  state: 'open' | 'closing' | 'judging';
  brief: string;
}

export interface Project {
  slug: string;
  title: string;
  author: string;
  oneLiner: string;
  pwr: number;
  votes: number;
  stack: string[];
  tags: string[];
  shipped: number;
  hue: number; // used to tint the node in the graph layer
}

export const COMMUNITY = {
  name: 'Kracked Devs',
  builders: 3408,
  shipped: 546,
  guilds: 24,
  projects: 565,
  tagline: 'a community of cracked developers who want to level up together',
  site: 'https://krackeddevs.com',
  showcase: 'https://krackeddevs.com/showcase',
};

export const MEMBERS: Member[] = [
  {
    handle: 'blackpanthera23',
    name: 'Akmal',
    role: 'Operator / builder',
    stack: ['Vite', 'Cloudflare', 'Python'],
    pwr: 70,
    shipped: 1,
    status: 'building',
    bio: 'Runs a one-person digital marketing practice. Ships static sites with hand-written CSS and pipeline gates that refuse to deploy broken builds.',
    links: [
      { label: 'showcase', href: 'https://krackeddevs.com/showcase' },
      { label: 'jejak-edu', href: 'https://github.com/blackpanthera23/jejak-edu' },
    ],
  },
  {
    handle: 'ghulamrusli',
    name: 'Ghulam',
    role: 'Product engineer',
    stack: ['React', 'TypeScript'],
    pwr: 90,
    shipped: 4,
    status: 'online',
    bio: 'Builds consumer tools with a taste for small surfaces. Prefers shipping one thing well over three things half-way.',
    links: [{ label: 'showcase', href: 'https://krackeddevs.com/showcase' }],
  },
  {
    handle: 'nabila.dev',
    name: 'Nabila',
    role: 'Frontend / motion',
    stack: ['Svelte', 'GSAP', 'WebGL'],
    pwr: 120,
    shipped: 6,
    status: 'online',
    bio: 'Animation-first frontend. Treats every transition as a claim about what the product does.',
    links: [{ label: 'showcase', href: 'https://krackeddevs.com/showcase' }],
  },
  {
    handle: 'zulkarnain',
    name: 'Zul',
    role: 'Infra / systems',
    stack: ['Go', 'Postgres', 'Docker'],
    pwr: 95,
    shipped: 3,
    status: 'building',
    bio: 'Backend and deployment. Believes an outage is a design review you did not schedule.',
    links: [{ label: 'showcase', href: 'https://krackeddevs.com/showcase' }],
  },
  {
    handle: 'minn.minn',
    name: 'Minn',
    role: 'Marketing / film',
    stack: ['After Effects', 'Figma'],
    pwr: 60,
    shipped: 2,
    status: 'away',
    bio: 'Screen-records localhost and makes it look intentional. Turns shipped work into reels without lying about what it is.',
    links: [{ label: 'showcase', href: 'https://krackeddevs.com/showcase' }],
  },
  {
    handle: 'arif.kernel',
    name: 'Arif',
    role: 'AI / tooling',
    stack: ['Python', 'Rust', 'CUDA'],
    pwr: 145,
    shipped: 7,
    status: 'online',
    bio: 'Builds agent tooling and evaluation harnesses. Ships a failing test before shipping a feature.',
    links: [{ label: 'showcase', href: 'https://krackeddevs.com/showcase' }],
  },
  {
    handle: 'farah.draws',
    name: 'Farah',
    role: 'Design / illustration',
    stack: ['Figma', 'Procreate'],
    pwr: 55,
    shipped: 1,
    status: 'building',
    bio: 'Interface design with an illustration habit. Designs the empty state before the happy path.',
    links: [{ label: 'showcase', href: 'https://krackeddevs.com/showcase' }],
  },
  {
    handle: 'hafiz.ops',
    name: 'Hafiz',
    role: 'DevOps',
    stack: ['Terraform', 'K8s'],
    pwr: 80,
    shipped: 3,
    status: 'away',
    bio: 'Keeps everyone else deployable. Measures success in failed deploys that never happened.',
    links: [{ label: 'showcase', href: 'https://krackeddevs.com/showcase' }],
  },
  {
    handle: 'syafiq.quant',
    name: 'Syafiq',
    role: 'Data / ML',
    stack: ['Python', 'DuckDB', 'Polars'],
    pwr: 130,
    shipped: 5,
    status: 'online',
    bio: 'Analytics engineer who treats a notebook as a draft and a pipeline as the artefact.',
    links: [{ label: 'showcase', href: 'https://krackeddevs.com/showcase' }],
  },
  {
    handle: 'aina.builds',
    name: 'Aina',
    role: 'Full-stack',
    stack: ['Next.js', 'Supabase'],
    pwr: 105,
    shipped: 4,
    status: 'online',
    bio: 'Ships small products end to end. Keeps the database schema and the pricing page in the same commit.',
    links: [{ label: 'showcase', href: 'https://krackeddevs.com/showcase' }],
  },
  {
    handle: 'haziq.wasm',
    name: 'Haziq',
    role: 'Systems / WASM',
    stack: ['Rust', 'WASM', 'Zig'],
    pwr: 150,
    shipped: 6,
    status: 'building',
    bio: 'Ports hot loops to WASM and writes the benchmark before the claim.',
    links: [{ label: 'showcase', href: 'https://krackeddevs.com/showcase' }],
  },
  {
    handle: 'lina.types',
    name: 'Lina',
    role: 'Tooling / DX',
    stack: ['TypeScript', 'Vite', 'esbuild'],
    pwr: 115,
    shipped: 8,
    status: 'online',
    bio: 'Build-tool obsess. Measures developer happiness in seconds-to-first-paint.',
    links: [{ label: 'showcase', href: 'https://krackeddevs.com/showcase' }],
  },
  {
    handle: 'ravi.ship',
    name: 'Ravi',
    role: 'Mobile',
    stack: ['Swift', 'Kotlin'],
    pwr: 100,
    shipped: 3,
    status: 'building',
    bio: 'Native mobile. Refuses to add a dependency that outweighs the feature it enables.',
    links: [{ label: 'showcase', href: 'https://krackeddevs.com/showcase' }],
  },
  {
    handle: 'mei.pixels',
    name: 'Mei',
    role: 'Design / systems',
    stack: ['Figma', 'Storybook'],
    pwr: 85,
    shipped: 5,
    status: 'online',
    bio: 'Design systems. Ships tokens and components together so the docs match the code.',
    links: [{ label: 'showcase', href: 'https://krackeddevs.com/showcase' }],
  },
  {
    handle: 'daniel.sec',
    name: 'Daniel',
    role: 'Security',
    stack: ['Go', 'eBPF'],
    pwr: 125,
    shipped: 2,
    status: 'away',
    bio: 'Runtime security. Reads the syscall trace, not the marketing page.',
    links: [{ label: 'showcase', href: 'https://krackeddevs.com/showcase' }],
  },
  {
    handle: 'yasmin.cloud',
    name: 'Yasmin',
    role: 'Cloud / edge',
    stack: ['Cloudflare', 'Terraform'],
    pwr: 110,
    shipped: 7,
    status: 'online',
    bio: 'Edge-first infrastructure. Caches before it scales.',
    links: [{ label: 'showcase', href: 'https://krackeddevs.com/showcase' }],
  },
  {
    handle: 'omar.pixels',
    name: 'Omar',
    role: 'Frontend',
    stack: ['Svelte', 'Tailwind'],
    pwr: 75,
    shipped: 2,
    status: 'building',
    bio: 'Component-focused frontend. Small bundles, no runtime CSS-in-JS.',
    links: [{ label: 'showcase', href: 'https://krackeddevs.com/showcase' }],
  },
  {
    handle: 'jia.tokens',
    name: 'Jia',
    role: 'Content / docs',
    stack: ['MDX', 'Astro'],
    pwr: 65,
    shipped: 4,
    status: 'online',
    bio: 'Technical writing as a product surface. Deletes a paragraph for every feature added.',
    links: [{ label: 'showcase', href: 'https://krackeddevs.com/showcase' }],
  },
  {
    handle: 'izzat.audio',
    name: 'Izzat',
    role: 'Creative / audio',
    stack: ['Web Audio', 'Rust'],
    pwr: 90,
    shipped: 3,
    status: 'away',
    bio: 'Audio in the browser. Thinks latency is a design constraint, not a bug to file.',
    links: [{ label: 'showcase', href: 'https://krackeddevs.com/showcase' }],
  },
  {
    handle: 'bea.test',
    name: 'Bea',
    role: 'QA / automation',
    stack: ['Playwright', 'Python'],
    pwr: 95,
    shipped: 6,
    status: 'online',
    bio: 'Writes the failing test first and keeps it. Automation that catches real regressions, not click-throughs.',
    links: [{ label: 'showcase', href: 'https://krackeddevs.com/showcase' }],
  },
  {
    handle: 'faris.ledger',
    name: 'Faris',
    role: 'Backend',
    stack: ['Elixir', 'Postgres'],
    pwr: 120,
    shipped: 4,
    status: 'building',
    bio: 'Systems of record. Believes the database is the API and migrations are the interface.',
    links: [{ label: 'showcase', href: 'https://krackeddevs.com/showcase' }],
  },
  {
    handle: 'nur.robotics',
    name: 'Nur',
    role: 'Embedded',
    stack: ['C++', 'Rust', 'MQTT'],
    pwr: 135,
    shipped: 5,
    status: 'online',
    bio: 'Embedded and robotics. Ships firmware that recovers on its own instead of needing a hands-on reset.',
    links: [{ label: 'showcase', href: 'https://krackeddevs.com/showcase' }],
  },
];

export const BOUNTIES: Bounty[] = [
  {
    id: 'KD-COMM-01',
    title: 'Reimagine the community landing page',
    reward: '3 × $150 AI tokens',
    deadline: '2026-10-18',
    slots: 3,
    tags: ['design', 'frontend', 'experimental'],
    state: 'closing',
    brief: 'Zero constraints. Any style, any format. This is a playground to flex, not a corporate redesign.',
  },
  {
    id: 'KD-COMM-02',
    title: 'Builder profile: richer presence',
    reward: '2 × $100 AI tokens',
    deadline: '2026-11-02',
    slots: 2,
    tags: ['frontend', 'api'],
    state: 'open',
    brief: 'Give a builder page enough signal that someone can decide to work with them in under a minute.',
  },
  {
    id: 'KD-TOOL-03',
    title: 'Showcase CLI',
    reward: '1 × $150 AI tokens',
    deadline: '2026-11-15',
    slots: 1,
    tags: ['cli', 'tooling'],
    state: 'open',
    brief: 'Submit and query projects from the terminal, without opening a browser.',
  },
  {
    id: 'KD-DATA-04',
    title: 'Community topology visualiser',
    reward: '2 × $75 AI tokens',
    deadline: '2026-10-30',
    slots: 2,
    tags: ['dataviz', 'webgl'],
    state: 'judging',
    brief: 'Show who builds with whom. Structure over decoration.',
  },
];

export const PROJECTS: Project[] = [
  {
    slug: 'jejak-edu',
    title: 'Jejak Edu',
    author: 'blackpanthera23',
    oneLiner: 'Malaysian education data portal — PISA, curriculum and 7,339 anonymous salary records.',
    pwr: 70,
    votes: 0,
    stack: ['Vite', 'Tailwind CSS', 'Alpine.js', 'Markdown', 'GitHub Pages'],
    tags: ['PROJECT', '2026', 'WEB', 'REPO'],
    shipped: 2026,
    hue: 150,
  },
  {
    slug: 'checklist-nikah',
    title: 'Checklist Nikah',
    author: 'ghulamrusli',
    oneLiner: 'Step into married life — a guided checklist from pre-marriage course to the ceremony.',
    pwr: 90,
    votes: 1,
    stack: ['React', 'TypeScript'],
    tags: ['PROJECT', '2026', 'WEB'],
    shipped: 2026,
    hue: 40,
  },
  {
    slug: 'onibi-rpg',
    title: 'Onibi RPG',
    author: 'arif.kernel',
    oneLiner: 'A ritual-flame RPG rendered entirely in layered canvas.',
    pwr: 40,
    votes: 0,
    stack: ['Canvas', 'TypeScript'],
    tags: ['PROJECT', '2026', 'GAME'],
    shipped: 2026,
    hue: 265,
  },
  {
    slug: 'kracked-os',
    title: 'Kracked OS',
    author: 'krackeddevs',
    oneLiner: 'Terminal-native operating surface for the community — bounty submission.',
    pwr: 160,
    votes: 12,
    stack: ['Node.js', 'Script', 'V0', 'Gemini Pro'],
    tags: ['BOUNTY', '2026', 'TOOL'],
    shipped: 2026,
    hue: 190,
  },
  {
    slug: 'ilmu-lms',
    title: 'ILMU — Learning LMS',
    author: 'nabila.dev',
    oneLiner: 'A learning management system frontend with 202k+ course views.',
    pwr: 110,
    votes: 5,
    stack: ['Next.js', 'React', 'Tailwind CSS'],
    tags: ['PROJECT', '2026', 'WEB'],
    shipped: 2026,
    hue: 320,
  },
  {
    slug: 'homelab-basic',
    title: 'Homelab Basic',
    author: 'hafiz.ops',
    oneLiner: 'A first homelab you can actually keep running for a year.',
    pwr: 55,
    votes: 2,
    stack: ['Docker', 'Terraform'],
    tags: ['PROJECT', '2026', 'INFRA'],
    shipped: 2026,
    hue: 20,
  },
];

/** Node position seed for the graph layer — deterministic so it looks the same every load. */
export const EDGES: [string, string][] = [
  // original core
  ['blackpanthera23', 'ghulamrusli'],
  ['blackpanthera23', 'nabila.dev'],
  ['nabila.dev', 'farah.draws'],
  ['nabila.dev', 'arif.kernel'],
  ['zulkarnain', 'hafiz.ops'],
  ['zulkarnain', 'arif.kernel'],
  ['ghulamrusli', 'minn.minn'],
  ['arif.kernel', 'hafiz.ops'],
  ['farah.draws', 'ghulamrusli'],
  // data & ml cluster
  ['syafiq.quant', 'arif.kernel'],
  ['syafiq.quant', 'faris.ledger'],
  ['syafiq.quant', 'bea.test'],
  ['syafiq.quant', 'daniel.sec'],
  // full-stack cluster
  ['aina.builds', 'lina.types'],
  ['aina.builds', 'ghulamrusli'],
  ['aina.builds', 'yasmin.cloud'],
  ['aina.builds', 'omar.pixels'],
  // systems & low-level cluster
  ['haziq.wasm', 'lina.types'],
  ['haziq.wasm', 'nur.robotics'],
  ['haziq.wasm', 'arif.kernel'],
  ['haziq.wasm', 'izzat.audio'],
  // platform / infra cluster
  ['hafiz.ops', 'yasmin.cloud'],
  ['yasmin.cloud', 'daniel.sec'],
  ['zulkarnain', 'faris.ledger'],
  ['faris.ledger', 'bea.test'],
  // design & content cluster
  ['mei.pixels', 'nabila.dev'],
  ['mei.pixels', 'omar.pixels'],
  ['mei.pixels', 'jia.tokens'],
  ['jia.tokens', 'minn.minn'],
  ['farah.draws', 'mei.pixels'],
  ['farah.draws', 'izzat.audio'],
  // mobile & embedded
  ['ravi.ship', 'nur.robotics'],
  ['ravi.ship', 'omar.pixels'],
  // cross-links that make the map read as one community, not islands
  ['blackpanthera23', 'jia.tokens'],
  ['blackpanthera23', 'aina.builds'],
  ['nur.robotics', 'haziq.wasm'],
  ['daniel.sec', 'zulkarnain'],
  ['bea.test', 'lina.types'],
  ['minn.minn', 'farah.draws'],
  ['izzat.audio', 'haziq.wasm'],
  ['ravi.ship', 'nabila.dev'],
  ['syafiq.quant', 'hafiz.ops'],
];