import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const VIDEO_EXT = /\.(mp4|mov|m4v|avi|mkv|webm)$/i;
const ROOT = new URL('..', import.meta.url).pathname;
const SOURCE = join(ROOT, 'video_sources');
const OUT = join(ROOT, 'static/videos');

const mappings = [
  ['hero', 'teaser.mp4', { speed: 1, keepAudio: true, crf: 24 }],
  ['real_world_rollouts/stirring/scenario_1', 'stirring_1.mp4'],
  ['real_world_rollouts/stirring/scenario_2', 'stirring_2.mp4'],
  ['real_world_rollouts/stirring/scenario_3', 'stirring_3.mp4'],
  ['real_world_rollouts/wiping/scenario_1', 'wiping_1.mp4'],
  ['real_world_rollouts/wiping/scenario_2', 'wiping_2.mp4'],
  ['real_world_rollouts/wiping/scenario_3', 'wiping_3.mp4'],
  ['real_world_rollouts/binning/scenario_1', 'binning_1.mp4'],
  ['real_world_rollouts/binning/scenario_2', 'binning_2.mp4'],
  ['real_world_rollouts/binning/scenario_3', 'binning_3.mp4'],
  ['embodiment_transfer/push_t/dex_hand', 'pusht_hand.mp4'],
  ['embodiment_transfer/push_t/parallel_jaw_gripper', 'pusht_gripper.mp4'],
  ['embodiment_transfer/cable_routing/dex_hand', 'cable_hand.mp4'],
  ['embodiment_transfer/cable_routing/parallel_jaw_gripper', 'cable_gripper.mp4'],
  ['closed_loop_vs_open_loop/closed_loop', 'closed_loop.mp4'],
  ['closed_loop_vs_open_loop/open_loop', 'open_loop.mp4'],
  ['scaling/2k_clips', 'scale_2k.mp4'],
  ['scaling/5k_clips', 'scale_5k.mp4'],
  ['scaling/20k_clips', 'scale_20k.mp4'],
];

const failureRoot = join(SOURCE, 'failure_cases');
if (existsSync(failureRoot)) {
  for (const entry of readdirSync(failureRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    mappings.push([`failure_cases/${entry.name}`, `failures/${entry.name}.mp4`]);
  }
}

function listClips(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && VIDEO_EXT.test(entry.name))
    .map((entry) => join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

function hasAudio(file) {
  const result = spawnSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_type',
    '-of', 'csv=p=0',
    file,
  ], { encoding: 'utf8' });
  return result.status === 0 && result.stdout.trim() === 'audio';
}

function atempoChain(speed) {
  if (speed === 1) return 'anull';
  const filters = [];
  let remaining = speed;
  while (remaining > 2) {
    filters.push('atempo=2');
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  filters.push(`atempo=${remaining.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`);
  return filters.join(',');
}

function compile(inputFiles, outputFile, options = {}) {
  mkdirSync(dirname(outputFile), { recursive: true });

  const speed = options.speed || 4;
  const keepAudio = !!options.keepAudio && inputFiles.every(hasAudio);
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  inputFiles.forEach((file) => args.push('-i', file));

  const chains = inputFiles.map((_, i) =>
    `[${i}:v]${speed === 1 ? '' : `setpts=PTS/${speed},`}fps=24,eq=gamma=1.23:contrast=1.02:saturation=1.02,scale=1280:720:force_original_aspect_ratio=decrease,` +
    `pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`
  );
  if (keepAudio) {
    inputFiles.forEach((_, i) => {
      chains.push(`[${i}:a]aresample=async=1:first_pts=0,${atempoChain(speed)}[a${i}]`);
    });
  }
  const concat = inputFiles.length === 1
    ? `[v0]null[v]${keepAudio ? ';[a0]anull[a]' : ''}`
    : `${inputFiles.map((_, i) => `[v${i}]`).join('')}${keepAudio ? inputFiles.map((_, i) => `[a${i}]`).join('') : ''}` +
      `concat=n=${inputFiles.length}:v=1:a=${keepAudio ? 1 : 0}[v]${keepAudio ? '[a]' : ''}`;

  args.push(
    '-filter_complex', `${chains.join(';')};${concat}`,
    '-map', '[v]',
    '-map_metadata', '-1',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', String(options.crf || 28),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart'
  );
  if (keepAudio) {
    args.push('-map', '[a]', '-c:a', 'aac', '-b:a', '160k');
  } else {
    args.push('-an');
  }
  args.push(outputFile);

  const result = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${outputFile}`);
  }
}

let compiled = 0;
let skipped = 0;

for (const mapping of mappings) {
  const [sourceRel, outputRel, options = {}] = mapping;
  const inputDir = join(SOURCE, sourceRel);
  const clips = listClips(inputDir);
  if (!clips.length) {
    skipped += 1;
    continue;
  }

  const outputFile = join(OUT, outputRel);
  console.log(`compile ${sourceRel} -> static/videos/${outputRel} (${clips.length} clip${clips.length === 1 ? '' : 's'})`);
  compile(clips, outputFile, options);
  compiled += 1;
}

console.log(`done: ${compiled} compiled, ${skipped} skipped`);
