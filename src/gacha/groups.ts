import { interactionGroups } from '@react-three/rapier';

// 0 hopper statics + disc, 1 chute statics + flap, 2 capsules in the hopper, 3 capsules in the chute.
export const G = {
  hopperStatic: interactionGroups(0, [2]),
  chuteStatic: interactionGroups(1, [3]),
  capsuleHopper: interactionGroups(2, [0, 2]),
  capsuleChute: interactionGroups(3, [1, 3]),
  catchFloor: interactionGroups([0, 1], [2, 3]),
};
