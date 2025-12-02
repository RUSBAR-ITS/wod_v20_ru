/**
 * Fate System Settings
 */

console.log("Fate Settings | Loading module");

export const FATE_SETTINGS = {
    ENABLED: "fateEnabled"
};

export function isFateEnabled() {
    // Проверяем, инициализирована ли игра
    if (!game.settings) {
        console.log("Fate Settings | game.settings not available yet");
        return false;
    }
    
    const enabled = game.settings.get("wod_v20_ru", FATE_SETTINGS.ENABLED);
    console.log(`Fate Settings | isFateEnabled: ${enabled}`);
    return enabled || false;
}

// Register setting
function registerSettings() {
    console.log("Fate Settings | Registering settings");
    
    game.settings.register("wod_v20_ru", FATE_SETTINGS.ENABLED, {
        name: "Enable Fate System",
        hint: "Adds Fate track for vampire characters (identical to Willpower)",
        scope: "world",
        config: true,
        type: Boolean,
        default: false, // По умолчанию выключено
        onChange: value => {
            console.log(`Fate Settings | Fate enabled changed to: ${value}`);
            // При изменении настройки нужно перезагрузить мир
            if (value) {
                ui.notifications.info("Fate system enabled. Please reload the world to apply changes.");
            }
        }
    });
}

// Initialize when game is ready
Hooks.once("init", () => {
    console.log("Fate Settings | Initializing during init");
    registerSettings();
});

console.log("Fate Settings | Module loaded");
