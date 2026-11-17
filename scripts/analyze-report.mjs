import fs from 'fs';

const raw = fs.readFileSync('artifacts/performance/combat-stress-report.json', 'utf8');
const data = JSON.parse(raw);
const samples = [...data.samples];

console.log('Total samples recorded:', samples.length);
console.log('Summary metrics:', JSON.stringify(data.summary, null, 2));

// Sort by total frame time descending
samples.sort((a, b) => b.frameTimeMs - a.frameTimeMs);

console.log('\n--- TOP 20 WORST FRAMES (HIGHEST EXECUTION DURATION) ---');
for (let i = 0; i < Math.min(20, samples.length); i++) {
  const s = samples[i];
  console.log(
    `#${(i + 1).toString().padStart(2, ' ')} | Frame ${s.frame.toString().padStart(4, ' ')} | Total: ${s.frameTimeMs.toFixed(2).padStart(6, ' ')} ms ` +
    `(CPU Logic: ${s.cpuTimeMs.toFixed(2).padStart(5, ' ')} ms [${Math.round((s.cpuTimeMs / s.frameTimeMs) * 100)}%], ` +
    `WebGL Render: ${s.renderTimeMs.toFixed(2).padStart(5, ' ')} ms [${Math.round((s.renderTimeMs / s.frameTimeMs) * 100)}%]) | ` +
    `FPS Equiv: ${s.fps.toString().padStart(3, ' ')} | Event: ${s.event || '-'}`
  );
}

// Find average breakdown across all frames
let totalCpu = 0;
let totalRender = 0;
let totalFrame = 0;
for (const s of data.samples) {
  totalCpu += s.cpuTimeMs;
  totalRender += s.renderTimeMs;
  totalFrame += s.frameTimeMs;
}
const n = data.samples.length;
console.log('\n--- OVERALL AVERAGES ---');
console.log(`Average Frame Work Time: ${(totalFrame / n).toFixed(2)} ms`);
console.log(`Average CPU Logic Time:  ${(totalCpu / n).toFixed(2)} ms (${Math.round((totalCpu / totalFrame) * 100)}%)`);
console.log(`Average WebGL Render:    ${(totalRender / n).toFixed(2)} ms (${Math.round((totalRender / totalFrame) * 100)}%)`);

// Events table
console.log('\n--- COMBAT EVENTS SAMPLES ---');
for (const s of data.samples) {
  if (s.event) {
    console.log(
      `Event: ${s.event.padEnd(25, ' ')} | Frame ${s.frame} | Total: ${s.frameTimeMs.toFixed(2)} ms (CPU: ${s.cpuTimeMs.toFixed(2)} ms, Render: ${s.renderTimeMs.toFixed(2)} ms)`
    );
  }
}
