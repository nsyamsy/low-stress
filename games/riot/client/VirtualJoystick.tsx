import { useEffect, useRef, useState } from "react";

export interface JoystickMovement {
  dx: number;
  dy: number;
}

export interface VirtualJoystickProps {
  onMove: (movement: JoystickMovement) => void;
  disabled?: boolean;
}

export function VirtualJoystick({ onMove, disabled = false }: VirtualJoystickProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const activeKeys = useRef(new Set<string>());

  // Keyboard WASD and Arrow key listener
  useEffect(() => {
    if (disabled) return;
    const keys = activeKeys.current;

    const updateFromKeys = () => {
      let kx = 0;
      let ky = 0;
      if (keys.has("KeyW") || keys.has("ArrowUp")) ky += 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) ky -= 1;
      if (keys.has("KeyA") || keys.has("ArrowLeft")) kx -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) kx += 1;

      const len = Math.hypot(kx, ky);
      if (len > 0) {
        onMove({ dx: kx / len, dy: ky / len });
      } else if (!isDragging) {
        onMove({ dx: 0, dy: 0 });
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        keys.add(e.code);
        updateFromKeys();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (keys.has(e.code)) {
        keys.delete(e.code);
        updateFromKeys();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      keys.clear();
    };
  }, [disabled, isDragging, onMove]);

  // Pointer / Touch handler for circular joystick (radius 48px)
  const maxRadius = 48;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    handlePointerMove(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || disabled || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const rawDx = e.clientX - centerX;
    const rawDy = -(e.clientY - centerY); // Invert Y so up is positive
    const dist = Math.hypot(rawDx, rawDy);

    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(rawDy, rawDx);

    const knobX = Math.cos(angle) * clampedDist;
    const knobY = -Math.sin(angle) * clampedDist; // visual knob offset

    setKnobPos({ x: knobX, y: knobY });

    const normalizedMagnitude = clampedDist / maxRadius;
    onMove({
      dx: Math.cos(angle) * normalizedMagnitude,
      dy: Math.sin(angle) * normalizedMagnitude,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setIsDragging(false);
    setKnobPos({ x: 0, y: 0 });
    if (activeKeys.current.size === 0) {
      onMove({ dx: 0, dy: 0 });
    }
  };

  return (
    <div className="flex flex-col items-center justify-center select-none touch-none">
      {/* Joystick base circle: 120px (touch area exceeds 44px minimum) */}
      <div
        ref={containerRef}
        aria-label="Virtual Joystick"
        role="slider"
        aria-valuenow={Math.round(Math.hypot(knobPos.x, knobPos.y))}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative w-28 h-28 rounded-full border-2 border-border bg-card/60 backdrop-blur-sm flex items-center justify-center cursor-pointer shadow-inner active:scale-95 transition-transform"
      >
        {/* Knob indicator (≥ 44px min touch target) */}
        <div
          className="w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-md transition-transform pointer-events-none flex items-center justify-center font-bold text-xs"
          style={{
            transform: `translate3d(${knobPos.x}px, ${knobPos.y}px, 0)`,
          }}
        >
          <span className="sr-only">Stick</span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground mt-2">WASD / Stick</span>
    </div>
  );
}
