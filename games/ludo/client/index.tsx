import React, { useEffect, useState } from "react";
import type { GameProps } from "@low-stress/sdk";
import { Lobby } from "./Lobby";
import { Room } from "./Room";

function getRoomIdFromPath(): string | null {
  if (typeof window === "undefined") return null;
  const parts = window.location.pathname.split("/").filter(Boolean);
  // Match e.g. ["games", "ludo", "<roomId>"]
  const ludoIdx = parts.indexOf("ludo");
  if (ludoIdx >= 0 && parts[ludoIdx + 1]) {
    return parts[ludoIdx + 1]!;
  }
  return null;
}

export function LudoClient(props: GameProps) {
  const [roomId, setRoomId] = useState<string | null>(() => getRoomIdFromPath());

  useEffect(() => {
    const onPopState = () => {
      setRoomId(getRoomIdFromPath());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleOpenRoom = (id: string) => {
    window.history.pushState({}, "", `/games/ludo/${id}`);
    setRoomId(id);
  };

  const handleBackToLobby = () => {
    window.history.pushState({}, "", "/games/ludo");
    setRoomId(null);
  };

  if (roomId) {
    return <Room {...props} roomId={roomId} onBack={handleBackToLobby} />;
  }

  return <Lobby {...props} onOpenRoom={handleOpenRoom} />;
}

export default LudoClient;
