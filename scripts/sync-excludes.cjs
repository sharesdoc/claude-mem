const { existsSync, readFileSync } = require('fs');
const path = require('path');

/** Return raw ignore patterns shared by rsync and the Windows file copier. */
function getGitignoreExcludes(basePath) {
  const gitignorePath = path.join(basePath, '.gitignore');
  if (!existsSync(gitignorePath)) return [];
  return readFileSync(gitignorePath, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith('!'));
}

module.exports = { getGitignoreExcludes };
