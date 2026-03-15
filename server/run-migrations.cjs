const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const migrations = [
  "add_admin_role.sql",
  "add_email_verification_and_password_reset.sql",
  "add_profile_fields.sql",
  "add_username.sql",
  "add_onboarding_completed.sql",
  "create_chat_questions.sql",
  "create_daily_challenges.sql",
  "add_announcements.sql",
  "add_feedback_read_status.sql",
  "add_featured_resources.sql",
  "add_resources_and_tools.sql",
  "add_howmanyassets_and_pic_resources.sql",
  "add_property_analyses.sql",
  "add_property_slug.sql",
  "add_property_sharing.sql",
  "add_geocoding_cache.sql",
  "add_area_market_data.sql",
];

(async () => {
  for (const file of migrations) {
    try {
      const sql = fs.readFileSync(path.join("src/db/migrations", file), "utf8");
      await pool.query(sql);
      console.log("OK:", file);
    } catch (e) {
      console.log("WARN:", file, "-", e.message.split("\n")[0]);
    }
  }
  await pool.end();
  console.log("Done - all migrations processed");
})();
