// In-memory usage budgets: a cost backstop, not a billing-grade quota
// system. Buckets live in one process and reset on restart; the provider-side
// quota is the real ceiling.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const PRUNE_INTERVAL_MS = 60_000;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function expandIpv6(address) {
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const hextets = [...head, ...Array(missing).fill('0'), ...tail];
  if (!hextets.every((h) => /^[0-9a-f]{1,4}$/i.test(h))) return null;
  return hextets.map((h) => Number.parseInt(h, 16).toString(16));
}

// One IPv6 subscriber usually holds a whole /64, so keying on the full
// address would let a single visitor rotate through endless fresh budgets.
function normalizeClientAddress(raw) {
  let address = String(raw).trim();
  if (address.startsWith('[') && address.includes(']')) {
    address = address.slice(1, address.indexOf(']'));
  }
  if (!address.includes(':')) return address;
  address = address.split('%')[0];
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped) return mapped[1];
  const hextets = expandIpv6(address);
  return hextets ? `${hextets.slice(0, 4).join(':')}::/64` : address;
}

function clientUsageKey(req) {
  const cfIp = req.get('cf-connecting-ip');
  if (cfIp) return `cf:${normalizeClientAddress(cfIp)}`;
  const forwarded = (req.get('x-forwarded-for') || '').split(',')[0].trim();
  if (forwarded) return `xff:${normalizeClientAddress(forwarded)}`;
  const realIp = req.get('x-real-ip');
  if (realIp) return `real:${normalizeClientAddress(realIp)}`;
  const socketIp = req.ip || req.socket?.remoteAddress;
  return `socket:${socketIp ? normalizeClientAddress(socketIp) : 'unknown'}`;
}

function tokenCountFromUsage(tokens) {
  if (!tokens || typeof tokens !== 'object') return 0;
  if (Number.isFinite(tokens.total) && tokens.total > 0) return Math.ceil(tokens.total);
  return ['in', 'out', 'thoughts'].reduce((sum, key) => {
    const value = tokens[key];
    return Number.isFinite(value) && value > 0 ? sum + Math.ceil(value) : sum;
  }, 0);
}

function createUsageLimiter(limits, { now = Date.now } = {}) {
  const usageByClient = new Map();
  const globalBucket = { dayResetAt: 0, dayTokens: 0 };
  let lastUsagePruneAt = 0;

  function pruneUsageBuckets(at) {
    if (at - lastUsagePruneAt < PRUNE_INTERVAL_MS) return;
    lastUsagePruneAt = at;
    for (const [key, bucket] of usageByClient.entries()) {
      if (bucket.dayResetAt <= at) usageByClient.delete(key);
    }
  }

  function usageBucketFor(key, at) {
    let bucket = usageByClient.get(key);
    if (!bucket || bucket.dayResetAt <= at) {
      bucket = {
        hourResetAt: at + HOUR_MS,
        dayResetAt: at + DAY_MS,
        hourRequests: 0,
        dayRequests: 0,
        hourTokens: 0,
        dayTokens: 0,
      };
      usageByClient.set(key, bucket);
    } else if (bucket.hourResetAt <= at) {
      bucket.hourResetAt = at + HOUR_MS;
      bucket.hourRequests = 0;
      bucket.hourTokens = 0;
    }
    return bucket;
  }

  function currentGlobalBucket(at) {
    if (globalBucket.dayResetAt <= at) {
      globalBucket.dayResetAt = at + DAY_MS;
      globalBucket.dayTokens = 0;
    }
    return globalBucket;
  }

  function reserveClientBudget(req, estimatedTokens) {
    const at = now();
    pruneUsageBuckets(at);
    const key = clientUsageKey(req);
    const bucket = usageBucketFor(key, at);
    const global = currentGlobalBucket(at);
    const over = [];
    const publicOver = [];
    const add = (detail, publicDetail = detail) => {
      over.push(detail);
      publicOver.push(publicDetail);
    };
    if (bucket.hourRequests + 1 > limits.requestsPerHour) {
      add(`requestsPerHour ${bucket.hourRequests + 1}/${limits.requestsPerHour}`);
    }
    if (bucket.hourTokens + estimatedTokens > limits.tokensPerHour) {
      add(`tokensPerHour ${bucket.hourTokens + estimatedTokens}/${limits.tokensPerHour}`);
    }
    if (bucket.dayTokens + estimatedTokens > limits.tokensPerDay) {
      add(`tokensPerDay ${bucket.dayTokens + estimatedTokens}/${limits.tokensPerDay}`);
    }
    if (global.dayTokens + estimatedTokens > limits.globalTokensPerDay) {
      // The figures stay out of the response: they tell anyone how much of
      // the day's spend is left.
      add(`globalTokensPerDay ${global.dayTokens + estimatedTokens}/${limits.globalTokensPerDay}`, 'globalTokensPerDay');
    }
    if (over.length > 0) {
      const err = new Error(`usage budget exceeded: ${over.join('; ')}`);
      err.status = 429;
      err.publicBody = {
        error: 'Usage budget exceeded',
        details: publicOver,
        limits: {
          requestsPerHour: limits.requestsPerHour,
          tokensPerHour: limits.tokensPerHour,
          tokensPerDay: limits.tokensPerDay,
        },
      };
      throw err;
    }
    bucket.hourRequests += 1;
    bucket.dayRequests += 1;
    bucket.hourTokens += estimatedTokens;
    bucket.dayTokens += estimatedTokens;
    global.dayTokens += estimatedTokens;
    return { key, estimatedTokens };
  }

  function adjustClientBudget(reservation, actualTokens) {
    if (!reservation || !Number.isFinite(actualTokens) || actualTokens <= 0) return;
    const delta = actualTokens - reservation.estimatedTokens;
    const global = currentGlobalBucket(now());
    global.dayTokens = Math.max(0, global.dayTokens + delta);
    const bucket = usageByClient.get(reservation.key);
    if (!bucket) return;
    bucket.hourTokens = Math.max(0, bucket.hourTokens + delta);
    bucket.dayTokens = Math.max(0, bucket.dayTokens + delta);
  }

  // Calls made without a client reservation (the Estonian editor pass) count
  // against the global day only, until data shows how to charge them per client.
  function adjustGlobalBudget(actualTokens) {
    if (!Number.isFinite(actualTokens) || actualTokens <= 0) return;
    currentGlobalBucket(now()).dayTokens += Math.ceil(actualTokens);
  }

  function hasGlobalRoom(estimatedTokens = 1) {
    return currentGlobalBucket(now()).dayTokens + estimatedTokens <= limits.globalTokensPerDay;
  }

  function clientUsage(key) {
    const bucket = usageByClient.get(key);
    return bucket ? { ...bucket } : null;
  }

  function globalUsage() {
    return { ...currentGlobalBucket(now()) };
  }

  return {
    limits,
    reserveClientBudget,
    adjustClientBudget,
    adjustGlobalBudget,
    hasGlobalRoom,
    clientUsage,
    globalUsage,
  };
}

module.exports = {
  HOUR_MS,
  DAY_MS,
  parsePositiveInt,
  clientUsageKey,
  tokenCountFromUsage,
  createUsageLimiter,
};
