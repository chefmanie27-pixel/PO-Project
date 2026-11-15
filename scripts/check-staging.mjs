import { checkRelease } from "./staging-artifacts.mjs";
const directory = process.argv[2];
if (!directory)
  throw Error("Usage: npm run staging:check -- <prepared-release-directory>");
console.log(JSON.stringify(checkRelease(directory), null, 2));
