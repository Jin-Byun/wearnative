import { hooks } from "./src";

const hookName = process.argv[2];

if (!hookName || !Object.hasOwn(hooks, hookName)) {
  console.error(`Error: Hook "${hookName}" not found in buildHooks/src/index.ts`);
  process.exit(1);
}

// Execute the hook function
Promise.resolve(hooks[hookName]())
  .catch((err) => {
    console.error(`Hook "${hookName}" failed:`, err);
    process.exit(1);
  });
