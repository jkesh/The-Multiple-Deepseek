// ../The-Multiple-Deepseek/src/invariant.ts
var PACKAGE_NAME = "@deepseek-ai/dsh-multiple-deepseek";
var name = "multiple-deepseek-invariant";
var inject = ["invariants"];
var install = () => {
};
var apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
export {
  apply,
  inject,
  name
};
