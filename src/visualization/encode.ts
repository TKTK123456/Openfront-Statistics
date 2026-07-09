import {
  AVERROR_EAGAIN,
  AVERROR_EOF,
  AV_CODEC_ID_H264,
  AV_PIX_FMT_YUV420P,
  AV_CODEC_FLAG_GLOBAL_HEADER,
  Codec,
  CodecContext,
  FormatContext,
  Frame,
  Packet,
  Rational,
  Stream,
  FFmpegError,
  AVCodecFlag,
  avRescaleQ,
} from "node-av";

/* ----------------------------
 * Output stream
 * ---------------------------- */

interface OutputStream {
  st: Stream | null;
  enc: CodecContext | null;

  frame: Frame | null;
  pkt: Packet | null;

  nextPts: bigint;
}

/* ----------------------------
 * RGBA → YUV420P
 * ---------------------------- */

function rgbaToYuv420P(rgba: Uint8ClampedArray, w: number, h: number) {
  const frameSize = w * h;
  const yuv = new Uint8Array(frameSize + frameSize / 2);

  let y = 0;
  let u = frameSize;
  let v = frameSize + frameSize / 4;

  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const p = (j * w + i) * 4;

      const r = rgba[p];
      const g = rgba[p + 1];
      const b = rgba[p + 2];

      const Y = 0.257 * r + 0.504 * g + 0.098 * b + 16;
      const U = -0.148 * r - 0.291 * g + 0.439 * b + 128;
      const V = 0.439 * r - 0.368 * g - 0.071 * b + 128;

      yuv[y++] = Y;

      if (i % 2 === 0 && j % 2 === 0) {
        yuv[u++] = U;
        yuv[v++] = V;
      }
    }
  }

  return yuv;
}

/* ----------------------------
 * Copy to frame planes
 * ---------------------------- */

function copyToFrame(frame: Frame, yuv: Uint8Array, w: number, h: number) {
  const size = w * h;
  const chroma = size >> 2;

  const Y = yuv.subarray(0, size);
  const U = yuv.subarray(size, size + chroma);
  const V = yuv.subarray(size + chroma);

  const data = frame.data!;
  const linesize = frame.linesize!;

  for (let j = 0; j < h; j++) {
    data[0].set(Y.subarray(j * w, (j + 1) * w), j * linesize[0]);
  }

  const cw = w >> 1;
  const ch = h >> 1;

  for (let j = 0; j < ch; j++) {
    data[1].set(U.subarray(j * cw, (j + 1) * cw), j * linesize[1]);

    data[2].set(V.subarray(j * cw, (j + 1) * cw), j * linesize[2]);
  }
}

/* ----------------------------
 * Encode/write frame (mux-style)
 * ---------------------------- */

async function writeFrame(
  oc: FormatContext,
  ost: OutputStream,
  frame: Frame | null,
) {
  const enc = ost.enc!;
  const pkt = ost.pkt!;

  let ret = await enc.sendFrame(frame);
  FFmpegError.throwIfError(ret);

  while (true) {
    ret = await enc.receivePacket(pkt);

    if (ret === AVERROR_EAGAIN || ret === AVERROR_EOF) break;
    FFmpegError.throwIfError(ret);

    pkt.rescaleTs(enc.timeBase, ost.st!.timeBase);
    pkt.streamIndex = ost.st!.index;

    ret = await oc.interleavedWriteFrame(pkt);
    FFmpegError.throwIfError(ret);
  }
}

/* ----------------------------
 * Get frame
 * ---------------------------- */

function getFrame(
  ost: OutputStream,
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  fps: number,
): Frame {
  const frame = ost.frame!;
  frame.makeWritable();

  const yuv = rgbaToYuv420P(rgba, w, h);
  copyToFrame(frame, yuv, w, h);

  frame.pts = avRescaleQ(ost.nextPts, new Rational(1, fps), ost.enc!.timeBase);

  ost.nextPts++;
  return frame;
}

