import dotenv from "dotenv";
import { spawn, execSync, ChildProcess } from "child_process";
import http from "http";
import path from "path";

dotenv.config();

type JsonResponse = {
  statusCode: number;
  body: unknown;
};

type StartedService = {
  process: ChildProcess;
  logs: string[];
  stop: () => Promise<void>;
};

const keydbUrl = process.env.KEYDB_URL ?? "redis://127.0.0.1:6379";
const projectRoot = path.resolve(__dirname, "..", "..");
const brokerContainerName = "rtv-mqtt-replay-health-broker";
const brokerPort = 18883;

function assertOrThrow(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonSafe(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function requestJson(port: number, routePath: string): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: routePath,
        method: "GET",
        timeout: 3000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            statusCode: res.statusCode ?? 0,
            body: parseJsonSafe(text),
          });
        });
      },
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("HTTP request timeout"));
    });
    req.end();
  });
}

async function waitForHealthServer(port: number, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  let lastError = "unknown";

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await requestJson(port, "/health");
      if (response.statusCode === 200) {
        return;
      }
      lastError = `unexpected status ${response.statusCode}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(250);
  }

  throw new Error(`Health server did not become ready: ${lastError}`);
}

async function waitForReadyStatus(
  port: number,
  expectedStatusCode: number,
  timeoutMs: number,
): Promise<JsonResponse> {
  const startedAt = Date.now();
  let lastResponse: JsonResponse | null = null;
  let lastError = "unknown";

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await requestJson(port, "/ready");
      lastResponse = response;
      if (response.statusCode === expectedStatusCode) {
        return response;
      }
      lastError = `status ${response.statusCode}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(300);
  }

  throw new Error(
    `Timed out waiting for /ready=${expectedStatusCode}. last=${lastError} body=${JSON.stringify(lastResponse?.body ?? null)}`,
  );
}

function startService(label: string, overrides: Record<string, string>): StartedService {
  const logs: string[] = [];
  const child = spawn(
    process.execPath,
    ["-r", "ts-node/register", "src/index.ts"],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        KEYDB_URL: keydbUrl,
        MQTT_HEALTH_HOST: "127.0.0.1",
        MQTT_RECONNECT_PERIOD_MS: "500",
        ...overrides,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  function pushLog(line: string): void {
    const clean = line.trim();
    if (!clean) {
      return;
    }
    logs.push(clean);
    if (logs.length > 400) {
      logs.shift();
    }
  }

  child.stdout.on("data", (chunk) => {
    pushLog(`[${label}] ${Buffer.from(chunk).toString("utf8")}`);
  });
  child.stderr.on("data", (chunk) => {
    pushLog(`[${label}] ${Buffer.from(chunk).toString("utf8")}`);
  });

  async function stop(): Promise<void> {
    if (child.killed || child.exitCode !== null) {
      return;
    }

    child.kill("SIGINT");

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
      }, 5000);

      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  return {
    process: child,
    logs,
    stop,
  };
}

function runCommand(command: string): string {
  return execSync(command, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  }).trim();
}

function startHealthyBroker(): void {
  try {
    runCommand(`docker rm -f ${brokerContainerName}`);
  } catch {
    // ignore if not found
  }

  runCommand(
    `docker run -d --name ${brokerContainerName} -p ${brokerPort}:1883 eclipse-mosquitto:2`,
  );
}

function stopHealthyBroker(): void {
  try {
    runCommand(`docker rm -f ${brokerContainerName}`);
  } catch {
    // no-op
  }
}

async function runDegradedScenario(): Promise<void> {
  const healthPort = 18092;
  const service = startService("degraded", {
    MQTT_CLIENT_ID: `replay-health-degraded-${Date.now()}`,
    MQTT_BROKER_URL: "mqtt://127.0.0.1:18884",
    MQTT_HEALTH_PORT: String(healthPort),
  });

  try {
    await waitForHealthServer(healthPort, 15000);

    const health = await requestJson(healthPort, "/health");
    const ready = await waitForReadyStatus(healthPort, 503, 10000);

    const healthBody = asRecord(health.body);
    const healthMqtt = asRecord(healthBody.mqtt);
    const healthKeydb = asRecord(healthBody.keydb);
    const readyBody = asRecord(ready.body);

    assertOrThrow(health.statusCode === 200, "Degraded /health should return 200");
    assertOrThrow(
      healthMqtt.connected === false,
      "Degraded /health should report mqtt.connected=false",
    );
    assertOrThrow(
      healthMqtt.subscribed === false,
      "Degraded /health should report mqtt.subscribed=false",
    );
    assertOrThrow(
      healthKeydb.ok === true,
      "Degraded /health should report keydb.ok=true",
    );
    assertOrThrow(
      readyBody.status === "not_ready",
      "Degraded /ready should return status=not_ready",
    );

    console.log("[replay:health] degraded scenario PASS");
  } catch (error) {
    console.error("[replay:health] degraded scenario logs:");
    console.error(service.logs.join("\n"));
    throw error;
  } finally {
    await service.stop();
  }
}

async function runHealthyScenario(): Promise<void> {
  const healthPort = 18093;
  startHealthyBroker();

  const service = startService("healthy", {
    MQTT_CLIENT_ID: `replay-health-healthy-${Date.now()}`,
    MQTT_BROKER_URL: `mqtt://127.0.0.1:${brokerPort}`,
    MQTT_HEALTH_PORT: String(healthPort),
  });

  try {
    await waitForHealthServer(healthPort, 15000);
    const ready = await waitForReadyStatus(healthPort, 200, 20000);
    const health = await requestJson(healthPort, "/health");

    const readyBody = asRecord(ready.body);
    const healthBody = asRecord(health.body);
    const healthMqtt = asRecord(healthBody.mqtt);
    const healthKeydb = asRecord(healthBody.keydb);

    assertOrThrow(health.statusCode === 200, "Healthy /health should return 200");
    assertOrThrow(
      healthMqtt.connected === true,
      "Healthy /health should report mqtt.connected=true",
    );
    assertOrThrow(
      healthMqtt.subscribed === true,
      "Healthy /health should report mqtt.subscribed=true",
    );
    assertOrThrow(
      healthKeydb.ok === true,
      "Healthy /health should report keydb.ok=true",
    );
    assertOrThrow(
      readyBody.status === "ready",
      "Healthy /ready should return status=ready",
    );

    console.log("[replay:health] healthy scenario PASS");
  } catch (error) {
    console.error("[replay:health] healthy scenario logs:");
    console.error(service.logs.join("\n"));
    throw error;
  } finally {
    await service.stop();
    stopHealthyBroker();
  }
}

async function main(): Promise<void> {
  assertOrThrow(Boolean(runCommand("docker --version")), "Docker is required");

  await runDegradedScenario();
  await runHealthyScenario();

  console.log("[replay:health] PASS: health/readiness scenarios validated");
}

main().catch((error) => {
  stopHealthyBroker();
  console.error("[replay:health] FAIL:", error);
  process.exitCode = 1;
});
