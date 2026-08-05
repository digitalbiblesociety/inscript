import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', d => { err += d; });
    child.on('error', () => reject(new Error('ffmpeg not found. Install it, or drop --gif.')));
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}):\n${err.trim()}`));
    });
  });
}

function hasGifsicle() {
  return new Promise(resolve => {
    const child = spawn('gifsicle', ['--version'], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', code => resolve(code === 0));
  });
}

export async function makeGif(videoPath, gifPath, { width, fps, colors }) {
  const palette = `${gifPath}.palette.png`;
  const chain = `fps=${fps},mpdecimate,scale=${width}:-1:flags=lanczos`;

  await runFfmpeg(['-i', videoPath, '-vf',
    `${chain},palettegen=stats_mode=diff:max_colors=${colors}`, '-y', palette]);
  await runFfmpeg([
    '-i', videoPath, '-i', palette,
    '-lavfi', `${chain}[v];[v][1:v]paletteuse=dither=none:diff_mode=rectangle`,
    '-fps_mode', 'vfr', '-loop', '0', '-y', gifPath
  ]);
  await rm(palette, { force: true });

  if (await hasGifsicle()) {
    await new Promise((resolve, reject) => {
      const child = spawn('gifsicle', ['-O3', '--lossy=60', gifPath, '-o', gifPath], { stdio: 'ignore' });
      child.on('error', reject);
      child.on('close', code => (code === 0 ? resolve() : reject(new Error(`gifsicle failed (${code})`))));
    });
  }
}
