/**
 * ESLint rule to enforce Unicode escape sequences for non-ASCII characters
 * This ensures Armenian, Cyrillic, and other non-Latin characters are properly encoded
 */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce Unicode escape sequences for non-ASCII characters in strings',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: 'code',
    schema: [],
    messages: {
      nonAsciiLiteral: 'Non-ASCII character "{{char}}" found. Use Unicode escape sequence "{{escape}}" instead.',
    },
  },
  create(context) {
    // Regex to match non-ASCII characters (Armenian, Cyrillic, etc.)
    const nonAsciiRegex = /[^\x00-\x7F]/g;

    function checkString(node, value) {
      if (typeof value !== 'string') return;

      const matches = value.match(nonAsciiRegex);
      if (!matches) return;

      // Get unique characters
      const uniqueChars = [...new Set(matches)];

      uniqueChars.forEach((char) => {
        const escape = '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase();
        
        context.report({
          node,
          messageId: 'nonAsciiLiteral',
          data: {
            char,
            escape,
          },
          fix(fixer) {
            const raw = node.raw || (node.type === 'TemplateElement' ? node.value.raw : null);
            if (!raw) return null;

            // Replace all non-ASCII characters with their Unicode escapes
            let fixed = raw;
            const allMatches = raw.match(nonAsciiRegex);
            if (allMatches) {
              allMatches.forEach((c) => {
                const esc = '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase();
                fixed = fixed.split(c).join(esc);
              });
            }

            return fixer.replaceText(node, fixed);
          },
        });
      });
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string') {
          checkString(node, node.value);
        }
      },
      TemplateElement(node) {
        checkString(node, node.value.cooked);
      },
    };
  },
};
