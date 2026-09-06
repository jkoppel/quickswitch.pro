// Extracted verbatim from survev shared/defs/gameObjects/throwableDefs.ts (GPL-3.0). Do not edit by hand.
// Only the fields the trainer simulates are kept; values are survev's.
window.SURVEV_THROWABLE_DEFS = {
  "frag": {
    "name": "Frag Grenade", "type": "throwable", "explosionType": "explosion_frag",
    "cookable": true, "explodeOnImpact": false, "playerCollision": false,
    "fuseTime": 4, "aimDistance": 0, "rad": 1,
    "throwPhysics": { "playerVelMult": 0.6, "velZ": 5, "speed": 20, "spinVel": 31.41592653589793, "spinDrag": 1 },
    "worldImg": { "sprite": "proj-frag-nopin-nolever-01.img", "scale": 0.12, "tint": 16777215 },
    "handImg": { "equip": "proj-frag-pin-01.img", "cook": "proj-frag-nopin-01.img", "scale": 0.14, "pos": { "x": 4.2, "y": 4.2 } },
    "sound": { "pullPin": "frag_pin_01", "throwing": "frag_throw_01" }
  },
  "smoke": {
    "name": "Smoke Grenade", "type": "throwable", "explosionType": "explosion_smoke",
    "cookable": false, "explodeOnImpact": false, "playerCollision": false,
    "fuseTime": 2.5, "aimDistance": 0, "rad": 1,
    "throwPhysics": { "playerVelMult": 0.6, "velZ": 5, "speed": 20, "spinVel": 31.41592653589793, "spinDrag": 1 },
    "worldImg": { "sprite": "proj-frag-nopin-nolever-01.img", "scale": 0.12, "tint": 16777215 },
    "handImg": { "equip": "proj-frag-pin-01.img", "cook": "proj-frag-nopin-01.img", "scale": 0.14, "pos": { "x": 4.2, "y": 4.2 } },
    "sound": { "pullPin": "frag_pin_01", "throwing": "frag_throw_01" }
  }
};
