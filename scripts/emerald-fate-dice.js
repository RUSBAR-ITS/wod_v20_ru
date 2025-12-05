// emerald-fate-dice.js
// Standalone emerald d10 dice generator (0–9) + Handlebars helper.
// No dependency on system icons.js/templates.js.

/**
 * Build single emerald d10 SVG (geometry taken from system dice icon).
 *
 * Faces: emerald
 * Edges: gold
 * Digits: gold
 *
 * @param {number} number - digit 0–9
 * @param {string} type   - dice type, reserved for future (currently "fate")
 * @returns {string} SVG string
 */
// Emerald d10 (0–9), геометрия 1:1 как в системном _getxD10
function buildEmeraldD10Svg(number, height = 30, width = 30) {
  const emerald = "#006B3F";  // грани
  const gold    = "#D4AF37";  // рёбра + цифры
  const black   = "#000";  // фон

  const n = Number.isFinite(number) ? number : 0;

  return `
<svg version="1.1" xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 64 64"
     style="enable-background:new 0 0 64 64; height: ${height}px; width: ${width}px;"
     xml:space="preserve">

  <g>
    <g transform="matrix(1.1679092,0,0,1.1679092,-274.931,-137.53749)"
       fill="${emerald}" stroke="${black}">
      <path d="M263.4,124.6L249.9,153l12.5,8.1l13.5-8.2L263.4,124.6z"
            fill="${emerald}" stroke="${black}" />
      <path d="M264.1,124.1l12.5,28.6l7.3-2.3l0.5-11.6L264.1,124.1z"
            fill="${emerald}" stroke="${black}" />
      <path d="M262.7,161.8v4.4l20.9-14.7l-7,2L262.7,161.8z"
            fill="${emerald}" stroke="${black}" />
      <path d="M262.7,124.2l-13.7,28.5l-7.1-3.1l-0.6-11.6L262.7,124.2z"
            fill="${emerald}" stroke="${black}" />
      <path d="M261.8,161.7v4.5l-20-15.4l6.9,2.7L261.8,161.7z"
            fill="${emerald}" stroke="${black}" />
    </g>
  </g>

  <!-- Золотая цифра по центру -->
  <text class="dice_roll"
        x="32" y="36"
        fill="${gold}"
        font-size="25"
        font-weight="bold"
        text-anchor="middle"
        dominant-baseline="middle">
    ${n}
  </text>
</svg>`.trim();
}

/**
 * Handlebars helper registration for emerald fate dice.
 *
 * Usage in template:
 *   {{SvgHtmlFate dice.value "fate"}}
 *
 * First arg  – digit on the face (0–10, where 10 is treated as 0)
 * Second arg – dice type (currently "fate")
 */
export const registerFateHandlebarsHelpers = function () {
  /**
   * SvgHtmlFate(value, dicetype)
   *
   * @param {number|string} value    face value (0–10; 10 → 0)
   * @param {string}        dicetype dice type, e.g. "fate"
   * @param {object}        options  Handlebars options (ignored)
   */
  Handlebars.registerHelper("SvgHtmlFate", (value, dicetype, options) => {
    // 1) Normalize face value
    let v = 0;

    if (typeof value !== "undefined" && value !== null) {
      v = parseInt(value, 10);
      if (isNaN(v)) v = 0;
    }

    // System convention: 10 → 0
    if (v === 10) {
      v = 0;
    }

    // 2) Dice type: default to "fate"
    let type = dicetype;
    if (!type || typeof type !== "string") {
      type = "fate";
    }

    // 3) Build SVG directly for this value and type
    const svg = buildEmeraldD10Svg(v, type);

    // 4) Return URI-encoded SVG (as system SvgHtml does)
    return encodeURIComponent(svg);
  });
};

// Register helper on Foundry init
Hooks.once("init", () => {
  console.log("WOD20RU | Registering emerald Fate Handlebars helpers");
  registerFateHandlebarsHelpers();
});

export default {
  registerFateHandlebarsHelpers,
  buildEmeraldD10Svg
};
