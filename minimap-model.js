// North is -Z in both runtime maps. Read collision data, never rendered meshes
// or the design-only canyon XYZ (whose axes differ from the runtime).
export const MAP_SIZE = 384;
export const LEVEL_HEIGHT = 4;
// Saved Unity player prefab: orthographic size 20, square 256px target.
export const LOCAL_MAP_SPAN = 40;
export const LOCAL_MAP_SIZE = 256;
export function createMapModel(solids) {
  const boxes = solids.filter(b => b.type !== 'door' && [b.minX,b.maxX,b.minY,b.maxY,b.minZ,b.maxZ].every(Number.isFinite)
    && b.maxX > b.minX && b.maxZ > b.minZ && b.maxY > -30 && b.maxY < 100
    && b.maxX - b.minX < 400 && b.maxZ - b.minZ < 400).map(b => ({
      minX:b.minX, maxX:b.maxX, minY:b.minY, maxY:b.maxY, minZ:b.minZ, maxZ:b.maxZ,
      type:b.type, stair:!!b.walkStair, slope:!!b.slideSlope,
    }));
  if (!boxes.length) throw new Error('Minimap requires finite runtime terrain');
  const minX = Math.min(...boxes.map(b=>b.minX)), maxX = Math.max(...boxes.map(b=>b.maxX));
  const minZ = Math.min(...boxes.map(b=>b.minZ)), maxZ = Math.max(...boxes.map(b=>b.maxZ));
  const width=maxX-minX+6, depth=maxZ-minZ+6;
  const span = Math.max(width,depth);
  const bounds = { minX:minX-3, minZ:minZ-3, width, depth, span };
  const first = Math.min(0, Math.floor(Math.min(...boxes.map(b=>b.maxY))/LEVEL_HEIGHT));
  const last = Math.max(0, Math.floor(Math.max(...boxes.map(b=>b.maxY))/LEVEL_HEIGHT));
  return { boxes:boxes.sort((a,b)=>a.maxY-b.maxY), bounds,
    pixelWidth:Math.round(MAP_SIZE*width/span),pixelHeight:Math.round(MAP_SIZE*depth/span),
    levels:Array.from({length:last-first+1},(_,i)=>(i+first)*LEVEL_HEIGHT) };
}
export function projectPoint(position, bounds, size = MAP_SIZE) {
  return { x:(position.x-bounds.minX)/bounds.span*size, y:(position.z-bounds.minZ)/bounds.span*size };
}
export function localViewport(position, span=LOCAL_MAP_SPAN) {
  return { minX:position.x-span/2,minZ:position.z-span/2,width:span,depth:span,span };
}
export function rotateMapPoint(point,yaw,size=LOCAL_MAP_SIZE) {
  const centre=size/2,dx=point.x-centre,dy=point.y-centre,c=Math.cos(yaw),s=Math.sin(yaw);
  return {x:centre+dx*c-dy*s,y:centre+dx*s+dy*c};
}
export function nearbyMarkers(markers, bounds, yaw=0) {
  const cx=bounds.minX+bounds.span/2,cz=bounds.minZ+bounds.span/2;
  return markers.filter(m=>Math.hypot(m.world.x-cx,m.world.z-cz)<=bounds.span/2)
    .map(m=>({...m,...rotateMapPoint(projectPoint(m.world,bounds,LOCAL_MAP_SIZE),yaw)}));
}
export function levelAt(height, levels) {
  // Keep a small landing tolerance at band boundaries (e.g. a 3.9m platform).
  const value = Math.floor((height+.15)/LEVEL_HEIGHT)*LEVEL_HEIGHT;
  return levels.reduce((best,n)=>Math.abs(n-value)<Math.abs(best-value)?n:best,levels[0]);
}
export function liveMarkers(zombies, player, bounds) {
  // Includes distant, occluded, stunned, climbing and spawning enemies. Corpses
  // and recycled/removed entries are not live threats. No distance/vision filter.
  return zombies.filter(e=>!e.dead && e.remove !== true && e.hp !== 0 && e.pos
    && [e.pos.x,e.pos.y,e.pos.z].every(Number.isFinite)).map(e=>({
      ...projectPoint(e.pos,bounds), world:{x:e.pos.x,y:e.pos.y,z:e.pos.z},
      relative:e.pos.y-player.pos.y>2?'above':e.pos.y-player.pos.y< -2?'below':'same',
      stalker:!!e.stalker,
    }));
}
