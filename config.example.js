/* Copy the module entry into your existing MagicMirror config's modules array.
 * Replace placeholders locally. Standalone check:
 * npm run check -- ./config.example.js
 */
module.exports = {
  modules: [{
    module: "MMM-CARL",
    position: "top_right",
    header: "Library loans",
    config: {
      accounts: [
        { name: "My library", card: "YOUR_LIBRARY_CARD", password: "YOUR_PASSWORD_OR_PIN" }
      ],
      // For surname-based login, replace password with lastName: "YOUR_LAST_NAME".
      catalogUrl: "https://catalogplus.libraryweb.org",
      showCovers: true,
      width: "360px",
      maxItems: 10
    }
  }]
};
