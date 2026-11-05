// Checks the machines' data (src/data) for what the types cannot: lengths that fit the card, unique
// ids, links that parse, images that exist. Run with `npm run check`; `npm run build` runs it first, so
// a bad entry stops the deploy instead of printing off the edge of a card.
import { existsSync } from 'node:fs';
import { SOFTWARE } from '../src/data/software.ts';

const SLOTS = 16;                                   // the vending machine: rows A–D, four coils each
const problems: string[] = [];
const fail = (where: string, what: string) => problems.push(`${where}: ${what}`);

function text(where: string, field: string, value: string | undefined, max: number) {
  if (value === undefined) return;
  if (!value.trim()) fail(where, `${field} is empty`);
  else if (value !== value.trim()) fail(where, `${field} has spaces at an end`);
  if (value.length > max) fail(where, `${field} is ${value.length} characters, ${max} at most: "${value}"`);
}

const ids = new Set<string>();
if (SOFTWARE.length > SLOTS) fail('software', `${SOFTWARE.length} projects, but the vending machine has ${SLOTS} slots`);
SOFTWARE.forEach((p, n) => {
  const where = `software[${n}] ${p.id}`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) fail(where, 'id must be lowercase letters and digits, with dashes between words');
  if (ids.has(p.id)) fail(where, 'id is used twice');
  ids.add(p.id);
  text(where, 'title', p.title, 28);
  text(where, 'blurb', p.blurb, 120);
  text(where, 'proof', p.proof, 60);
  text(where, 'role', p.role, 40);
  if (p.stack.length < 1 || p.stack.length > 6) fail(where, `stack has ${p.stack.length} entries, 1 to 6 allowed`);
  p.stack.forEach((t, k) => text(where, `stack[${k}]`, t, 22));
  if (new Set(p.stack).size !== p.stack.length) fail(where, 'stack lists a tool twice');
  if (p.year !== undefined && (!Number.isInteger(p.year) || p.year < 2015 || p.year > new Date().getFullYear() + 1)) fail(where, `year ${p.year} is not a plausible year`);
  p.links?.forEach((l, k) => { try { new URL(l.url); } catch { fail(where, `links[${k}] is not a URL: ${l.url}`); } });
  if (p.cover !== undefined) {
    if (!/\.(png|jpe?g|webp|avif)$/i.test(p.cover)) fail(where, `cover should be a png, jpg, webp or avif: ${p.cover}`);
    const file = `public/software/${p.id}/${p.cover}`;
    if (!existsSync(file)) fail(where, `cover not found: ${file}`);
  }
});

if (problems.length) {
  console.error(`src/data has ${problems.length} problem${problems.length > 1 ? 's' : ''}:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`src/data: ${SOFTWARE.length} software projects, all good.`);
