const WS_PATH = "/api/websocket";

export type FahWsCommand = "pause" | "fold" | "finish";

export async function sendFahControlCommand(
  command: FahWsCommand,
  host = process.env.FAH_WS_HOST ?? "127.0.0.1",
  port = Number(process.env.FAH_WS_PORT ?? "7396"),
): Promise<{ ok: boolean; message: string }> {
  const url = `ws://${host}:${port}${WS_PATH}`;
  const payload = JSON.stringify({ cmd: "state", state: command });

  return new Promise((resolve) => {
    let settled = false;
    const done = (result: { ok: boolean; message: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    const timer = setTimeout(
      () => done({ ok: false, message: "FAH WebSocket timeout" }),
      8_000,
    );

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      done({
        ok: false,
        message: "FAH WebSocket unavailable (is fah-client running?)",
      });
      return;
    }

    ws.addEventListener("open", () => {
      ws.send(payload);
      setTimeout(
        () =>
          done({
            ok: true,
            message: `FAH ${command} command sent`,
          }),
        400,
      );
    });

    ws.addEventListener("error", () =>
      done({
        ok: false,
        message: "FAH WebSocket error (is fah-client running on port 7396?)",
      }),
    );
  });
}
