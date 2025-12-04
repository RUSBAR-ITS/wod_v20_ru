// wodru-dice-so-nice.js
// Registers a custom Dice So Nice colorset for Fate dice:
// emerald body with golden numbers.

Hooks.once("diceSoNiceReady", async (dice3d) => {
  if (!dice3d) return;

  const mode = "default"; // how the colorset is made available ("default" is fine here)

  const fateEmeraldColorset = {
    // Internal DSN name of the colorset
    name: "wodru-fate-emerald",

    // Use "custom" so we fully control the appearance
    colorset: "custom",

    // Optional, used in the Dice So Nice UI
    description: "WoD20 Fate (Emerald & Gold)",
    category: "World of Darkness",

    // Golden foreground (digits / pips)
    foreground: "#FBBF24",          // warm gold

    // Emerald body
    background: "#047857",          // deep emerald
    backgroundSecondary: "#10B981", // lighter emerald accent

    // Dark edges and outline for readability
    edge: "#022C22",
    outline: "#000000",

    // No extra texture, metal material for a nice sheen
    texture: "none",
    material: "metal",

    // Bold, readable font
    font: "Arial Black",

    // Standard dice system (DSN internal)
    system: "standard"
  };

  try {
    await dice3d.addColorset(fateEmeraldColorset, mode);
    console.log("WODRU | Dice So Nice colorset 'wodru-fate-emerald' registered.");
  } catch (err) {
    console.error("WODRU | Failed to register Dice So Nice colorset:", err);
  }
});
