async function start(gameID: string): Promise<void> {
  const frameCache = new Map<number, Uint8Array>();

  const socket: globalThis.WebSocket = new WebSocket(
    `ws://${location.host}/ws`,
  );
  socket.binaryType = "arraybuffer";

  const status = document.getElementById("status") as HTMLDivElement;
  const progress = document.getElementById("progress") as HTMLProgressElement;

  const conquered = document.getElementById("conquered") as HTMLImageElement;
  const trade = document.getElementById("trade") as HTMLImageElement;
  const pirating = document.getElementById("pirating") as HTMLImageElement;

  const canvas = document.getElementById("map") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;

  const tradeCanvas = document.getElementById(
    "tradeRouteMap",
  ) as HTMLCanvasElement;
  const tradeCtx = canvas.getContext("2d")!;

  const frameSlider = document.getElementById(
    "frameSlider",
  ) as HTMLInputElement;

  let width = 0;
  let height = 0;

  let frame = 0;
  let totalFrames = 0;
  let loadedFrames = 0;

  const bg = new Image();

  function drawPngBufferToCanvas(
    buffer: Uint8Array | ArrayBuffer,
    whichCanvas: number,
  ): void {
    const blob = new Blob([buffer as BlobPart], {
      type: "image/png",
    });

    const url = URL.createObjectURL(blob);

    const img = new Image();

    img.onload = () => {
      if (whichCanvas === 0) {
        canvas.width = img.width;
        canvas.height = img.height;

        ctx.drawImage(img, 0, 0);
      } else {
        tradeCanvas.width = img.width;
        tradeCanvas.height = img.height;
        tradeCtx.drawImage(img, 0, 0);
      }
      URL.revokeObjectURL(url);
    };

    img.src = url;
  }

  socket.onopen = () => {
    socket.send(
      JSON.stringify({
        type: "runGame",
        gameId: gameID,
      }),
    );
  };

  socket.onmessage = ({ data }: MessageEvent): void => {
    if (data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(data);

      const type = bytes[0];

      if (type === 3) {
        const view = new DataView(data);

        const frameIndex = view.getUint32(1, true);

        const img = bytes.slice(5);

        if (!frameCache.has(frameIndex)) {
          loadedFrames++;

          if (loadedFrames < totalFrames) {
            status.textContent = `Loading frames... ${loadedFrames}/${totalFrames}`;
          } else {
            status.textContent = `Done loading ${totalFrames} frames`;
          }
        }

        frameCache.set(frameIndex, img);

        if (frame === frameIndex) {
          drawPngBufferToCanvas(img, 0);
        }
      } else if (type === 4) {
      } else {
        const imageBytes = bytes.slice(1);

        const blob = new Blob([imageBytes], {
          type: "image/png",
        });

        const url = URL.createObjectURL(blob);

        switch (type) {
          case 0:
            conquered.src = url;
            break;

          case 1:
            trade.src = url;
            break;

          case 2:
            pirating.src = url;
            break;
          case 5:
            bg.src = url;
            break;
        }
      }

      return;
    }

    const msg = JSON.parse(data);

    switch (msg.type) {
      case "status":
        status.textContent = msg.message;
        break;

      case "progress":
        progress.value = msg.value;
        break;

      case "finished":
        loadGame(msg.data);
        drawFrame(0);
        break;

      case "error":
        status.textContent = msg.error;
        console.error(msg.error);
        break;
    }
  };

  function loadGame(data: {
    width: number;
    height: number;
    frameCount: number;
  }): void {
    status.textContent = "Finished!";
    progress.value = 100;

    width = data.width;
    height = data.height;

    canvas.width = width;
    canvas.height = height;

    totalFrames = data.frameCount;

    frameSlider.max = String(totalFrames - 1);
    frameSlider.value = "0";
  }

  function drawFrame(index: number): void {
    const frameData = frameCache.get(index);

    if (frameData !== undefined) {
      drawPngBufferToCanvas(frameData, 0);
    }
  }

  function nextFrame(): void {
    if (frame < totalFrames - 1) {
      frame++;

      frameSlider.value = String(frame);
      drawFrame(frame);
    }
  }

  function previousFrame(): void {
    if (frame > 0) {
      frame--;

      frameSlider.value = String(frame);
      drawFrame(frame);
    }
  }

  let isPlaying = false;
  let lastFrameTime = 0;

  function playVideo(): void {
    if (loadedFrames < totalFrames) {
      return;
    }

    if (isPlaying) {
      return;
    }

    isPlaying = true;
    requestAnimationFrame(playLoop);
  }

  function playLoop(time: number): void {
    if (!isPlaying) {
      return;
    }

    if (time - lastFrameTime >= 1000 / 30) {
      if (frame >= totalFrames - 1) {
        stopVideo();
        return;
      }

      frame++;

      frameSlider.value = String(frame);
      drawFrame(frame);

      lastFrameTime = time;
    }

    requestAnimationFrame(playLoop);
  }

  function stopVideo(): void {
    isPlaying = false;
  }

  frameSlider.addEventListener("input", () => {
    frame = Number(frameSlider.value);
    drawFrame(frame);
  });
}
start(window.gameId);
