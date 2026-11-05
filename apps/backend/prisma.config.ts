import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
    ? {
        datasource: {
          // Use Neon’s direct endpoint for Prisma CLI operations; the app uses
          // the pooled DATABASE_URL through PrismaPg at runtime.
          url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!,
        },
      }
    : {}),
});
