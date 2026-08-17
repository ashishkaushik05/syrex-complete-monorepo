import { assertTestOnlyCommand } from "../src/config/runtime-safety";

assertTestOnlyCommand(process.argv[2] ?? "test fixture command");
