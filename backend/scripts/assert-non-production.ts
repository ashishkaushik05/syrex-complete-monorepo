import { assertNonProductionCommand } from "../src/config/runtime-safety";

assertNonProductionCommand(process.argv.slice(2).join(" ") || "development command");
