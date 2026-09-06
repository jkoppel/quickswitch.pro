// Extracted verbatim from survev (GPL-3.0). Do not edit by hand.
//   walls and props: shared/defs/mapObjects/obstacles/{buildingObjsDefs,crateDefs,furnitureDefs}.ts
//   materials:       shared/defs/mapObjects/mapObjectHelpers.ts  (metal reflects bullets)
//   layout:          shared/defs/mapObjects/buildings/bunkerDefs.ts -> bunker_storm_sublevel_01
// Colliders are AABBs given as half-extents, in survev's own world units.
window.SURVEV_BUNKER_DEFS = {
  // createWall(): height 10, collidable, isWall. The material decides the rest, and `metal` is the
  // only one of them that sets reflectBullets, which is why bank shots live in the bunkers.
  "obstacles": {
    "concrete_wall_ext_6":      { "shape": "rect", "extents": [0.5, 3],    "material": "concrete", "height": 10, "health": 150, "destructible": false, "reflectBullets": false },
    "metal_wall_ext_thicker_4": { "shape": "rect", "extents": [1.5, 2],    "material": "metal",    "height": 10, "health": 150, "destructible": false, "reflectBullets": true },
    "metal_wall_ext_thicker_5": { "shape": "rect", "extents": [1.5, 2.5],  "material": "metal", "height": 10, "health": 150, "destructible": false, "reflectBullets": true },
    "metal_wall_ext_thicker_6": { "shape": "rect", "extents": [1.5, 3],    "material": "metal", "height": 10, "health": 150, "destructible": false, "reflectBullets": true },
    "metal_wall_ext_thicker_11":{ "shape": "rect", "extents": [1.5, 5.5],  "material": "metal", "height": 10, "health": 150, "destructible": false, "reflectBullets": true },
    "metal_wall_ext_thicker_29":{ "shape": "rect", "extents": [1.5, 14.5], "material": "metal", "height": 10, "health": 150, "destructible": false, "reflectBullets": true },
    "metal_wall_ext_thicker_42":{ "shape": "rect", "extents": [1.5, 21],   "material": "metal", "height": 10, "health": 150, "destructible": false, "reflectBullets": true },
    "metal_wall_ext_4":         { "shape": "rect", "extents": [0.5, 2],    "material": "metal", "height": 10, "health": 150, "destructible": false, "reflectBullets": true },
    "metal_wall_column_5x12":   { "shape": "rect", "extents": [2.5, 6],    "material": "metal", "height": 10, "health": 150, "destructible": false, "reflectBullets": true },
    "metal_wall_ext_thicker_8": { "shape": "rect", "extents": [1.5, 4],    "material": "metal",    "height": 10, "health": 150, "destructible": false, "reflectBullets": true },
    "metal_wall_ext_thicker_9": { "shape": "rect", "extents": [1.5, 4.5],  "material": "metal",    "height": 10, "health": 150, "destructible": false, "reflectBullets": true },
    "metal_wall_ext_thicker_10":{ "shape": "rect", "extents": [1.5, 5],    "material": "metal",    "height": 10, "health": 150, "destructible": false, "reflectBullets": true },
    "metal_wall_ext_thicker_15":{ "shape": "rect", "extents": [1.5, 7.5],  "material": "metal",    "height": 10, "health": 150, "destructible": false, "reflectBullets": true },
    "metal_wall_ext_thicker_17":{ "shape": "rect", "extents": [1.5, 8.5],  "material": "metal",    "height": 10, "health": 150, "destructible": false, "reflectBullets": true },
    "metal_wall_ext_thicker_20":{ "shape": "rect", "extents": [1.5, 10],   "material": "metal",    "height": 10, "health": 150, "destructible": false, "reflectBullets": true },
    "metal_wall_ext_thicker_21":{ "shape": "rect", "extents": [1.5, 10.5], "material": "metal",    "height": 10, "health": 150, "destructible": false, "reflectBullets": true },
    // createCrate(): 2.25 half-extents, height 0.5, wood, destructible.
    "crate_01": { "shape": "rect", "extents": [2.25, 2.25], "material": "wood", "height": 0.5, "health": 75,  "destructible": true, "reflectBullets": false, "img": { "sprite": "map-crate-01.img", "scale": 0.5 } },
    "crate_04": { "shape": "rect", "extents": [2.25, 2.25], "material": "wood", "height": 0.5, "health": 225, "destructible": true, "reflectBullets": false, "img": { "sprite": "map-crate-04.img", "scale": 0.5 } },
    "crate_08": { "shape": "rect", "extents": [2.25, 2.25], "material": "wood", "height": 0.5, "health": 140, "destructible": true, "reflectBullets": false, "img": { "sprite": "map-crate-08.img", "scale": 0.5 } },
    // createControlPanel(): metal, reflects, and detonates like a barrel when destroyed.
    "control_panel_02": { "shape": "rect", "extents": [1, 1], "material": "metal", "height": 0.5, "health": 250, "destructible": true, "reflectBullets": true, "explosion": "explosion_barrel" },
    "control_panel_03": { "shape": "rect", "extents": [1, 1], "material": "metal", "height": 0.5, "health": 250, "destructible": true, "reflectBullets": true, "explosion": "explosion_barrel" }
  },
  // bunker_storm_sublevel_01's mapObjects, in survev's coordinates (y up) with `ori` in quarter turns.
  // The two doors it also carries are left as open doorways here; the trainer has no door mechanic and
  // an open doorway is the more useful shape to shoot through.
  "bunker_storm_sublevel_01": {
    "name": "Storm bunker",
    "objects": [
      { "type": "concrete_wall_ext_6",       "pos": [0, 11.5],     "ori": 1 },
      { "type": "metal_wall_ext_thicker_8",  "pos": [-3.5, 8],     "ori": 0 },
      { "type": "metal_wall_ext_thicker_8",  "pos": [3.5, 8],      "ori": 0 },
      { "type": "metal_wall_ext_thicker_4",  "pos": [-7, 5.5],     "ori": 1 },
      { "type": "metal_wall_ext_thicker_4",  "pos": [7, 5.5],      "ori": 1 },
      { "type": "metal_wall_ext_thicker_20", "pos": [-10.5, -3],   "ori": 0 },
      { "type": "metal_wall_ext_thicker_21", "pos": [-1.5, -14.5], "ori": 1 },
      { "type": "metal_wall_ext_thicker_10", "pos": [10.5, -11],   "ori": 0 },
      { "type": "metal_wall_ext_thicker_10", "pos": [12.5, -11],   "ori": 0 },
      { "type": "metal_wall_ext_thicker_15", "pos": [21.5, -14.5], "ori": 1 },
      { "type": "metal_wall_ext_thicker_15", "pos": [27.5, -5.5],  "ori": 0 },
      { "type": "metal_wall_ext_thicker_17", "pos": [20.5, 3.5],   "ori": 1 },
      { "type": "metal_wall_ext_thicker_9",  "pos": [10.5, 2.5],   "ori": 0 },
      { "type": "metal_wall_ext_thicker_4",  "pos": [12.5, 0],     "ori": 0 },
      { "type": "crate_01",        "pos": [-6.5, 1.5],   "ori": 0 },
      { "type": "crate_04",        "pos": [6, -1],       "ori": 0 },
      { "type": "crate_04",        "pos": [3.9, -6.4],   "ori": 0 },
      { "type": "control_panel_03","pos": [16, -11.5],   "ori": 2 },
      { "type": "control_panel_02","pos": [20, -11.25],  "ori": 2 },
      { "type": "control_panel_03","pos": [24, -11.5],   "ori": 2 },
      { "type": "crate_08",        "pos": [23.5, -0.5],  "ori": 0 },
      { "type": "barrel_01",       "pos": [-7, -11],     "ori": 0 }
    ],
    // The walkable floor, from the def's floor.surfaces AABBs plus the corridor the walls enclose.
    "rooms": [
      { "center": [1, -4.4],  "extents": [9.5, 8] },
      { "center": [19, -5.5], "extents": [7.5, 8] },
      { "center": [0, 7],     "extents": [3, 4] }
    ],
    "playerSpawn": [0, 7],
    "bounds": { "center": [9, -2], "extents": [24, 17] }
  },
  // The Hydra bunker's second compartment: a wide metal chamber with side corridors and two columns.
  // Chosen for the ricochet drill because it is the layout whose corners a bank shot can actually
  // turn: 5 of 8 sampled no-line-of-sight positions are reachable off a wall, in ~2.5-degree windows.
  "bunker_hydra_compartment_02": {
    "name": "Hydra bunker",
    "objects": [
      { "type": "metal_wall_ext_thicker_21", "pos": [-17, 21.75], "ori": 1 },
      { "type": "metal_wall_ext_thicker_21", "pos": [12, 21.75],  "ori": 1 },
      { "type": "metal_wall_ext_thicker_42", "pos": [-26, -0.5],  "ori": 0 },
      { "type": "metal_wall_ext_thicker_29", "pos": [21, 6],      "ori": 0 },
      { "type": "metal_wall_ext_thicker_6",  "pos": [-19, -18.5], "ori": 0 },
      { "type": "metal_wall_ext_thicker_4",  "pos": [-18.5, -14], "ori": 1 },
      { "type": "metal_wall_ext_thicker_5",  "pos": [-15, -15],   "ori": 0 },
      { "type": "metal_wall_ext_thicker_9",  "pos": [-9, -16],    "ori": 1 },
      { "type": "metal_wall_ext_thicker_9",  "pos": [4, -16],     "ori": 1 },
      { "type": "metal_wall_ext_thicker_5",  "pos": [10, -15],    "ori": 0 },
      { "type": "metal_wall_ext_thicker_11", "pos": [17, -14],    "ori": 1 },
      { "type": "metal_wall_column_5x12",    "pos": [-14.5, 13],  "ori": 1 },
      { "type": "metal_wall_column_5x12",    "pos": [9.5, 13],    "ori": 1 },
      { "type": "control_panel_03",          "pos": [-7, 12],     "ori": 1 },
      { "type": "control_panel_03",          "pos": [2, 12],      "ori": 3 },
      { "type": "metal_wall_ext_4",          "pos": [-9, 8.5],    "ori": 0 },
      { "type": "metal_wall_ext_4",          "pos": [4, 8.5],     "ori": 0 },
      { "type": "crate_01",                  "pos": [-17.5, 7.75],"ori": 0 },
      { "type": "crate_01",                  "pos": [12.5, 7.75], "ori": 0 }
    ]
  }
};
