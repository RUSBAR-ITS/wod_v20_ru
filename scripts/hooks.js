/**
 * Fate System Hooks
 */

console.log("Fate Hooks | Loading module");

import { isFateEnabled } from "./settings.js";
import { FateData } from "./fate-data.js";
import { FateRollDialog } from "./fate-roll-dialog.js";

// Initialize immediately when module loads
console.log("Fate Hooks | Initializing immediately");

// Check if game is already initialized
if (game.actors) {
    initializeHooks();
} else {
    Hooks.once('init', initializeHooks);
}

function initializeHooks() {
    console.log("Fate Hooks | Initializing hooks");
    
    // Register Handlebars helpers
    console.log("Fate Hooks | Registering Handlebars helpers");
    
    // Helper to check if Fate is enabled
    Handlebars.registerHelper('isFateEnabled', function() {
        return isFateEnabled();
    });
    
    // Helper to prepare Fate dots for template
    Handlebars.registerHelper('prepareFateDots', function(fateData) {
        if (!fateData) return [];
        return FateData.prepareFateDots(fateData);
    });
    
    // Helper to prepare Fate boxes for template
    Handlebars.registerHelper('prepareFateBoxes', function(fateData) {
        if (!fateData) return [];
        return FateData.prepareFateBoxes(fateData);
    });
    
    // Initialize Fate data for all existing actors when game is ready
    Hooks.once("ready", () => {
        console.log("Fate Hooks | Game ready, initializing Fate data for all actors");
        initializeAllActors();
    });
    
    // Initialize Fate data for newly created actors
    Hooks.on("createActor", (actor) => {
        console.log(`Fate Hooks | New actor created: ${actor.name}`);
        FateData.initializeActorFate(actor);
    });
    
    // Add Fate to actor sheets - handle clicks
    Hooks.on("renderActorSheet", (app, html, data) => {
        if (!isFateEnabled()) return;
        
        const actor = app.object;
        if (!actor || !FateData.isVampire(actor)) return;
        
        console.log(`Fate Hooks | Setting up click handlers for: ${actor.name}`);
        
        // Add click handlers for Fate elements
        html.on('click', '.fate-dot, .fate-box', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            const target = event.currentTarget;
            const index = parseInt(target.dataset.index);
            const type = target.dataset.type; // "dots" or "boxes"
            
            console.log(`Fate Hooks | Click on Fate element: index=${index}, type=${type}`);
            
            await FateData.handleFateClick(actor, index, type);
            app.render(false);
        });
        
        // Add click handler for Fate banner roll
        html.on('click', '[data-roll="fate"]', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            console.log(`Fate Hooks | Click on Fate banner roll for: ${actor.name}`);
            
            // Check if Fate can be used (filled boxes < 10)
            const fateData = FateData.getFateData(actor);
            if (!fateData) return;
            
            const used = fateData.used || 0;
            const max = fateData.max || 10;
            
            if (used >= max) {
                ui.notifications.warn(game.i18n.localize("WOD20RU.FateRollMaxUsed"));
                return;
            }
            
            // Show Fate roll dialog
            const dialog = new FateRollDialog(actor, app);
            dialog.render(true);
        });
    });
    
    console.log("Fate Hooks | Hooks initialized");
}

async function initializeAllActors() {
    if (!isFateEnabled()) {
        console.log("Fate Hooks | Fate system disabled, skipping actor initialization");
        return;
    }
    
    const actors = game.actors;
    if (!actors || actors.size === 0) {
        console.log("Fate Hooks | No actors found");
        return;
    }
    
    console.log(`Fate Hooks | Found ${actors.size} actors, checking for vampires`);
    
    let vampireCount = 0;
    for (const actor of actors) {
        if (FateData.isVampire(actor)) {
            vampireCount++;
            await FateData.initializeActorFate(actor);
        }
    }
    
    console.log(`Fate Hooks | Initialized Fate data for ${vampireCount} vampires`);
}

console.log("Fate Hooks | Module loaded");
