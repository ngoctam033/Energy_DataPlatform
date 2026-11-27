const base = require('/data/settings.base.js');
module.exports = {
  ...base,
  contextStorage: {
    ...(base.contextStorage || {}),
    default: 'memoryOnly',
    memoryOnly: {module:'memory'},
    file: {module:'localfilesystem',config:{flushInterval:1}}
  },
  functionGlobalContext: {
    ...(base.functionGlobalContext || {}),
    simulationIO: require('/simulation/node-red/io.cjs')
  }
};
