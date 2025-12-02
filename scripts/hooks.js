/**
 * Fate System Hooks
 */

console.log("Fate Hooks | Loading module");

import { isFateEnabled } from "./settings.js";
import { FateData } from "./fate-data.js";

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
    
    // Prepare Fate data for templates - ДОБАВЛЯЕМ ПРИОРИТЕТ!
    console.log("Fate Hooks | Registering prepareActorData hook");
    Hooks.on("prepareActorData", (actorData) => {
        console.log(`Fate Hooks | prepareActorData called for: ${actorData.actor?.name || 'unknown'}`);
        
        if (!isFateEnabled()) return;
        
        const actor = actorData.actor || actorData;
        if (!actor || !FateData.isVampire(actor)) return;
        
        console.log(`Fate Hooks | Preparing Fate data for vampire: ${actor.name}`);
        
        const fate = FateData.getFateData(actor);
        if (!fate) {
            console.log(`Fate Hooks | No Fate data found for ${actor.name}`);
            return;
        }
        
        console.log(`Fate Hooks | Fate data found:`, fate);
        
        // Prepare Fate data for template
        const preparedFate = FateData.prepareFateForTemplate(fate);
        console.log(`Fate Hooks | Prepared Fate data:`, preparedFate);
        
        if (preparedFate) {
            // Store in actor data for template access
            actorData.system = actorData.system || {};
            actorData.system.fate = preparedFate;
            
            console.log(`Fate Hooks | Added Fate data to actorData for ${actor.name}`);
        }
    }, {once: false, priority: 100}); // Высокий приоритет для гарантии выполнения
    
    // Add Fate to actor sheets - handle clicks
    Hooks.on("renderActorSheet", (app, html, data) => {
        if (!isFateEnabled()) return;
        
        const actor = app.object;
        if (!actor || !FateData.isVampire(actor)) return;
        
        console.log(`Fate Hooks | Setting up click handlers for: ${actor.name}`);
        
        // Добавляем отладочную информацию
        console.log(`Fate Hooks | Actor system.fate:`, actor.system?.fate);
        console.log(`Fate Hooks | Template data:`, data);
        
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
