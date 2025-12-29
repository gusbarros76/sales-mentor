import "dotenv/config";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to run the seed script");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const companyName = "Demo Company";
    const ownerEmail = "owner@example.com";
    const agentDisplayName = "Demo Agent";

    const existingCompany = await client.query(
      "SELECT id FROM companies WHERE name = $1 LIMIT 1",
      [companyName]
    );
    const companyId =
      existingCompany.rows[0]?.id ||
      (
        await client.query(
          "INSERT INTO companies (name) VALUES ($1) RETURNING id",
          [companyName]
        )
      ).rows[0].id;

    const existingUser = await client.query(
      "SELECT id FROM users WHERE company_id = $1 AND email = $2 LIMIT 1",
      [companyId, ownerEmail]
    );
    const userId =
      existingUser.rows[0]?.id ||
      (
        await client.query(
          "INSERT INTO users (company_id, name, email, role) VALUES ($1, $2, $3, $4) RETURNING id",
          [companyId, "Demo Owner", ownerEmail, "OWNER"]
        )
      ).rows[0].id;

    const existingAgent = await client.query(
      "SELECT id FROM agents WHERE company_id = $1 AND display_name = $2 LIMIT 1",
      [companyId, agentDisplayName]
    );
    const agentId =
      existingAgent.rows[0]?.id ||
      (
        await client.query(
          "INSERT INTO agents (company_id, user_id, display_name) VALUES ($1, $2, $3) RETURNING id",
          [companyId, userId, agentDisplayName]
        )
      ).rows[0].id;

    await client.query("COMMIT");

    console.log("Seed complete:");
    console.log({ companyId, userId, agentId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