/* ----------------------------
 * Setup H264 stream
 * ---------------------------- */

function addH264Stream(
  oc: FormatContext,
  ost: OutputStream,
  w: number,
  h: number,
  fps: number,
) {
  const st = oc.newStream(null);
  if (!st) throw new Error("Failed stream");

  const enc = new CodecContext();
  enc.allocContext3(Codec.findEncoder(AV_CODEC_ID_H264)!);

  // HARD-CODED H264 SETTINGS
  enc.codecId = AV_CODEC_ID_H264;
  enc.width = w;
  enc.height = h;
  enc.pixelFormat = AV_PIX_FMT_YUV420P;

  enc.timeBase = new Rational(1, fps);
  st.timeBase = enc.timeBase;

  enc.gopSize = 12;
  //enc.bitRate = 800000n;

  // REQUIRED for MP4/MKV when using H264
  if ((oc.oformat!.flags & AV_CODEC_FLAG_GLOBAL_HEADER) !== 0) {
    enc.flags = (enc.flags | AV_CODEC_FLAG_GLOBAL_HEADER) as AVCodecFlag;
  }

  ost.st = st;
  ost.enc = enc;
}

/* ----------------------------
 * Open encoder
 * ---------------------------- */

async function openH264(ost: OutputStream) {
  const ret = await ost.enc!.open2(Codec.findEncoder(AV_CODEC_ID_H264)!, null);

  FFmpegError.throwIfError(ret);

  ost.frame = new Frame();
  ost.frame.alloc();
  ost.frame.format = AV_PIX_FMT_YUV420P;
  ost.frame.width = ost.enc!.width;
  ost.frame.height = ost.enc!.height;

  const ret2 = ost.frame.getBuffer(0);
  FFmpegError.throwIfError(ret2);

  ost.pkt = new Packet();
  ost.pkt.alloc();
}

/* ----------------------------
 * Main encode function
 * ---------------------------- */

/**
 * Streaming H264 encoder: open once, write frames one at a time, close. Lets
 * callers render and encode frame-by-frame instead of holding every RGBA frame
 * in memory (a full timelapse of a large map is tens of GB otherwise).
 */
export class VideoEncoder {
  private ost: OutputStream = {
    st: null,
    enc: null,
    frame: null,
    pkt: null,
    nextPts: 0n,
  };
  private oc!: FormatContext;

  constructor(
    private output: string,
    private w: number,
    private h: number,
    private fps: number,
  ) {}

  async open() {
    this.oc = new FormatContext();
    FFmpegError.throwIfError(
      this.oc.allocOutputContext2(null, null, this.output),
    );
    addH264Stream(this.oc, this.ost, this.w, this.h, this.fps);
    await openH264(this.ost);
    FFmpegError.throwIfError(
      this.ost.enc!.parametersFromContext(this.ost.st!.codecpar),
    );
    this.oc.dumpFormat(0, this.output, true);
    if ((this.oc.oformat!.flags & 1) === 0) await this.oc.openOutput();
    FFmpegError.throwIfError(await this.oc.writeHeader(null));
  }

  async writeFrame(rgba: Uint8ClampedArray) {
    const frame = getFrame(this.ost, rgba, this.w, this.h, this.fps);
    await writeFrame(this.oc, this.ost, frame);
  }

  async close() {
    await writeFrame(this.oc, this.ost, null); // flush
    await this.oc.writeTrailer();
    if ((this.oc.oformat!.flags & 1) === 0) await this.oc.closeOutput();
    this.oc.freeContext();
  }
}

export async function encodeVideo(
  output: string,
  frames: Uint8ClampedArray[],
  w: number,
  h: number,
  fps: number,
) {
  const encoder = new VideoEncoder(output, w, h, fps);
  await encoder.open();
  for (const rgba of frames) {
    await encoder.writeFrame(rgba);
  }
  await encoder.close();
}
