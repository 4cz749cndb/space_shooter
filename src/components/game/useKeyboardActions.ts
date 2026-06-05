"use client";

import { useEffect, useRef } from "react";
import type { ActionState } from "@/game/simulation/types";

export function useKeyboardActions(active: boolean) {
  const actions = useRef<ActionState>({
    left: false,
    right: false,
    up: false,
    down: false,
    fire: false
  });

  useEffect(() => {
    const clearActions = () => {
      actions.current.left = false;
      actions.current.right = false;
      actions.current.up = false;
      actions.current.down = false;
      actions.current.fire = false;
    };

    if (!active) {
      clearActions();
      return;
    }

    const setAction = (event: KeyboardEvent, pressed: boolean) => {
      if (event.code === "ArrowLeft" || event.code === "KeyA") actions.current.left = pressed;
      if (event.code === "ArrowRight" || event.code === "KeyD") actions.current.right = pressed;
      if (event.code === "ArrowUp" || event.code === "KeyW") actions.current.up = pressed;
      if (event.code === "ArrowDown" || event.code === "KeyS") actions.current.down = pressed;
      if (event.code === "Space") {
        event.preventDefault();
        actions.current.fire = pressed;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => setAction(event, true);
    const handleKeyUp = (event: KeyboardEvent) => setAction(event, false);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      clearActions();
    };
  }, [active]);

  return actions;
}
