#!/usr/bin/env node
/**
 * Bumps the app version after every commit, based on the commit message
 * (Conventional Commits), and folds the change into that same commit.
 * Run by .githooks/post-commit. Install once with: npm run hooks:install
 *
 * Prototype phase (0.x, nothing is final yet):
 *   feat!: … / BREAKING CHANGE   -> minor   0.3.4 -> 0.4.0
 *   feat: …                      -> minor   0.3.4 -> 0.4.0
 *   fix / perf / refactor / …    -> patch   0.3.4 -> 0.3.5
 *   docs / chore / style / test / ci / build -> no bump
 * From 1.0.0 on (set it by hand when the game ships), breaking changes bump major.
 *
 * Skipped for amends, merges, rebases, cherry-picks, messages containing
 * [skip version], and commits that only touch folders that aren't the game
 * (the website, the server, the admin console, tooling): only commits that
 * change something in game/ bump it. Keeps game/package.json and
 * game/app.json (Expo) in sync.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();
const root = git('rev-parse --show-toplevel');
const gitDir = path.resolve(root, git('rev-parse --git-dir'));

if (process.env.TILEPULSE_VERSION_BUMP) process.exit(0); // our own amend
// Rebases / cherry-picks replay old commits: leave them alone
for (const f of ['rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD', 'MERGE_HEAD']) {
  if (fs.existsSync(path.join(gitDir, f))) process.exit(0);
}
const action = git('reflog -1 --format=%gs');
if (/^commit \((amend|merge)\)/.test(action)) process.exit(0);

const message = git('log -1 --format=%B');
if (/\[skip version\]/i.test(message)) process.exit(0);

// The version is the game's: only commits that touch game/ bump it
const GAME_DIR = 'game/';
const changed = git('diff-tree --root --no-commit-id --name-only -r HEAD').split('\n').filter(Boolean);
// Web-only files (the web version on Vercel) don't change the app, so they don't bump its version
const WEB_ONLY = [/\.web\.(ts|tsx|js)$/, /^game\/public\//, /^game\/vercel\.json$/];
const isWebOnly = (f) => WEB_ONLY.some((re) => re.test(f));
if (!changed.some((f) => f.startsWith(GAME_DIR) && !isWebOnly(f))) process.exit(0);

const header = message.split('\n')[0];
const m = /^(\w+)(\([^)]*\))?(!)?:/.exec(header);
const type = m ? m[1].toLowerCase() : '';
const breaking = Boolean(m && m[3]) || /^BREAKING[ -]CHANGE:/m.test(message);
const NO_BUMP = ['docs', 'chore', 'style', 'test', 'ci', 'build'];
if (!m || (NO_BUMP.includes(type) && !breaking)) process.exit(0);

const pkgPath = path.join(root, 'game', 'package.json');
const appPath = path.join(root, 'game', 'app.json');
const files = [pkgPath, appPath].filter((f) => fs.existsSync(f));

// Don't sweep someone's unstaged edits to these files into the commit
const dirty = git(`status --porcelain -- ${files.map((f) => `"${path.relative(root, f)}"`).join(' ')}`);
if (dirty) {
  console.warn('[version] package.json/app.json have uncommitted changes; skipping the version bump.');
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const [major, minor, patch] = String(pkg.version || '0.0.0').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
let next;
if (breaking && major >= 1) next = [major + 1, 0, 0];
else if (breaking || type === 'feat') next = [major, minor + 1, 0];
else next = [major, minor, patch + 1];
const version = next.join('.');

/** Replace the first "version": "…" in a JSON file, keeping its formatting. */
function setVersion(file) {
  const text = fs.readFileSync(file, 'utf8');
  const out = text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
  if (out !== text) fs.writeFileSync(file, out);
}
files.forEach(setVersion);

const rel = files.map((f) => `"${path.relative(root, f)}"`).join(' ');
execSync(`git add ${rel}`, { cwd: root });
execSync('git commit --amend --no-edit --no-verify', {
  cwd: root,
  stdio: 'ignore',
  env: { ...process.env, TILEPULSE_VERSION_BUMP: '1' },
});
console.log(`[version] ${pkg.version} -> ${version} (${breaking ? 'breaking' : type})`);
