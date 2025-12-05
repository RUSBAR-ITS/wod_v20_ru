// file: modules/wod_v20_ru/scripts/fate-dice-generator.js
// Adjust path to IconHelper if needed
import IconHelper from "./icons.js";

/**
 * Build raw SVG string for a Fate die face.
 *
 * @param {"plus"|"minus"|"blank"} face
 * @param {string} type    Race/type used by IconHelper._getTypeColor
 * @param {number} [size=64]
 * @returns {string}
 */
function buildFateDieSvg(face, type, size = 64) {
  const bg = IconHelper._getTypeColor(type);
  const stroke = type.toLowerCase() === "black" ? "#ffffff" : "#000000";
  const symbolColor = "#ffffff";

  let symbol = "";
  const symbolSize = size * 0.55;
  const fontX = size / 2;
  const fontY = size / 2 + size * 0.03; // slight vertical tweak

  switch (face) {
    case "plus":
      symbol = `<text x="${fontX}" y="${fontY}" text-anchor="middle" dominant-baseline="middle"
                        font-family="sans-serif" font-weight="bold"
                        font-size="${symbolSize}" fill="${symbolColor}">+</text>`;
      break;
    case "minus":
      symbol = `<text x="${fontX}" y="${fontY}" text-anchor="middle" dominant-baseline="middle"
                        font-family="sans-serif" font-weight="bold"
                        font-size="${symbolSize}" fill="${symbolColor}">−</text>`;
      break;
    case "blank":
    default:
      // For blank, draw a subtle dot in the center instead of text
      symbol = `<circle cx="${fontX}" cy="${fontY}" r="${size * 0.06}" fill="${symbolColor}" />`;
      break;
  }

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect x="1" y="1" width="${size - 2}" height="${size - 2}"
        rx="${size * 0.14}" ry="${size * 0.14}"
        fill="${bg}" stroke="${stroke}" stroke-width="${size * 0.04}" />
  ${symbol}
</svg>`.trim();
}

/**
 * Convert SVG string to a data URL suitable for Foundry paths.
 *
 * @param {string} svg
 * @returns {string}
 */
function svgToDataUrl(svg) {
  // Make sure we don't have newlines that break some browsers
  const cleaned = svg.replace(/\s+/g, " ").trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleaned)}`;
}

/**
 * Generate Fate dice icons for all supported types.
 * Result format:
 *   CONFIG.worldofdarkness.fateDiceIcons[type] = {
 *     plus:  "data:image/svg+xml;...",
 *     minus: "data:image/svg+xml;...",
 *     blank: "data:image/svg+xml;..."
 *   }
 */
function generateFateDiceIcons() {
  if (!CONFIG.worldofdarkness) {
    CONFIG.worldofdarkness = {};
  }

  const types = [
    "black",
    "mortal",
    "vampire",
    "werewolf",
    "changingbreed",
    "mage",
    "changeling",
    "hunter",
    "demon",
    "wraith",
    "mummy",
    "exalted",
    "creature"
  ];

  const faces = ["plus", "minus", "blank"];

  const result = {};

  for (const type of types) {
    const typeEntry = {};
    for (const face of faces) {
      const svg = buildFateDieSvg(face, type, 64);
      typeEntry[face] = svgToDataUrl(svg);
    }
    result[type] = typeEntry;
  }

  CONFIG.worldofdarkness.fateDiceIcons = result;
}

/**
 * Hook into Foundry init and build Fate dice SVGs.
 */
Hooks.once("init", () => {
  console.log("worldofdarkness | Generating Fate dice SVG icons…");
  try {
    generateFateDiceIcons();
    console.log("worldofdarkness | Fate dice SVG icons ready.");
  } catch (err) {
    console.error("worldofdarkness | Failed to generate Fate dice icons:", err);
  }
});

export { generateFateDiceIcons, buildFateDieSvg };
