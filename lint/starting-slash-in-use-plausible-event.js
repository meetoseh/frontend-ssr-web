import * as tsutils from 'ts-api-utils';
import ts from 'typescript';

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'componentPath should start with a slash',
      recommended: true,
    },
    schema: [],
  },
  create: (context) => {
    return {
      CallExpression: (node) => {
        if (node.callee.type !== 'Identifier') return;
        if (node.callee.name !== 'sendPlausibleEvent' && node.callee.name !== 'usePlausibleEvent')
          return;

        const { arguments: args } = node;
        if (args.length < 2) return;

        const arg = args[1];
        if (arg.type !== 'ObjectExpression') return;

        const name = arg.properties.find((p) => p.key.name === 'name');
        if (!name) return;

        if (name.value.type !== 'Literal') return;
        if (typeof name.value.value !== 'string') return;

        const componentPath = arg.properties.find((p) => p.key.name === 'componentPath');

        if (name.value.value !== 'pageview') {
          // verify no componentPath
          if (!componentPath) return;

          context.report({
            node: componentPath,
            message: 'Not allowed except for pageview events.',
          });
          return;
        }

        if (!componentPath) {
          context.report({
            node: node,
            message: 'Missing componentPath.',
          });
          return;
        }

        if (componentPath.value.type !== 'Literal') {
          context.report({
            node: componentPath,
            message: 'componentPath must be a string literal.',
          });
          return;
        }

        if (typeof componentPath.value.value !== 'string') {
          context.report({
            node: componentPath,
            message: 'componentPath must be a string literal.',
          });
          return;
        }

        if (!componentPath.value.value.startsWith('/')) {
          context.report({
            node: componentPath,
            message: 'componentPath must start with a slash.',
          });
          return;
        }
      },
    };
  },
};

// I can't figure out how to import from utils in typescript-eslint so
// I translated over the relevant functions

function getTypeFlags(type) {
  let flags = 0;
  for (const t of tsutils.unionTypeParts(type)) {
    flags |= t.flags;
  }
  return flags;
}

function isTypeFlagSet(type, flagsToCheck) {
  return (getTypeFlags(type) & flagsToCheck) !== 0;
}
