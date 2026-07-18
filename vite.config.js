import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs make the same build work locally and at
  // https://mariommm123098.github.io/racing/.
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
