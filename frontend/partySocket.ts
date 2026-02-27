import PartySocket from "partysocket";

const PROJECT_HOST =
  import.meta.env.VITE_PARTYKIT_HOST ??
  (typeof window !== "undefined"
    ? window.location.host.replace(/^www\./, "")
    : "");

export type PartySocketOptions = {
  room: string;
  id?: string;
  onMessage?: (data: MessageEvent<string>) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (event: Event) => void;
};

export function createGameSocket({
  room,
  id,
  onMessage,
  onOpen,
  onClose,
  onError
}: PartySocketOptions): PartySocket {
  const socket = new PartySocket({
    host: PROJECT_HOST,
    room,
    id,
    party: "game",
    protocols: [],
    debug: import.meta.env.DEV
  });

  if (onMessage) {
    socket.addEventListener("message", onMessage);
  }
  if (onOpen) {
    socket.addEventListener("open", onOpen);
  }
  if (onClose) {
    socket.addEventListener("close", onClose);
  }
  if (onError) {
    socket.addEventListener("error", onError);
  }

  return socket;
}

