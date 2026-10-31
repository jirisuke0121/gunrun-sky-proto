export const GRIP_ROUND_TRIPS = 3;
export const GRIP_TURNS = GRIP_ROUND_TRIPS * 2;
export const MAX_GRIP_SECONDS = 8;
export const GRIP_SLIP_SECONDS = .70;
export const GRIP_LET_GO_SECONDS = .32;
const clamp = x => Math.max(0, Math.min(1, x));

// Count opposite, substantial pendulum reversals rather than rendering frames
// or jump inputs. The time limit also covers a stopped/degenerate pendulum.
export function advanceGrip(grip, dt, previousOmega) {
  grip.heldSeconds += dt;
  if (previousOmega * grip.omega < 0 && Math.abs(grip.angle) >= .25) {
    const side = Math.sign(grip.angle);
    if (side !== grip.turnSide) { grip.turns++; grip.turnSide = side; }
  }
  const arc = clamp((grip.omega >= 0 ? grip.angle + 1.1 : 1.1 - grip.angle) / 2.2);
  grip.fatigue = clamp(Math.max((grip.turns + arc - 3) / 3, (grip.heldSeconds - 6) / 2));
  return grip.turns >= GRIP_TURNS || grip.heldSeconds >= MAX_GRIP_SECONDS;
}
