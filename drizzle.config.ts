import type { Config } from "drizzle-kit"

export default {
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.LOCAL_SQLITE_PATH || "./data/app.db",
  },
} satisfies Config
