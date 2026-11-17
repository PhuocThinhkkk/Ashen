const fs = require('fs');
const path = require('path');

module.exports = function ({ types: t }) {
  return {
    visitor: {
      ImportDeclaration(p, state) {
        const src = p.node.source.value;
        if (src.includes('.glsl') && (src.includes('?raw') || src.endsWith('.glsl'))) {
          const rawPath = src.replace(/\?raw$/, '');
          const filename = state.filename || state.file?.opts?.filename;
          if (!filename) return;

          const dirname = path.dirname(filename);
          const fullPath = path.resolve(dirname, rawPath);

          if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const defaultSpecifier = p.node.specifiers.find((s) => t.isImportDefaultSpecifier(s));
            if (defaultSpecifier) {
              const varName = defaultSpecifier.local.name;
              p.replaceWith(
                t.variableDeclaration('const', [
                  t.variableDeclarator(t.identifier(varName), t.stringLiteral(content)),
                ]),
              );
            }
          }
        }
      },
    },
  };
};
