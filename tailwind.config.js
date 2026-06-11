/** Tailwind config for the LUCID project page.
 *  Build:  npx tailwindcss@3 -c tailwind.config.js -i src/input.css -o static/css/style.css --minify
 *  (run after editing classes in index.html or static/js/main.js)
 */
module.exports = {
  content: ['./index.html', './static/js/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fredoka', 'Inter', 'ui-sans-serif', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        blue: { brand: '#4A7BA6' },
        sage: { brand: '#7FB069' },
        coral: { brand: '#C97B7B' },
        mustard: { brand: '#E8B84A' },
        lavender: { brand: '#9B7BB8' },
        ink: '#0d1117',
      },
    },
  },
};
