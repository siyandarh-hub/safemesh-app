/** Used only to pre-build frontend/tailwind.css (npm run build:css). Nothing here runs in the browser. */
module.exports = {
  content: ['./frontend/index.html', './frontend/app.js'],
  theme: { extend: {} },
  plugins: [],
};
