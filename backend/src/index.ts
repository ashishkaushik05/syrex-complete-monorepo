import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./infra/logger";

const app = createApp();

export default {
  port: env.PORT,
  fetch: app.fetch
};

logger.info("backend_starting", {
  port: env.PORT,
  env: env.NODE_ENV
});
