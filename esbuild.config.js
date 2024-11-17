const esbuild = require('esbuild');

esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    outdir: 'build',
    sourcemap: true,
    minify: true,
    external: [
        'fluent-ffmpeg',
        'whatsapp-web.js',
    ],
    target: 'node20',
    format: 'cjs',
}).catch(() => process.exit(1));