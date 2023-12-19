import * as tsutils from 'ts-api-utils';
import ts from 'typescript';

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'You should pass thenable values to promise aggregators ' +
        '(Promise.race, Promise.all, Promise.allSettled). Typically, ' +
        'not doing this is a sign you either accidentally awaited the value ' +
        'previously, or you have a wrapped promise and are accidentally ' +
        'awaiting the wrapper rather than the actual promise.',
      recommended: true,
      url: 'https://github.com/typescript-eslint/typescript-eslint/issues/1804',
    },
    schema: [],
  },
  create: (context) => {
    const services = context.parserServices;
    const checker = services.program.getTypeChecker();

    return {
      CallExpression: (node) => {
        if (node.callee.type !== 'MemberExpression') return;
        if (node.callee.object.type !== 'Identifier') return;
        if (node.callee.object.name !== 'Promise') return;
        if (node.callee.property.type !== 'Identifier') return;

        const { name } = node.callee.property;
        if (!['race', 'all', 'allSettled'].includes(name)) return;

        const { arguments: args } = node;
        if (args.length !== 1) return;

        const arg = args[0];
        if (arg.type === 'ArrayExpression') {
          const { elements } = arg;
          if (elements.length === 0) return;

          for (const element of elements) {
            if (element === null) continue;
            const elementType = services.getTypeAtLocation(element);
            if (isTypeFlagSet(elementType, ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
              continue;
            }

            const originalNode = services.esTreeNodeToTSNodeMap.get(element);
            if (tsutils.isThenableType(checker, originalNode, elementType)) {
              continue;
            }

            context.report({
              node: element,
              message: 'Expected thenable value to be passed to promise aggregator.',
            });
          }
        } else {
          // check if the arg is typed as an array of thenables
          const argType = services.getTypeAtLocation(arg);
          if (isTypeFlagSet(argType, ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
            return;
          }

          if (!checker.isArrayType(argType)) {
            context.report({
              node: arg,
              message: 'Expected array passed to promise aggregator.',
            });
            return;
          }

          const typeArg = argType.typeArguments[0];
          if (isTypeFlagSet(typeArg, ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
            return;
          }

          const originalNode = services.esTreeNodeToTSNodeMap.get(arg);
          if (tsutils.isThenableType(checker, originalNode, typeArg)) {
            return;
          }

          context.report({
            node: arg,
            message: 'Expected array of thenable values passed to promise aggregator.',
          });
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
