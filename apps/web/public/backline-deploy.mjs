// Node.js 20+. Run after a successful deployment. No packages required.
import { createHmac } from "node:crypto";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in the deployment job.`);
  return value;
}

async function main() {
  const endpoint = new URL(required("BACKLINE_HOOK_URL"));
  if ((endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1"].includes(endpoint.hostname))) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !/^\/api\/v1\/deploy-hooks\/[a-f0-9]{24}\/[a-f0-9]{24}$/.test(endpoint.pathname)) {
    throw new Error("Use the hook URL from Backline Deploy sync.");
  }
  const secret = required("BACKLINE_DEPLOY_SECRET");
  const deployedAt = required("BACKLINE_DEPLOYED_AT");
  if (!Number.isFinite(Date.parse(deployedAt))) throw new Error("Use an ISO deployment timestamp for BACKLINE_DEPLOYED_AT.");
  const environment = required("BACKLINE_ENVIRONMENT");
  if (!["live", "staging"].includes(environment)) throw new Error("BACKLINE_ENVIRONMENT must be live or staging.");
  // Build the bytes once. Retries refresh only the signature timestamp. Keep ID,
  // deployedAt, URL and commit reference stable when rerunning this job manually.
  const raw = JSON.stringify({
    delivery_id: required("BACKLINE_DELIVERY_ID"),
    url: required("BACKLINE_PROJECT_URL"),
    environment,
    deployed_at: deployedAt,
    ...(process.env.BACKLINE_COMMIT_REF ? { commit_ref: process.env.BACKLINE_COMMIT_REF } : {}),
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
    try {
      const response = await fetch(endpoint, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
        headers: { "Content-Type": "application/json", "X-Backline-Timestamp": timestamp, "X-Backline-Signature": signature },
        body: raw,
      });
      if (response.ok) {
        // Do not print provider response bodies or secrets in public CI logs.
        console.log("Backline accepted the deploy notification. Open the project's starting page in member review to capture it.");
        return;
      }
      if (response.status < 500 && response.status !== 429) {
        throw Object.assign(new Error(`Backline rejected this notification (HTTP ${response.status}). Check settings and delivery history.`), { permanent: true });
      }
    } catch (error) {
      if (error?.permanent) throw error;
    }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 3000));
  }
  throw new Error("Delivery was not confirmed. Check Backline history; retry with the original delivery ID and payload values.");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Could not notify Backline.");
  process.exitCode = 1;
});
