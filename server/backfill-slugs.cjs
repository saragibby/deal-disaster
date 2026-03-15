const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Slug generation — mirrors server/src/utils/slugify.ts
function generatePropertySlug(address, zip) {
  const cleaned = address
    .toLowerCase()
    .replace(/[,#.]/g, " ")
    .replace(/\b(apt|unit|suite|ste|bldg|fl|floor)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = cleaned.split(" ").filter(Boolean);
  const abbrevMap = {
    street: "st", avenue: "ave", boulevard: "blvd", drive: "dr",
    road: "rd", lane: "ln", court: "ct", circle: "cir",
    place: "pl", way: "wy", terrace: "ter", trail: "trl",
    parkway: "pkwy", highway: "hwy", pike: "pk",
  };
  const abbreviated = tokens.map((t) => abbrevMap[t] || t);
  const addressPart = abbreviated.slice(0, 4).join("-");
  const cleanZip = (zip || "").replace(/\D/g, "").slice(0, 5) || "00000";
  return `${addressPart}-${cleanZip}`;
}

(async () => {
  // Find rows with null slugs
  const res = await pool.query(
    "SELECT id, property_data FROM property_analyses WHERE slug IS NULL"
  );
  console.log(`Found ${res.rows.length} rows with NULL slugs`);

  let updated = 0;
  for (const row of res.rows) {
    const pd = row.property_data;
    const address = pd.address || pd.streetAddress || "";
    const zip = pd.zip || pd.zipcode || "";

    if (!address) {
      console.log(`  SKIP id=${row.id} — no address in property_data`);
      continue;
    }

    const slug = generatePropertySlug(address, zip);
    try {
      await pool.query(
        "UPDATE property_analyses SET slug = $1 WHERE id = $2",
        [slug, row.id]
      );
      console.log(`  OK id=${row.id} → ${slug}`);
      updated++;
    } catch (e) {
      // Duplicate slug for same user — append id to make unique
      const fallback = `${slug}-${row.id}`;
      await pool.query(
        "UPDATE property_analyses SET slug = $1 WHERE id = $2",
        [fallback, row.id]
      );
      console.log(`  OK id=${row.id} → ${fallback} (deduped)`);
      updated++;
    }
  }

  console.log(`Backfilled ${updated} slugs`);
  await pool.end();
})();
