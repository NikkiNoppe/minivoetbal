import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";

type SaveBody = {
  filename?: string;
  data?: unknown;
};

function safeBasename(filename: string): string | null {
  const base = path.basename(filename).trim();
  if (!base || base === "." || base === "..") return null;
  if (!/\.json$/i.test(base)) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(base)) return null;
  return base;
}

function readJsonBody(req: NodeJS.ReadableStream): Promise<SaveBody> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? (JSON.parse(raw) as SaveBody) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function attachArchiveMiddleware(
  middlewares: { use: (path: string, handler: (req: any, res: any, next: () => void) => void) => void },
  root: string,
) {
  const archiefDir = path.resolve(root, "archief");
  fs.mkdirSync(archiefDir, { recursive: true });

  middlewares.use("/__dev/save-season-archive", async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: false, error: "POST verplicht" }));
      return;
    }

    try {
      const body = await readJsonBody(req);
      const filename = safeBasename(String(body.filename ?? ""));
      if (!filename) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ success: false, error: "Ongeldige bestandsnaam" }));
        return;
      }
      if (body.data === undefined) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ success: false, error: "data ontbreekt" }));
        return;
      }

      const target = path.join(archiefDir, filename);
      fs.writeFileSync(target, JSON.stringify(body.data, null, 2), "utf8");

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          success: true,
          path: path.relative(root, target).replace(/\\/g, "/"),
          absolutePath: target,
        }),
      );
    } catch (e) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          success: false,
          error: e instanceof Error ? e.message : "Schrijven mislukt",
        }),
      );
    }
  });
}

/** Dev/preview: POST /__dev/save-season-archive → schrijft JSON naar /archief/ */
export function seasonArchivePlugin(): Plugin {
  return {
    name: "season-archive-writer",
    configureServer(server) {
      attachArchiveMiddleware(server.middlewares, server.config.root);
    },
    configurePreviewServer(server) {
      attachArchiveMiddleware(server.middlewares, server.config.root);
    },
  };
}
