import "dotenv/config";

function main() {
  const args = new Set(process.argv.slice(2));
  const requireTally = args.has("--require-tally");
  const requireAmbient = args.has("--require-ambient") || !args.has("--skip-ambient");

  const missing: string[] = [];

  if (requireAmbient && !process.env.AMBIENT_API_KEY) {
    missing.push("AMBIENT_API_KEY");
  }
  if (requireTally && !process.env.TALLY_API_KEY) {
    missing.push("TALLY_API_KEY");
  }

  if (missing.length) {
    console.error(`Missing env: ${missing.join(", ")}`);
    process.exit(1);
  }

  console.log("env ok");
}

main();
