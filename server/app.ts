import express, { type Express, type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";

/**
 * Extend Express Request to carry raw body Buffer for HMAC verification.
 * Used by POST /api/webhooks/waba to verify Meta's X-Hub-Signature-256 header.
 */
declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

export function createBaseApp(): Express {
  const app = express();

  // Capture raw bytes via the verify callback BEFORE JSON parsing.
  // This is the only reliable way to get the original payload bytes after
  // express.json() has consumed the stream, enabling HMAC verification
  // on webhook routes (e.g. POST /api/webhooks/waba).
  app.use(express.json({
    verify: (req: Request, _res, buf) => {
      req.rawBody = buf;
    },
  }));

  app.use(express.urlencoded({ extended: false }));
  app.set('trust proxy', 1);
  return app as unknown as Express;
}

export async function setupApp(): Promise<Express> {
  const app = createBaseApp();

  await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });

  return app;
}
