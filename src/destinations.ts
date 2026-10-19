import type { Destination } from './term/district-world';

// Public /home navigation, retrieved 2026-10-19. Source:
// https://krackeddevs.com/_next/static/immutable/chunks/3_y17lql39n4f.js
// Coming-soon entries intentionally omit the source navigation's placeholder href.
export const DESTINATIONS: Destination[] = [
  { id: 'square', district: 'community', title: 'KD Square', description: 'What members are building, asking and writing.', href: 'https://krackeddevs.com/community' },
  { id: 'events', district: 'community', title: 'Events & Hackathons', description: 'Classes, meetups and krackathons. Dates and sign-ups.', href: 'https://krackeddevs.com/events' },
  { id: 'members', district: 'community', title: 'Members', description: 'Who is building, and where. Leaderboard and map live here.', href: 'https://krackeddevs.com/members' },
  { id: 'showcase', district: 'community', title: 'Showcase', description: 'Projects members shipped. Find your next inspiration, or add yours on KD.', action: 'showcase' },
  { id: 'bounties', district: 'community', title: 'Bounties', description: 'Paid tasks from the community. Pick one, ship it, get XP on KD.', href: 'https://krackeddevs.com/code/bounty' },
  { id: 'raid', district: 'community', title: 'KD Raid', description: 'The weekly raid. Your fighter, your real KD numbers, the whole server live.', href: 'https://krackeddevs.com/raid' },
  { id: 'classes', district: 'school', title: 'AI Classes', description: 'Free Monday classes for beginners. Start with a problem, learn by building.', href: 'https://theaibuilder.school/ai-classes' },
  { id: 'sandbox', district: 'school', title: 'Builders Sandbox', description: 'The Builders Sandbox for founders, entrepreneurs and builders.', href: 'https://theaibuilder.school/kracked-labs' },
  { id: 'learning', district: 'school', title: 'Learning portal', description: 'Your chapters, seats and certificates. Requires KD sign-in for your learning account.', href: 'https://learn.theaibuilder.school' },
  { id: 'cave', district: 'school', title: 'The Cave', description: 'Demos, talks and showcases.', soon: true },
  { id: 'hermes', district: 'school', title: 'Hermes Malaysia', description: 'Tech for young Malaysians.', soon: true },
  { id: 'enroll', district: 'labs', title: 'Enroll Labs', description: 'The builder programme. Apply for a seat.', href: 'https://krackeddevs.com/labs/apply' },
  { id: 'my-lab', district: 'labs', title: 'My Lab', description: 'Your seat, your projects, your streak. Requires sign-in.', href: 'https://krackeddevs.com/dashboard/labs' },
  { id: 'jomqr', district: 'labs', title: 'JomQR', description: 'One card for all your links.', href: 'https://jomqr.my' },
  { id: 'kuntum', district: 'labs', title: 'Kuntum & Embun', description: 'Hiring, with an AI agent on both sides.', href: 'https://kuntum.app' },
];
