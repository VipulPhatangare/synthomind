/**
 * Small seeded PRNG (mulberry32) + distribution helpers, so the whole
 * generator is reproducible run to run — Node has no built-in seeded RNG
 * with normal-distribution sampling, unlike numpy's default_rng.
 */
export class Rng {
  constructor(seed) {
    this.state = seed >>> 0;
  }

  // uniform [0, 1)
  random() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  uniform(min = 0, max = 1) {
    return min + this.random() * (max - min);
  }

  // integer in [min, max) — max exclusive, matching numpy's rng.integers
  integers(min, max) {
    return Math.floor(this.uniform(min, max));
  }

  // standard normal via Box-Muller, then scaled
  normal(mean = 0, sd = 1) {
    let u = 0, v = 0;
    while (u === 0) u = this.random();
    while (v === 0) v = this.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + z * sd;
  }

  choice(arr) {
    return arr[this.integers(0, arr.length)];
  }

  // weighted choice; weights need not sum to 1
  weightedChoice(arr, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.random() * total;
    for (let i = 0; i < arr.length; i++) {
      r -= weights[i];
      if (r <= 0) return arr[i];
    }
    return arr[arr.length - 1];
  }

  // sample k distinct items without replacement
  sample(arr, k) {
    const pool = [...arr];
    const out = [];
    for (let i = 0; i < k && pool.length; i++) {
      const idx = this.integers(0, pool.length);
      out.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return out;
  }

  clip(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }
}
