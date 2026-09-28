export interface MoveVector {
  x: number;
  z: number;
}

const KEY_TO_DIR: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

export class InputManager {
  private keys = new Set<string>();
  private interactQueued = false;
  private joystick: MoveVector = { x: 0, z: 0 };
  private joystickActive = false;
  private touchAreaEl: HTMLElement;
  private stickBaseEl: HTMLElement;
  private stickKnobEl: HTMLElement;
  private activeTouchId: number | null = null;
  private baseX = 0;
  private baseY = 0;

  constructor(touchAreaEl: HTMLElement, stickBaseEl: HTMLElement, stickKnobEl: HTMLElement) {
    this.touchAreaEl = touchAreaEl;
    this.stickBaseEl = stickBaseEl;
    this.stickKnobEl = stickKnobEl;

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'Enter') this.interactQueued = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    this.touchAreaEl.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    this.touchAreaEl.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    this.touchAreaEl.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    this.touchAreaEl.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
  }

  private onTouchStart(e: TouchEvent): void {
    e.preventDefault();
    if (this.activeTouchId !== null) return;
    const touch = e.changedTouches[0];
    this.activeTouchId = touch.identifier;
    const rect = this.stickBaseEl.getBoundingClientRect();
    this.baseX = rect.left + rect.width / 2;
    this.baseY = rect.top + rect.height / 2;
    this.joystickActive = true;
    this.updateStick(touch.clientX, touch.clientY);
  }

  private onTouchMove(e: TouchEvent): void {
    e.preventDefault();
    for (const touch of Array.from(e.changedTouches)) {
      if (touch.identifier === this.activeTouchId) this.updateStick(touch.clientX, touch.clientY);
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    for (const touch of Array.from(e.changedTouches)) {
      if (touch.identifier === this.activeTouchId) {
        this.activeTouchId = null;
        this.joystickActive = false;
        this.joystick = { x: 0, z: 0 };
        this.stickKnobEl.style.transform = 'translate(-50%, -50%)';
      }
    }
  }

  private updateStick(clientX: number, clientY: number): void {
    const maxRadius = 42;
    let dx = clientX - this.baseX;
    let dy = clientY - this.baseY;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    this.stickKnobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.joystick = { x: dx / maxRadius, z: dy / maxRadius };
  }

  get moveVector(): MoveVector {
    if (this.joystickActive) return this.joystick;
    let x = 0;
    let z = 0;
    for (const code of this.keys) {
      const dir = KEY_TO_DIR[code];
      if (dir) { x += dir[0]; z += dir[1]; }
    }
    const len = Math.hypot(x, z);
    return len > 0 ? { x: x / len, z: z / len } : { x: 0, z: 0 };
  }

  consumeInteract(): boolean {
    if (this.interactQueued) {
      this.interactQueued = false;
      return true;
    }
    return false;
  }

  queueInteract(): void {
    this.interactQueued = true;
  }
}
