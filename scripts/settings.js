/**
 * Fate System Settings
 */

console.log("Fate Settings | Loading module");

export const FATE_SETTINGS = {
    ENABLED: "fateEnabled",
    EVIL_BOTCHES: "evilBotches"
};

export function isFateEnabled() {
    // Check if game is initialized
    if (!game.settings) {
        console.log("Fate Settings | game.settings not available yet");
        return false;
    }
    
    const enabled = game.settings.get("wod_v20_ru", FATE_SETTINGS.ENABLED);
    console.log(`Fate Settings | isFateEnabled: ${enabled}`);
    return enabled || false;
}

export function isEvilBotchesEnabled() {
    // Check if game is initialized
    if (!game.settings) {
        console.log("Fate Settings | game.settings not available yet (evil botches)");
        return false;
    }

    const enabled = game.settings.get("wod_v20_ru", FATE_SETTINGS.EVIL_BOTCHES);
    console.log(`Fate Settings | isEvilBotchesEnabled: ${enabled}`);
    return enabled || false;
}

// Register settings
function registerSettings() {
    console.log("Fate Settings | Registering settings");
    
    game.settings.register("wod_v20_ru", FATE_SETTINGS.ENABLED, {
        name: game.i18n.localize("WOD20RU.Settings-FateEnabled-Name"),
        hint: game.i18n.localize("WOD20RU.Settings-FateEnabled-Hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: false, // Disabled by default
        onChange: value => {
            console.log(`Fate Settings | Fate enabled changed to: ${value}`);
            // Suggest reloading the world after changing this setting
            ui.notifications.info(
                game.i18n.localize("WOD20RU.Settings-FateEnabled-Notification")
            );
        }
    });

    game.settings.register("wod_v20_ru", FATE_SETTINGS.EVIL_BOTCHES, {
        name: game.i18n.localize("WOD20RU.Settings-EvilBotches-Name"),
        hint: game.i18n.localize("WOD20RU.Settings-EvilBotches-Hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: false, // Disabled by default
        onChange: value => {
            console.log(`Fate Settings | Evil botches enabled changed to: ${value}`);
            // Suggest reloading the world after changing this setting
            ui.notifications.info(
                game.i18n.localize("WOD20RU.Settings-EvilBotches-Notification")
            );
        }
    });
}

// Initialize when game is ready
Hooks.once("init", () => {
    console.log("Fate Settings | Initializing during init");
    registerSettings();
});

console.log("Fate Settings | Module loaded");
