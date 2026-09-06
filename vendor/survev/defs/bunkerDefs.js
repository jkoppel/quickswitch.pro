// Extracted verbatim from survev (GPL-3.0). Do not edit by hand.
//   wall sizes:  shared/defs/mapObjects/obstacles/buildingObjsDefs.ts  -> createWall({ material, extents })
//   materials:   shared/defs/mapObjects/mapObjectHelpers.ts            -> MaterialDefs; `metal` is the
//                only material with reflectBullets, which is why ricochet is an indoor technique
//   props:       shared/defs/mapObjects/obstacles/{crateDefs,furnitureDefs}.ts
//   layouts:     shared/defs/mapObjects/buildings/bunkerDefs.ts        -> each building's mapObjects
// Colliders are AABB half-extents in survev's world units; `ori` is a quarter turn, which for an
// axis-aligned box just swaps its extents. survev's y axis points up and the trainer's points down,
// so layouts are mirrored on import (see Game.makeBunker).
window.SURVEV_BUNKER_DEFS = {
  // Props that appear inside these buildings. Control panels are metal: they bounce bullets and
  // detonate like a barrel. Crates are wood and merely block.
  "props": {
    "crate_01": { "shape": "rect", "extents": [2.25, 2.25], "material": "wood", "height": 0.5, "health": 75, "destructible": true },
    "crate_02": { "shape": "rect", "extents": [2.25, 2.25], "material": "wood", "height": 0.5, "health": 140, "destructible": true },
    "crate_04": { "shape": "rect", "extents": [2.25, 2.25], "material": "wood", "height": 0.5, "health": 225, "destructible": true },
    "crate_08": { "shape": "rect", "extents": [2.25, 2.25], "material": "wood", "height": 0.5, "health": 140, "destructible": true },
    "control_panel_02": { "shape": "rect", "extents": [1, 1], "material": "metal", "height": 0.5, "health": 250, "destructible": true, "explosion": "explosion_barrel" },
    "control_panel_03": { "shape": "rect", "extents": [1, 1], "material": "metal", "height": 0.5, "health": 250, "destructible": true, "explosion": "explosion_barrel" },
    "barrel_01": { "shape": "circle", "rad": 1.75, "material": "metal", "height": 0.5, "health": 150, "destructible": true, "explosion": "explosion_barrel" }
  },
  // The four buildings the Ricochet drill draws from, chosen by simulation rather than by eye.
  // Every survev bunker with six or more metal walls was played out with the cover bot for 90
  // seconds against a player who keeps moving to re-take the shot. These four sit in the band that
  // the drill needs: the straight shot is denied 51-79% of the time, the bot still gets enough sight
  // of you to fire back (108-265 shots a run), and a bounced round reaches three to five of eight
  // sampled positions that have no direct line at all. Bunkers that hid better than this stopped
  // shooting back; ones that shot more stopped being cover.
  "walls": {
    "concrete_wall_ext_6": { "extents": [0.5, 3], "material": "concrete", "health": 150 },
    "metal_wall_column_4x8": { "extents": [2, 4], "material": "metal", "health": 150 },
    "metal_wall_column_5x12": { "extents": [2.5, 6], "material": "metal", "health": 150 },
    "metal_wall_ext_4": { "extents": [0.5, 2], "material": "metal", "health": 150 },
    "metal_wall_ext_thicker_10": { "extents": [1.5, 5], "material": "metal", "health": 150 },
    "metal_wall_ext_thicker_11": { "extents": [1.5, 5.5], "material": "metal", "health": 150 },
    "metal_wall_ext_thicker_13": { "extents": [1.5, 6.5], "material": "metal", "health": 150 },
    "metal_wall_ext_thicker_14": { "extents": [1.5, 7], "material": "metal", "health": 150 },
    "metal_wall_ext_thicker_15": { "extents": [1.5, 7.5], "material": "metal", "health": 150 },
    "metal_wall_ext_thicker_16": { "extents": [1.5, 8], "material": "metal", "health": 150 },
    "metal_wall_ext_thicker_17": { "extents": [1.5, 8.5], "material": "metal", "health": 150 },
    "metal_wall_ext_thicker_18": { "extents": [1.5, 9], "material": "metal", "health": 150 },
    "metal_wall_ext_thicker_19": { "extents": [1.5, 9.5], "material": "metal", "health": 150 },
    "metal_wall_ext_thicker_20": { "extents": [1.5, 10], "material": "metal", "health": 150 },
    "metal_wall_ext_thicker_21": { "extents": [1.5, 10.5], "material": "metal", "health": 150 },
    "metal_wall_ext_thicker_27": { "extents": [1.5, 13.5], "material": "metal", "health": 150 },
    "metal_wall_ext_thicker_29": { "extents": [1.5, 14.5], "material": "metal", "health": 150 },
    "metal_wall_ext_thicker_34": { "extents": [1.5, 17], "material": "metal", "health": 150 },
    "metal_wall_ext_thicker_4": { "extents": [1.5, 2], "material": "metal", "health": 150 },
    "metal_wall_ext_thicker_42": { "extents": [1.5, 21], "material": "metal", "health": 150 },
    "metal_wall_ext_thicker_5": { "extents": [1.5, 2.5], "material": "metal", "health": 150 },
    "metal_wall_ext_thicker_6": { "extents": [1.5, 3], "material": "metal", "health": 150 },
    "metal_wall_ext_thicker_8": { "extents": [1.5, 4], "material": "metal", "health": 150 },
    "metal_wall_ext_thicker_9": { "extents": [1.5, 4.5], "material": "metal", "health": 150 }
  },
  "layouts": {
    "bunker_crossing_compartment_01": {
      "name": "Crossing bunker",
      "objects": [
        { "type": "metal_wall_ext_thicker_13", "pos": [-14, 16], "ori": 1 },
        { "type": "metal_wall_ext_thicker_18", "pos": [5.5, 16], "ori": 1 },
        { "type": "metal_wall_ext_thicker_8", "pos": [16, 13.5], "ori": 0 },
        { "type": "metal_wall_ext_thicker_15", "pos": [22, 8], "ori": 1 },
        { "type": "metal_wall_ext_thicker_4", "pos": [27, 4.5], "ori": 0 },
        { "type": "metal_wall_ext_thicker_15", "pos": [22, 1], "ori": 1 },
        { "type": "metal_wall_ext_thicker_11", "pos": [16, -6], "ori": 0 },
        { "type": "metal_wall_ext_thicker_10", "pos": [9.5, -10], "ori": 1 },
        { "type": "metal_wall_ext_thicker_19", "pos": [-9, -10], "ori": 1 },
        { "type": "metal_wall_ext_thicker_4", "pos": [-19.5, -8], "ori": 1 },
        { "type": "metal_wall_ext_thicker_10", "pos": [-20, -14.5], "ori": 0 },
        { "type": "metal_wall_ext_thicker_17", "pos": [-27, -11], "ori": 0 },
        { "type": "metal_wall_ext_thicker_11", "pos": [-23, -1], "ori": 1 },
        { "type": "metal_wall_ext_thicker_14", "pos": [-19, 7.5], "ori": 0 },
        { "type": "control_panel_03", "pos": [-15.5, 12.75], "ori": 1 },
        { "type": "control_panel_03", "pos": [-15.5, 4.25], "ori": 1 },
        { "type": "barrel_01", "pos": [-5, 10.25], "ori": 0 },
        { "type": "barrel_01", "pos": [-3.25, 12.5], "ori": 0 },
        { "type": "crate_01", "pos": [-5, -6.25], "ori": 0 },
        { "type": "barrel_01", "pos": [-3, -2.5], "ori": 0 },
        { "type": "crate_01", "pos": [-23.5, -4.5], "ori": 0 },
        { "type": "crate_01", "pos": [-23.5, -14], "ori": 0 }
      ]
    },
    "bunker_conch_sublevel_01": {
      "name": "Conch bunker",
      "objects": [
        { "type": "concrete_wall_ext_6", "pos": [20, 3.5], "ori": 0 },
        { "type": "metal_wall_ext_thicker_8", "pos": [16.5, 6.7], "ori": 1 },
        { "type": "metal_wall_ext_thicker_29", "pos": [7, 0], "ori": 1 },
        { "type": "metal_wall_ext_thicker_16", "pos": [5.5, 9], "ori": 1 },
        { "type": "metal_wall_ext_thicker_9", "pos": [-7, 7], "ori": 1 },
        { "type": "metal_wall_ext_thicker_10", "pos": [-13, 3.5], "ori": 0 },
        { "type": "concrete_wall_ext_6", "pos": [48, -32.4], "ori": 0 },
        { "type": "metal_wall_ext_thicker_20", "pos": [38.5, -35.9], "ori": 1 },
        { "type": "metal_wall_ext_thicker_13", "pos": [42, -29.2], "ori": 1 },
        { "type": "metal_wall_ext_thicker_8", "pos": [34, -26.7], "ori": 0 },
        { "type": "metal_wall_ext_thicker_8", "pos": [27, -33.4], "ori": 0 },
        { "type": "metal_wall_ext_thicker_11", "pos": [20, -30.9], "ori": 1 },
        { "type": "metal_wall_ext_thicker_18", "pos": [23.5, -23.9], "ori": 1 }
      ]
    },
    "bunker_hydra_compartment_02": {
      "name": "Hydra bunker",
      "objects": [
        { "type": "metal_wall_ext_thicker_21", "pos": [-17, 21.75], "ori": 1 },
        { "type": "metal_wall_ext_thicker_21", "pos": [12, 21.75], "ori": 1 },
        { "type": "metal_wall_ext_thicker_42", "pos": [-26, -0.5], "ori": 0 },
        { "type": "metal_wall_ext_thicker_29", "pos": [21, 6], "ori": 0 },
        { "type": "metal_wall_ext_thicker_6", "pos": [-19, -18.5], "ori": 0 },
        { "type": "metal_wall_ext_thicker_4", "pos": [-18.5, -14], "ori": 1 },
        { "type": "metal_wall_ext_thicker_5", "pos": [-15, -15], "ori": 0 },
        { "type": "metal_wall_ext_thicker_9", "pos": [-9, -16], "ori": 1 },
        { "type": "metal_wall_ext_thicker_9", "pos": [4, -16], "ori": 1 },
        { "type": "metal_wall_ext_thicker_5", "pos": [10, -15], "ori": 0 },
        { "type": "metal_wall_ext_thicker_11", "pos": [17, -14], "ori": 1 },
        { "type": "metal_wall_column_5x12", "pos": [-14.5, 13], "ori": 1 },
        { "type": "metal_wall_column_5x12", "pos": [9.5, 13], "ori": 1 },
        { "type": "control_panel_03", "pos": [-7, 12], "ori": 1 },
        { "type": "control_panel_03", "pos": [2, 12], "ori": 3 },
        { "type": "metal_wall_ext_4", "pos": [-9, 8.5], "ori": 0 },
        { "type": "metal_wall_ext_4", "pos": [4, 8.5], "ori": 0 },
        { "type": "crate_01", "pos": [-17.5, 7.75], "ori": 0 },
        { "type": "crate_01", "pos": [12.5, 7.75], "ori": 0 }
      ]
    },
    "bunker_chrys_compartment_01b": {
      "name": "Chrysanthemum bunker",
      "objects": [
        { "type": "metal_wall_ext_thicker_4", "pos": [-11, -2], "ori": 1 },
        { "type": "metal_wall_ext_thicker_4", "pos": [-11, 1], "ori": 1 },
        { "type": "metal_wall_ext_thicker_27", "pos": [0.5, -9], "ori": 1 },
        { "type": "metal_wall_ext_thicker_42", "pos": [15.5, 10.5], "ori": 0 },
        { "type": "metal_wall_ext_thicker_34", "pos": [-7.5, 17], "ori": 0 },
        { "type": "metal_wall_column_4x8", "pos": [-3.5, 14.5], "ori": 1 },
        { "type": "metal_wall_column_4x8", "pos": [11.5, 14.5], "ori": 1 }
      ]
    }
  }
};
