import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  // Relative asset URLs make the same build work locally and at
  // https://mariommm123098.github.io/racing/.
  base: './',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
});
