// wod20-ru-lang.js
// Add the langRU class when Russian is the active language

function getCurrentLanguage() {
  // Foundry VTT v10+ usually uses game.i18n.lang
  try {
    if (game?.i18n?.lang) return game.i18n.lang;
  } catch (e) {
    // ignore
  }

  // Fallback to core setting if needed
  try {
    return game.settings.get("core", "language");
  } catch (e) {
    // ignore
  }

  return "en";
}

console.log("wod_v20_ru: wod20-ru-lang.js evaluated");

Hooks.once("ready", () => {
  const lang = getCurrentLanguage();
  console.log("wod_v20_ru: ready hook fired, current language =", lang);

  if (lang === "ru") {
    document.body.classList.add("langRU");
    console.log("wod_v20_ru: langRU class added to <body>");
  } else {
    console.log("wod_v20_ru: language is not 'ru', no class added");
  }
});
