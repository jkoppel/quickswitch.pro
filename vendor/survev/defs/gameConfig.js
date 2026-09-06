// Constants extracted from survev shared/gameConfig.ts (GPL-3.0). Do not edit by hand.
// Only the subset the trainer simulates is kept.
window.SURVEV_GAME_CONFIG = {
  "player": {
    "radius": 1,
    "health": 100,
    "moveSpeed": 12,
    "scopeDelay": 0.25,
    "baseSwitchDelay": 0.25,
    "freeSwitchCooldown": 1,
    "headshotChance": 0.15,
    "cookSpeedPenalty": 3,
    "throwableMaxMouseDist": 18,
    "cookTime": 0.1,
    "throwTime": 0.3
  },
  "bullet": { "maxReflect": 3, "reflectDistDecay": 1.5, "height": 0.25, "falloff": true },
  "projectile": { "maxHeight": 5, "gravity": 10.5, "groundDrag": 2.3 },
  "map": { "gridSize": 16 },
  "scopeZoomRadius": {
    "desktop": { "1xscope": 28, "2xscope": 36, "4xscope": 48, "8xscope": 68, "15xscope": 104 },
    "mobile": { "1xscope": 32, "2xscope": 40, "4xscope": 48, "8xscope": 64, "15xscope": 88 }
  }
};
