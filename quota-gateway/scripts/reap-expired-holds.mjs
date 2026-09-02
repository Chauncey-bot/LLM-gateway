import process from "node:process";
import { Pool } from "pg";

import { releaseExpiredQuotaHolds } from "../server.mjs";

const dbConfig = {
  host: process.env.QUOTA_DB_HOST || "sub2api-postgres",
  port: Number(process.env.QUOTA_DB_PORT || process.env.DB_PORT || 5432),
  database: process.env.QUOTA_DB_NAME || "zhisales_pay",
  user: process.env.QUOTA_DB_USER || "sub2api",
  password: process.env.QUOTA_DB_PASSWORD || "",
  ssl: process.env.QUOTA_DB_SSL === "true" ? true : false,
};

const requestedBatchSize = Number(process.env.QUOTA_GATEWAY_EXPIRED_HOLD_CLEANUP_BATCH_SIZE || 500);
const batchSize = Math.max(1, Math.min(5000, Number.isFinite(requestedBatchSize) ? requestedBatchSize : 500));
const requestedMaxCycles = Number(process.env.QUOTA_GATEWAY_EXPIRED_HOLD_REAPER_MAX_CYCLES || 200);
const maxCycles = Math.max(1, Number.isFinite(requestedMaxCycles) ? requestedMaxCycles : 200);

async function main() {
  const quotaDb = new Pool(dbConfig);
  let scannedUsers = 0;
  let releasedRequests = 0;
  let releasedReservedSum = 0;
  let cycle = 0;
  let exitCode = 0;

  try {
    while (cycle < maxCycles) {
      cycle += 1;
      const result = await releaseExpiredQuotaHolds(quotaDb, { batchSize });
      releasedRequests += result.releasedRequests;
      scannedUsers += result.scannedUsers;
      releasedReservedSum += Number(result.releasedReservedSum || 0);

      if (result.releasedRequests < batchSize) {
        break;
      }
    }

    console.log(
      `[quota-gateway] release expired holds done: releasedRequests=${releasedRequests}, scannedUsers=${scannedUsers}, ` +
      `releasedReservedUsd=${releasedReservedSum.toFixed(8)}, cycles=${cycle}`,
    );
  } catch (error) {
    console.error(`[quota-gateway] release expired holds failed: ${error?.message || error}`);
    exitCode = 1;
  } finally {
    await quotaDb.end().catch(() => {});
    process.exit(exitCode);
  }
}

main();
