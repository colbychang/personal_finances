type SmokeTarget = {
  path: string;
  expectStatus?: number;
  maxMs?: number;
  mustContain?: string;
};

const baseUrl = (process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

const targets: SmokeTarget[] = [
  { path: "/api/health", expectStatus: 200, maxMs: 5_000, mustContain: "\"ok\":true" },
  { path: "/sign-in", expectStatus: 200, maxMs: 5_000 },
  { path: "/privacy", expectStatus: 200, maxMs: 5_000 },
  { path: "/data-policy", expectStatus: 200, maxMs: 5_000 },
  { path: "/glacier", expectStatus: 200, maxMs: 5_000 },
];

async function checkTarget(target: SmokeTarget) {
  const url = `${baseUrl}${target.path}`;
  const startedAt = Date.now();
  const response = await fetch(url, {
    redirect: "manual",
    headers: {
      "User-Agent": "GlacierSmokeTest/1.0",
    },
  });
  const durationMs = Date.now() - startedAt;
  const body = await response.text();

  const expectedStatus = target.expectStatus ?? 200;
  if (response.status !== expectedStatus) {
    throw new Error(`${target.path} returned ${response.status}, expected ${expectedStatus}`);
  }

  if (target.maxMs && durationMs > target.maxMs) {
    throw new Error(`${target.path} took ${durationMs}ms, expected <= ${target.maxMs}ms`);
  }

  if (target.mustContain && !body.includes(target.mustContain)) {
    throw new Error(`${target.path} response did not include ${target.mustContain}`);
  }

  return {
    path: target.path,
    status: response.status,
    durationMs,
  };
}

async function main() {
  const results = [];

  for (const target of targets) {
    results.push(await checkTarget(target));
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        checkedAt: new Date().toISOString(),
        results,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        baseUrl,
        checkedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
