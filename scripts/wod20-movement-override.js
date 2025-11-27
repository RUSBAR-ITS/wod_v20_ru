// wod20-movement-override.js
// Post-process movement values for WoD20: divide all jump values by 4
// without touching the original movement formulas.

import CombatHelper from "../../../systems/worldofdarkness/module/scripts/combat-helpers.js";

Hooks.once("ready", () => {
  console.log("WoD20 RU Overrides | Patching CombatHelper.CalculateMovement");

  const originalCalculateMovement = CombatHelper.CalculateMovement;

  CombatHelper.CalculateMovement = async function (actor) {
    // Call the original helper to keep all base logic intact
    const movement = await originalCalculateMovement.call(this, actor);

    // Helper to safely divide by 4 and keep numbers
    const divideByFour = (value) => {
      const num = Number(value ?? 0);
      if (Number.isNaN(num)) return 0;
      // If you want integers only, use Math.round here
      return num / 4;
    };

    movement.vjump = divideByFour(movement.vjump);
    movement.hjump = divideByFour(movement.hjump);

    return movement;
  };
});
