/** 将任意浏览器录音 Blob 转成 16-bit PCM WAV，便于火山 ASR（仅支持 wav/mp3/ogg） */

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const { numberOfChannels, length } = buffer;
  if (numberOfChannels === 1) return buffer.getChannelData(0).slice(0);
  const out = new Float32Array(length);
  for (let c = 0; c < numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) out[i]! += ch[i]! / numberOfChannels;
  }
  return out;
}

export async function blobToWavBlob(blob: Blob): Promise<Blob> {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const ab = await blob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(ab.slice(0));
    const mono = mixToMono(decoded);
    // 降到 16k，体积更小、ASR 更稳
    const targetRate = 16000;
    let samples = mono;
    let rate = decoded.sampleRate;
    if (rate !== targetRate && mono.length > 0) {
      const ratio = rate / targetRate;
      const newLen = Math.max(1, Math.floor(mono.length / ratio));
      const resampled = new Float32Array(newLen);
      for (let i = 0; i < newLen; i++) {
        resampled[i] = mono[Math.min(mono.length - 1, Math.floor(i * ratio))]!;
      }
      samples = resampled;
      rate = targetRate;
    }
    return new Blob([encodeWav(samples, rate)], { type: "audio/wav" });
  } finally {
    void ctx.close();
  }
}
