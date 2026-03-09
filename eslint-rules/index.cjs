/**
 * Custom ESLint rules for Legal Armenia project
 */
const noNonAsciiLiterals = require('./no-non-ascii-literals.cjs');

module.exports = {
  rules: {
    'no-non-ascii-literals': noNonAsciiLiterals,
  },
};
