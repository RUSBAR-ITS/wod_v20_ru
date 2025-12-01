/**
 * Fate System Settings for WoD20
 * Compatible with Foundry VTT v13
 */

console.log("Fate System | Loading module");

// Main module initialization
Hooks.once("init", () => {
  console.log("Fate System | Initializing module settings");
  
  // Register settings
  registerSettings();
  
  console.log("Fate System | Settings initialized");
});

/**
 * Register all module settings
 */
function registerSettings() {
  // Register the main toggle for Fate system
  game.settings.register("wod_v20_ru", "fateEnabled", {
    name: game.i18n.localize("WOD20RU.FateEnabledName"),
    hint: game.i18n.localize("WOD20RU.FateEnabledHint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: false,
    onChange: value => {
      console.log(`Fate System | Fate enabled setting changed to: ${value}`);
      // Simple notification without complex formatting
      if (game.user.isGM) {
        const status = value ? "включена" : "отключена";
        ui.notifications.info(`Система Судьбы была ${status}`);
      }
    }
  });

  // Register Fate dice color setting
  game.settings.register("wod_v20_ru", "fateDiceColor", {
    name: game.i18n.localize("WOD20RU.FateDiceColorName"),
    hint: game.i18n.localize("WOD20RU.FateDiceColorHint"),
    scope: "world",
    config: true,
    type: String,
    default: "#8B0000",
    choices: {
      "#8B0000": game.i18n.localize("WOD20RU.ColorDarkRed"),
      "#00008B": game.i18n.localize("WOD20RU.ColorDarkBlue"),
      "#006400": game.i18n.localize("WOD20RU.ColorDarkGreen"),
      "#4B0082": game.i18n.localize("WOD20RU.ColorIndigo"),
      "#FFD700": game.i18n.localize("WOD20RU.ColorGold")
    },
    requiresReload: false,
    onChange: value => {
      console.log(`Fate System | Fate dice color changed to: ${value}`);
    }
  });

  // Register a setting for maximum Fate points
  game.settings.register("wod_v20_ru", "fateMaxPoints", {
    name: game.i18n.localize("WOD20RU.FateMaxPointsName"),
    hint: game.i18n.localize("WOD20RU.FateMaxPointsHint"),
    scope: "world",
    config: true,
    type: Number,
    default: 10,
    range: {
      min: 5,
      max: 20,
      step: 1
    },
    requiresReload: true,
    onChange: value => {
      console.log(`Fate System | Maximum Fate points changed to: ${value}`);
    }
  });
}

/**
 * Check if Fate system is enabled
 * @returns {boolean} True if Fate system is enabled
 */
export function isFateEnabled() {
  try {
    return game.settings.get("wod_v20_ru", "fateEnabled");
  } catch (error) {
    console.warn("Fate System | Could not read fateEnabled setting:", error);
    return true; // Default value
  }
}

/**
 * Get Fate dice color
 * @returns {string} Color hex code
 */
export function getFateDiceColor() {
  try {
    return game.settings.get("wod_v20_ru", "fateDiceColor");
  } catch (error) {
    console.warn("Fate System | Could not read fateDiceColor setting:", error);
    return "#8B0000"; // Default color
  }
}

/**
 * Get maximum Fate points
 * @returns {number} Maximum Fate points
 */
export function getMaxFatePoints() {
  try {
    return game.settings.get("wod_v20_ru", "fateMaxPoints");
  } catch (error) {
    console.warn("Fate System | Could not read fateMaxPoints setting:", error);
    return 10; // Default value
  }
}

// Export the main functions for other modules to use
export const FateSettings = {
  isFateEnabled,
  getFateDiceColor,
  getMaxFatePoints
};

console.log("Fate System | Module loaded successfully");
