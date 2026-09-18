import { parseGIF, decompressFrames } from 'gifuct-js';
import { REACTIONS, type Pose } from './recognition';
type Sprite = { source: CanvasImageSource; width: number; height: number; frame: (time: number) => CanvasImageSource };
export async function loadSprites(): Promise<Map<Pose, Sprite>> {
  const result = new Map<Pose, Sprite>();
  await Promise.all(REACTIONS.map(async reaction => {
    const url = import.meta.env.BASE_URL + 'memes/' + reaction.file;
    if (!reaction.file.endsWith('.gif')) {
      const img = new Image(); img.src = url; await img.decode();
      result.set(reaction.id, { source: img, width: img.naturalWidth, height: img.naturalHeight, frame: () => img }); return;
    }
    const response = await fetch(url); if (!response.ok) throw new Error('Could not load a meme image.');
    const gif = parseGIF(await response.arrayBuffer());
    const frames = decompressFrames(gif, true);
    const canvas = document.createElement('canvas'); canvas.width = gif.lsd.width; canvas.height = gif.lsd.height;
    const ctx = canvas.getContext('2d')!;
    const patch = document.createElement('canvas'), patchCtx = patch.getContext('2d')!;
    let total = 0;
    const rendered: { canvas: HTMLCanvasElement; end: number }[] = [];
    for (const f of frames) {
      const before = f.disposalType === 3 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
      patch.width = f.dims.width; patch.height = f.dims.height;
      const pixels = patchCtx.createImageData(patch.width, patch.height); pixels.data.set(f.patch); patchCtx.putImageData(pixels, 0, 0);
      ctx.drawImage(patch, f.dims.left, f.dims.top);
      // Bound decoded frame memory on mobile while preserving animation/alpha.
      const saved = document.createElement('canvas'); const scale = Math.min(1, 240 / Math.max(canvas.width, canvas.height));
      saved.width = Math.round(canvas.width * scale); saved.height = Math.round(canvas.height * scale);
      saved.getContext('2d')!.drawImage(canvas, 0, 0, saved.width, saved.height);
      total += Math.max(20, f.delay || 100); rendered.push({ canvas: saved, end: total });
      if (f.disposalType === 2) ctx.clearRect(f.dims.left, f.dims.top, f.dims.width, f.dims.height);
      if (before) ctx.putImageData(before, 0, 0);
    }
    if (!rendered.length) throw new Error('Broken meme GIF.');
    result.set(reaction.id, { source: rendered[0].canvas, width: canvas.width, height: canvas.height, frame: time => rendered.find(f => f.end > time % total)!.canvas });
  }));
  return result;
}
