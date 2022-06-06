module.exports = {
  name: `plugin-allow-scripts`,
  factory: (yarnRequire) => ({
    hooks: {
      afterAllInstalled: async () => {
        const { execute } = yarnRequire('@yarnpkg/shell');
        const exitCode = await execute('yarn run allow-scripts');

        if (exitCode !== 0) {
          // We have to use `process.exit` here rather than setting `process.exitCode`
          // because Yarn will override any exit code set in this hook.
          // eslint-disable-next-line node/no-process-exit
          process.exit(exitCode);
        }
      },
    },
  }),
};
