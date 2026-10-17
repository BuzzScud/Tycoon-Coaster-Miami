// Guest names, RCT style: a first name and an initial ("Maria T."). The id → name shuffle is RCT2's, as ported by
// OpenRCT2 (GetRealNameStringIDFromPeepID, GPL-3.0), so neighbouring guests get unrelated names. The name lists are
// this game's own.
const GIVEN = ('Aaron Abby Adam Adrian Aisha Alan Albert Alex Alice Alicia Amir Amy Ana Andre Andrea Andy Angela Anna Anton Arjun ' +
  'Ava Ben Bella Beth Bill Blake Bob Brad Brenda Brian Bruno Caleb Carla Carlos Carmen Carol Chen Chloe Chris Clara Colin Craig ' +
  'Dan Dana Daniel Dave Dee Derek Diana Diego Dina Dmitri Dora Duncan Dylan Ed Eddie Eli Elena Ella Ellen Emma Eric Erin Ethan ' +
  'Eva Faith Farah Felix Fiona Frank Fred Gabe Gary Gemma Gina Grace Greg Gus Hana Hank Hannah Harry Hassan Heidi Helen Henry ' +
  'Holly Hugo Ian Ida Igor Imran Ines Iris Isaac Ivan Jack Jade Jake James Jamal Jan Jane Jason Jay Jean Jen Jill Jim Joan Joe ' +
  'Joel John Jon Jorge Jose Josh Joy Juan Judy Julia June Kai Karen Kate Keith Ken Kevin Kim Kira Kyle Lara Laura Lea Lee Leo ' +
  'Liam Lily Lina Lisa Liz Logan Lola Lou Lucy Luis Luke Lydia Mai Mara Marco Maria Mark Marta Matt Max Maya Meg Mia Mike Mila ' +
  'Milo Mina Molly Nadia Nate Neil Nell Nick Nina Noah Nora Olga Oli Omar Oscar Owen Paul Paula Pedro Penny Pete Phil Pia Quinn ' +
  'Rachel Raj Ralph Ray Rita Rob Robin Rosa Rose Ross Roy Ruby Russ Ruth Ryan Sam Sara Sean Selma Seth Shaun Simon Sofia Sonia ' +
  'Stan Steve Sue Sunil Tara Ted Tess Theo Tim Tina Toby Tom Tony Uma Val Vera Vic Vince Wade Walt Wanda Wes Will Xena Yara ' +
  'Yuki Yusuf Zach Zara Zoe').split(' ');
const INITIALS = 'ABCDEFGHJKLMNOPRSTVWY';

/** The RCT2 bit shuffle of a guest id: 14 bits of (id + 0xF0B) in a fixed new order. */
function shuffle(id: number): number {
  const ax = (id + 0xf0b) & 0xffff; let dx = 0; const order = [4, 9, 3, 7, 5, 8, 2, 1, 6, 0, 12, 11, 13, 10];
  for (let i = 0; i < order.length; i++) dx |= ((ax >> order[i]) & 1) << i;
  return dx;
}
/** A guest's real name from their id, always the same for the same id. */
export function realName(id: number): string {
  const n = shuffle(id); return `${GIVEN[n % GIVEN.length]} ${INITIALS[((n >> 3) ^ (n * 5)) % INITIALS.length]}.`;   // the initial mixes the bits again: neighbours differ
}
/** The name shown for a guest: their real name, or "Guest 123" when real names are off (Options). */
export const guestName = (id: number, real = true) => real ? realName(id) : `Guest ${id}`;
/** Options → Guest names: rename every guest (a guest an event named, like a VIP, keeps their name). */
export function setGuestNames(g: { guestNumbers?: boolean; guests: { id: number; name: string }[] }, real: boolean) {
  g.guestNumbers = !real;
  for (const gu of g.guests) if (gu.name === realName(gu.id) || gu.name === `Guest ${gu.id}`) gu.name = guestName(gu.id, real);
}
