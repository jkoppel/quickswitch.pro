// Extracted verbatim from survev shared/defs/mapObjects/obstacles/mapObstacleDefs.ts (GPL-3.0).
// Do not edit by hand. Only the obstacles the trainer places are kept.
window.SURVEV_OBSTACLE_DEFS = {
  "stone_01": {
    "obstacleType": "stone", "scale": { "createMin": 1, "createMax": 1.2, "destroy": 0.5 },
    "collisionRad": 1.6, "height": 0.5, "collidable": true, "destructible": true, "health": 250,
    "reflectBullets": false, "img": { "sprite": "map-stone-01.img", "scale": 0.4 },
    "sound": { "bullet": "stone_bullet" }
  },
  "barrel_01": {
    "obstacleType": "barrel", "scale": { "createMin": 1, "createMax": 1, "destroy": 0.6 },
    "collisionRad": 1.75, "height": 0.5, "collidable": true, "destructible": true, "health": 150,
    "explosion": "explosion_barrel", "reflectBullets": true,
    "img": { "sprite": "map-barrel-01.img", "scale": 0.4 },
    "sound": { "bullet": "barrel_bullet", "explode": "barrel_break_01" }
  }
};
