export const FACE_NAMES = Object.freeze(["", "Nine", "Ten", "Jack", "Queen", "King", "Ace"]);
export const FACE_SHORT = Object.freeze(["", "9", "10", "J", "Q", "K", "A"]);

export const HAND_RANKS = Object.freeze([
  "Bust", "One Pair", "Two Pair", "Three of a Kind", "Low Straight",
  "High Straight", "Full House", "Four of a Kind", "Five of a Kind"
]);

export function evaluateHand(values) {
  const dice = values.map(Number).sort((a, b) => b - a);
  const groups = [...new Set(dice)].map(value => ({ value, count: dice.filter(die => die === value).length }))
    .sort((a, b) => b.count - a.count || b.value - a.value);
  const counts = groups.map(group => group.count);
  const unique = [...new Set(dice)];
  const highStraight = unique.length === 5 && unique[0] === 6 && unique[4] === 2;
  const lowStraight = unique.length === 5 && unique[0] === 5 && unique[4] === 1;
  let rank, name, vector;
  if (counts[0] === 5) { rank = 8; name = "Five of a Kind"; vector = [groups[0].value]; }
  else if (counts[0] === 4) { rank = 7; name = "Four of a Kind"; vector = [groups[0].value, groups[1].value]; }
  else if (counts[0] === 3 && counts[1] === 2) { rank = 6; name = "Full House"; vector = [groups[0].value, groups[1].value]; }
  else if (highStraight) { rank = 5; name = "High Straight"; vector = [6]; }
  else if (lowStraight) { rank = 4; name = "Low Straight"; vector = [5]; }
  else if (counts[0] === 3) { rank = 3; name = "Three of a Kind"; vector = [groups[0].value, ...groups.slice(1).map(g => g.value).sort((a,b) => b-a)]; }
  else if (counts[0] === 2 && counts[1] === 2) { const pairs = groups.filter(g => g.count === 2).map(g => g.value).sort((a,b) => b-a); rank = 2; name = "Two Pair"; vector = [...pairs, groups.find(g => g.count === 1).value]; }
  else if (counts[0] === 2) { rank = 1; name = "One Pair"; vector = [groups[0].value, ...groups.slice(1).map(g => g.value).sort((a,b) => b-a)]; }
  else { rank = 0; name = "Bust"; vector = dice; }
  return { name, rank, vector, values: dice, label: describeActual(name, vector) };
}

export function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const length = Math.max(a.vector.length, b.vector.length);
  for (let i = 0; i < length; i++) if ((a.vector[i] || 0) !== (b.vector[i] || 0)) return (a.vector[i] || 0) - (b.vector[i] || 0);
  return 0;
}

export function claims() {
  const result = [];
  for (let face = 1; face <= 6; face++) result.push(claim("bust", 0, face, 0, `${FACE_NAMES[face]} high`));
  for (let face = 1; face <= 6; face++) result.push(claim("pair", 1, face, 0, `Pair of ${plural(face)}`));
  for (let high = 2; high <= 6; high++) for (let low = 1; low < high; low++) result.push(claim("two-pair", 2, high, low, `Two Pair · ${plural(high)} and ${plural(low)}`));
  for (let face = 1; face <= 6; face++) result.push(claim("trips", 3, face, 0, `Three ${plural(face)}`));
  result.push(claim("low-straight", 4, 5, 0, "Low Straight · 9 to King"));
  result.push(claim("high-straight", 5, 6, 0, "High Straight · 10 to Ace"));
  for (let trip = 1; trip <= 6; trip++) for (let pair = 1; pair <= 6; pair++) if (pair !== trip) result.push(claim("full-house", 6, trip, pair, `Full House · ${plural(trip)} over ${plural(pair)}`));
  for (let face = 1; face <= 6; face++) result.push(claim("quads", 7, face, 0, `Four ${plural(face)}`));
  for (let face = 1; face <= 6; face++) result.push(claim("five", 8, face, 0, `Five ${plural(face)}`));
  return result.sort(compareClaims);
}

export const ALL_CLAIMS = Object.freeze(claims());

export function compareClaims(a, b) { return a.rank - b.rank || a.primary - b.primary || a.secondary - b.secondary; }
export function claimByKey(key) { return ALL_CLAIMS.find(item => item.key === key) || null; }

export function actualAsClaim(hand) {
  const primary = hand.vector[0] || 0;
  const secondary = (hand.name === "Full House" || hand.name === "Two Pair") ? (hand.vector[1] || 0) : 0;
  return { rank: hand.rank, primary, secondary };
}

export function claimIsTrue(hand, declared) { return compareClaims(actualAsClaim(hand), declared) >= 0; }
export function plural(face) { const name = FACE_NAMES[face]; return name === "Six" ? "Sixes" : name === "Ace" ? "Aces" : `${name}s`; }

function claim(kind, rank, primary, secondary, label) { return { kind, rank, primary, secondary, label, key: `${rank}-${primary}-${secondary}` }; }
function describeActual(name, vector) {
  if (name === "Five of a Kind") return `Five ${plural(vector[0])}`;
  if (name === "Four of a Kind") return `Four ${plural(vector[0])}`;
  if (name === "Full House") return `Full House · ${plural(vector[0])} over ${plural(vector[1])}`;
  if (name === "Three of a Kind") return `Three ${plural(vector[0])}`;
  if (name === "Two Pair") return `Two Pair · ${plural(vector[0])} and ${plural(vector[1])}`;
  if (name === "One Pair") return `Pair of ${plural(vector[0])}`;
  if (name === "High Straight") return "High Straight · 10 to Ace";
  if (name === "Low Straight") return "Low Straight · 9 to King";
  return `${FACE_NAMES[vector[0]]} high`;
}

