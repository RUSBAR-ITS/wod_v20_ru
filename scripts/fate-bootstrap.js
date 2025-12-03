// scripts/fate-bootstrap.js
// Small bootstrap module that connects Fate DiceRoller integration
// to Foundry's lifecycle hooks.
//
// Responsibility:
// - On "ready" hook, if Fate feature is enabled,
//   call initFateDiceRoller() from fate-dice-roller.js.

console.log("Fate Bootstrap | Loading module");

import { isFateEnabled } from "./settings.js";
import { initFateDiceRoller } from "./fate-dice-roller.js";

Hooks.once("ready", async () => {
  console.log(
    "Fate Bootstrap | ready hook fired, checking whether to initialize Fate DiceRoller"
  );

  try {
    if (!isFateEnabled()) {
      console.log(
        "Fate Bootstrap | Fate feature disabled in settings, skipping DiceRoller patch"
      );
      return;
    }

    await initFateDiceRoller();
  } catch (error) {
    console.error(
      "Fate Bootstrap | Error while initializing Fate DiceRoller",
      error
    );
  }
});

console.log("Fate Bootstrap | Module loaded");
