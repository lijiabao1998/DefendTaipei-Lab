// Bundle with esbuild for Node to run; these checks do not start the game.
import { keyOf, parseKey, tileBounds, tileDist, tileOf } from './grid';
import { lodFor } from './lod';

function check(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
  console.log(`  ok  ${message}`);
}

check(tileOf(-0.01, -256).join(',') === '-1,-1', 'negative coordinates use floor');
check(tileOf(256, 0).join(',') === '1,0', 'exact positive boundary enters next tile');
check(parseKey(keyOf(-2, 3)).join(',') === '-2,3', 'tile keys round-trip signed coordinates');
const b = tileBounds(-1, 0);
check(b.minx === -256 && b.maxx === 0 && b.minz === 0 && b.maxz === 256, 'signed tile bounds');
check(tileDist(0, 0, 256, 100) === 0 && tileDist(0, 0, 259, 260) === 5, 'distance uses nearest tile edge');
check(lodFor(500) === 'near' && lodFor(501) === 'mid' && lodFor(2001) === 'far', 'initial LOD thresholds');
check(lodFor(532, 'near') === 'near' && lodFor(533, 'near') === 'mid', 'near retains hysteresis outward');
check(lodFor(469, 'mid') === 'mid' && lodFor(468, 'mid') === 'near', 'mid retains hysteresis inward');
check(lodFor(2032, 'mid') === 'mid' && lodFor(2033, 'mid') === 'far', 'mid retains hysteresis outward');
check(lodFor(1969, 'far') === 'far' && lodFor(1968, 'far') === 'mid', 'far retains hysteresis inward');
check(
  lodFor(4000) === 'far' && lodFor(4001) === null && lodFor(4032, 'far') === 'far' && lodFor(4033, 'far') === null,
  'drop boundary honors hysteresis',
);
