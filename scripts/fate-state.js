// scripts/fate-state.js
// Shared in-memory state between Fate Hooks (UI) and the patched DiceRoller.
// This never touches the database; it only lives in memory while Foundry is running.

console.log("Fate State | Loading module");

export const fateState = {
  /** @type {Map<string, { useFate: boolean, fateDice: number }>} */
  _byActor: new Map(),

  /**
   * Set (or overwrite) Fate state for a given actor.
   * @param {string} actorId
   * @param {{ useFate?: boolean, fateDice?: number }} data
   */
  set(actorId, data) {
    if (!actorId || !data) return;

    const useFate = !!data.useFate;
    let fateDice = 0;

    if (Number.isFinite(data.fateDice)) {
      fateDice = data.fateDice;
    } else if (data.fateDice != null) {
      const parsed = parseInt(data.fateDice, 10);
      fateDice = Number.isNaN(parsed) ? 0 : parsed;
    }

    this._byActor.set(actorId, { useFate, fateDice });
    console.log("Fate State | set", actorId, { useFate, fateDice });
  },

  /**
   * Read Fate state without clearing it.
   * @param {string} actorId
   * @returns {{ useFate: boolean, fateDice: number } | null}
   */
  get(actorId) {
    if (!actorId) return null;
    return this._byActor.get(actorId) ?? null;
  },

  /**
   * Read Fate state and remove it (one-shot semantics).
   * @param {string} actorId
   * @returns {{ useFate: boolean, fateDice: number } | null}
   */
  consume(actorId) {
    if (!actorId) return null;
    const value = this._byActor.get(actorId) ?? null;
    if (value) {
      this._byActor.delete(actorId);
      console.log("Fate State | consumed", actorId, value);
    }
    return value;
  },

  /** Clear all entries (rarely needed). */
  clear() {
    this._byActor.clear();
    console.log("Fate State | cleared");
  }
};

console.log("Fate State | Module loaded");
